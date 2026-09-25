import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function podeVer(supabase: Any, profileId: string) {
  const { data: bo } = await supabase.rpc("is_backoffice");
  if (bo) return true;
  const { data } = await supabase.rpc("minhas_permissoes");
  return ((data ?? []) as Any[]).some((p) => p.module === "metricas" && p.action === "visualizar" && (p.profile_id === profileId || p.profile_id === null));
}

const vidDe = (url: string) => url.match(/\/(?:video|photo)\/(\d{8,25})/)?.[1] ?? null;

/** Estado da leitura de comentários de um vídeo (para o perfil). Avança o processamento se estiver em andamento. */
export const getComentarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), url: z.string().min(10).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    if (!(await podeVer(db, data.profileId))) return { semPermissao: true as const, coleta: null, insights: null, comentarios: [] as Any[], podeEditar: false };
    const vid = vidDe(data.url);
    const { data: podeEditar } = await db.rpc("can_edit_pipeline", { _profile_id: data.profileId });
    if (!vid) return { semPermissao: false as const, coleta: null, insights: null, comentarios: [] as Any[], podeEditar: !!podeEditar };
    let { data: col } = await db.from("video_comentarios_coletas").select("id, status, erro, qtd, n_comentarios, custo_usd, titulo, updated_at").eq("profile_id", data.profileId).eq("tiktok_video_id", vid).maybeSingle();
    if (col && ["coletando", "classificando"].includes((col as Any).status)) {
      const { processarLeitura } = await import("./comentarios.server");
      await processarLeitura((col as Any).id).catch((e) => console.error("[comentarios] avançar", e));
      ({ data: col } = await db.from("video_comentarios_coletas").select("id, status, erro, qtd, n_comentarios, custo_usd, titulo, updated_at").eq("id", (col as Any).id).maybeSingle());
    }
    if (!col) return { semPermissao: false as const, coleta: null, insights: null, comentarios: [] as Any[], podeEditar: !!podeEditar };
    const c = col as Any;
    const [{ data: ins }, { data: coms }] = await Promise.all([
      db.from("video_comentarios_insights").select("insights").eq("coleta_id", c.id).maybeSingle(),
      db.from("video_comentarios").select("id, texto, likes, data, autor, respostas, fixado, curtido_dono, categoria, subtipo").eq("coleta_id", c.id).order("likes", { ascending: false }).limit(300),
    ]);
    return { semPermissao: false as const, coleta: c, insights: ((ins as Any)?.insights ?? null) as Any, comentarios: (coms ?? []) as Any[], podeEditar: !!podeEditar };
  });

export const lerComentarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      profileId: z.string().uuid(), url: z.string().min(10).max(500), titulo: z.string().max(300).nullable().optional(),
      origem: z.string().max(40).nullable().optional(), qtd: z.union([z.literal(50), z.literal(100), z.literal(200)]), forcar: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: data.profileId });
    if (!ok) throw new Error("Você não tem permissão para ler comentários neste perfil.");
    const { data: p } = await context.supabase.from("profiles").select("tenant_id").eq("id", data.profileId).maybeSingle();
    if (!p) throw new Error("Perfil não encontrado.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["apify", "gemini"]);
    const { assertSaldoPerfil } = await import("./saldo.server");
    await assertSaldoPerfil(data.profileId, { analise_video: 1 });
    const { iniciarLeitura } = await import("./comentarios.server");
    const id = await iniciarLeitura({ ...data, tenantId: p.tenant_id, userId: context.userId });
    return { id };
  });

/** Liga/desliga "Ler comentários dos campeões ao gerar roteiro" no perfil. */
export const setLerComentariosCampeoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), ligado: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_edit_profile", { _profile_id: data.profileId });
    if (!ok) throw new Error("Você não tem permissão para editar este perfil.");
    const { error } = await context.supabase.from("profiles").update({ ler_comentarios_campeoes: data.ligado }).eq("id", data.profileId);
    if (error) throw new Error("Não foi possível salvar.");
    return { ok: true };
  });

/** Salva o bloco "Contexto dos compradores" de um job (editável). */
export const salvarContextoCompradores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), texto: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("jobs").select("profile_id").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Job não encontrado.");
    const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: job.profile_id });
    if (!ok) throw new Error("Você não tem permissão para editar este job.");
    const { error } = await context.supabase.from("jobs").update({ contexto_compradores: data.texto.trim() || null }).eq("id", data.jobId);
    if (error) throw new Error("Não foi possível salvar.");
    return { ok: true };
  });
