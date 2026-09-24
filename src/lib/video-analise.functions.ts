import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export type { ResultadoAnalise } from "./video-analise-schema";

const REDES = ["youtube", "tiktok", "instagram"] as const;

export const criarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        origem: z.enum(["arquivo", "link"]),
        linkUrl: z.string().trim().max(500).nullable(),
        mimeType: z.string().max(100).nullable(),
        titulo: z.string().trim().max(200),
        duracao: z.number().min(0).max(36000).nullable(),
        pergunta: z.string().trim().max(1000).nullable(),
        arquivoBytes: z.number().int().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: data.profileId });
    if (!ok) throw new Error("Você não tem permissão para criar conteúdo neste perfil.");
    let rede: (typeof REDES)[number] | null = null;
    if (data.origem === "link") {
      const { detectarRede } = await import("./apify.server");
      rede = detectarRede(data.linkUrl ?? "");
      if (!rede) throw new Error("Ainda não suportado. Use um link do TikTok, YouTube ou Instagram.");
    }
    const { assertSaldoPerfil, tenantOfProfile } = await import("./saldo.server");
    await assertSaldoPerfil(data.profileId, { analise_video: 1 });
    const tenantId = await tenantOfProfile(data.profileId);
    if (!tenantId) throw new Error("Perfil não encontrado.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(tenantId, rede ? ["apify", "gemini"] : ["gemini"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = crypto.randomUUID();
    const storagePath = data.origem === "arquivo" ? `${tenantId}/${data.profileId}/${id}/video` : null;
    const nomeRede = rede === "tiktok" ? "TikTok" : rede === "instagram" ? "Instagram" : "YouTube";
    const { error } = await supabaseAdmin.from("video_analises").insert({
      id,
      tenant_id: tenantId,
      profile_id: data.profileId,
      created_by: context.userId,
      origem: rede ?? "arquivo",
      link_url: rede ? data.linkUrl : null,
      storage_path: storagePath,
      mime_type: data.mimeType,
      titulo: data.titulo || (rede ? `Vídeo do ${nomeRede}` : "Vídeo enviado"),
      duracao: data.duracao,
      pergunta: data.pergunta || null,
      arquivo_nome: rede ? null : data.titulo || null,
      arquivo_bytes: rede ? null : (data.arquivoBytes ?? null),
      etapa_log: [{ etapa: rede ? "baixando" : "enviado", em: new Date().toISOString() }],
      status: rede ? "baixando" : "enviando",
    } as never);
    if (error) {
      console.error("[analise] insert", error.message);
      throw new Error("Não foi possível iniciar a análise.");
    }
    if (rede) {
      const { comecarDownload } = await import("./video-analise.server");
      const r = await comecarDownload({ id, tenant_id: tenantId, origem: rede, link_url: data.linkUrl, youtube_url: null });
      if (!r.ok) throw new Error(r.erro);
    }
    return { id, storagePath };
  });

async function carregar(context: { supabase: any }, id: string) {
  const { data: row } = await context.supabase.from("video_analises").select("*").eq("id", id).maybeSingle();
  if (!row) throw new Error("Análise não encontrada.");
  const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: row.profile_id });
  if (!ok) throw new Error("Você não tem permissão para analisar vídeos neste perfil.");
  return row as { id: string; tenant_id: string; profile_id: string; origem: string; link_url: string | null; youtube_url: string | null; storage_path: string | null };
}

export const executarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reanalisar: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await carregar(context, data.id);
    const srv = await import("./video-analise.server");
    // Link cujo download falhou antes de existir arquivo: baixa de novo.
    if (row.origem !== "arquivo" && !row.storage_path && row.link_url) {
      if (data.reanalisar) {
        const { assertSaldoPerfil } = await import("./saldo.server");
        await assertSaldoPerfil(row.profile_id, { analise_video: 1 });
      }
      const r = await srv.comecarDownload(row);
      return r.ok ? { ok: true, baixando: true } : r;
    }
    const r = await srv.iniciarAnalise(row.id, data.reanalisar);
    return r.ok ? { ok: true, emAndamento: true } : r;
  });

/** Avança uma etapa da análise (chamado pela tela enquanto ela estiver aberta; o cron é a rede de segurança). */
export const avancarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await carregar(context, data.id);
    const srv = await import("./video-analise.server");
    return { r: await srv.avancarAnalise(row.id) };
  });

/** Análises antigas do YouTube (por URL): baixa o MP4 sem refazer a análise. */
export const baixarVideoDaAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await carregar(context, data.id);
    const url = row.link_url || row.youtube_url;
    if (row.storage_path || !url) throw new Error("Este vídeo já está salvo.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(row.tenant_id, ["apify"]);
    const srv = await import("./video-analise.server");
    const r = await srv.comecarDownload({ ...row, link_url: url }, true);
    if (!r.ok) throw new Error(r.erro);
    return { ok: true };
  });
