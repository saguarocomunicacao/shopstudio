import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehLinkTiktok } from "./metricas-calc";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function podeVerMetricas(supabase: Any, profileId: string) {
  const { data } = await supabase.rpc("minhas_permissoes");
  const { data: bo } = await supabase.rpc("is_backoffice");
  if (bo) return true;
  return ((data ?? []) as Any[]).some((p) => p.module === "metricas" && p.action === "visualizar" && (p.profile_id === profileId || p.profile_id === null));
}

async function assertEditar(supabase: Any, profileId: string) {
  const { data, error } = await supabase.rpc("can_edit_pipeline", { _profile_id: profileId });
  if (error || !data) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
}

/** Dados da tela Métricas (snapshots já lidos com o login do usuário). */
export const getMetricas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), dias: z.number().int().min(1).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    if (!(await podeVerMetricas(db, data.profileId))) return { semPermissao: true as const };
    const desde = new Date(Date.now() - (Math.max(data.dias, 30) + 8) * 86400_000).toISOString().slice(0, 10);
    const [perfil, coleta, prof, jobs, videos, naoVinc, pubNaoVinc] = await Promise.all([
      db.from("perfil_metricas").select("data, seguidores, seguindo, curtidas_total, videos_total").eq("profile_id", data.profileId).gte("data", desde).order("data"),
      db.from("metricas_coleta").select("status, ultima_coleta_em, ultimo_erro, ultimo_manual_em, iniciado_em").eq("profile_id", data.profileId).maybeSingle(),
      db.from("profiles").select("handle").eq("id", data.profileId).maybeSingle(),
      db.from("jobs").select("id, title, formato, video_choice, published_at, tiktok_video_id, tiktok_video_url").eq("profile_id", data.profileId).eq("status", "publicado").is("deleted_at", null).order("published_at", { ascending: false }).limit(200),
      db.from("video_metricas").select("tiktok_video_id, job_id, data, views, likes, comentarios, compartilhamentos, salvos, reposts").eq("profile_id", data.profileId).gte("data", desde).order("data").limit(10000),
      db.from("videos_nao_vinculados").select("id", { count: "exact", head: true }).eq("profile_id", data.profileId).is("vinculado_job_id", null),
      db.from("videos_nao_vinculados").select("tiktok_video_id, publicado_em").eq("profile_id", data.profileId).limit(500),
    ]);
    return {
      semPermissao: false as const,
      handle: (prof.data?.handle ?? "").replace(/^@/, "").trim(),
      coleta: coleta.data ?? null,
      perfil: perfil.data ?? [],
      jobs: jobs.data ?? [],
      videos: videos.data ?? [],
      naoVinculados: naoVinc.count ?? 0,
      pubNaoVinc: (pubNaoVinc.data ?? []) as { tiktok_video_id: string; publicado_em: string | null }[],
    };
  });

/** Botão "Atualizar agora" (1 por hora por perfil). */
export const atualizarMetricasAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await podeVerMetricas(context.supabase, data.profileId))) throw new Error("Você não tem acesso às métricas deste perfil.");
    const { data: p } = await context.supabase.from("profiles").select("tenant_id").eq("id", data.profileId).maybeSingle();
    if (!p) throw new Error("Perfil não encontrado.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["apify"]);
    const { iniciarColeta } = await import("./metricas.server");
    await iniciarColeta(data.profileId, true);
    return { ok: true };
  });

/** Enquanto a tela está aberta, avança a coleta em andamento. */
export const avancarColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("metricas_coleta").select("status").eq("profile_id", data.profileId).maybeSingle();
    if (c?.status !== "coletando") return { status: c?.status ?? "nunca" };
    const { processarColeta } = await import("./metricas.server");
    return { status: await processarColeta(data.profileId) };
  });

/** Salva o link do TikTok num job publicado. */
export const salvarLinkTiktok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), url: z.string().trim().min(8).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!ehLinkTiktok(data.url)) throw new Error("Cole o link do vídeo no TikTok (tiktok.com).");
    const { data: job } = await context.supabase.from("jobs").select("id, profile_id").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Vídeo não encontrado.");
    await assertEditar(context.supabase, job.profile_id);
    const { resolverLinkTiktok, ligarHistorico } = await import("./metricas.server");
    const r = await resolverLinkTiktok(data.url);
    if (!r) throw new Error("Não reconhecemos esse link. Abra o vídeo no TikTok, toque em Compartilhar > Copiar link e cole aqui.");
    const { data: dup } = await context.supabase.from("jobs").select("id").eq("profile_id", job.profile_id).eq("tiktok_video_id", r.id).neq("id", job.id).is("deleted_at", null).limit(1);
    if (dup?.length) throw new Error("Esse vídeo do TikTok já está vinculado a outro item deste perfil.");
    const { error } = await context.supabase.from("jobs").update({ tiktok_video_url: r.url, tiktok_video_id: r.id, published_url: r.url }).eq("id", job.id);
    if (error) throw new Error("Não foi possível salvar o link.");
    await ligarHistorico(job.profile_id, r.id, job.id);
    return { ok: true, url: r.url, id: r.id };
  });

/** Vídeos do perfil no TikTok que ainda não têm job (sugestões do "Vincular vídeo externo"). */
export const listarVideosNaoVinculados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("videos_nao_vinculados")
      .select("id, tiktok_video_id, url, legenda, capa_url, publicado_em")
      .eq("profile_id", data.profileId)
      .is("vinculado_job_id", null)
      .order("publicado_em", { ascending: false })
      .limit(50);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const videos = await Promise.all(
      ((rows ?? []) as Any[]).map(async (r) => ({
        ...r,
        capa: r.capa_url ? (await supabaseAdmin.storage.from("job-media").createSignedUrl(r.capa_url, 900)).data?.signedUrl ?? null : null,
      })),
    );
    return { videos };
  });

/** Cria um job mínimo (formato "externo") para acompanhar métricas de um vídeo publicado fora do Shop Studio. */
export const vincularVideoExterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), url: z.string().trim().min(8).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!ehLinkTiktok(data.url)) throw new Error("Cole o link do vídeo no TikTok (tiktok.com).");
    await assertEditar(context.supabase, data.profileId);
    const { resolverLinkTiktok, ligarHistorico } = await import("./metricas.server");
    const r = await resolverLinkTiktok(data.url);
    if (!r) throw new Error("Não reconhecemos esse link. Abra o vídeo no TikTok, toque em Compartilhar > Copiar link e cole aqui.");
    const { data: dup } = await context.supabase.from("jobs").select("id").eq("profile_id", data.profileId).eq("tiktok_video_id", r.id).is("deleted_at", null).limit(1);
    if (dup?.length) throw new Error("Esse vídeo do TikTok já está vinculado a um item deste perfil.");
    const { data: sug } = await context.supabase.from("videos_nao_vinculados").select("legenda, capa_url, publicado_em").eq("profile_id", data.profileId).eq("tiktok_video_id", r.id).maybeSingle();
    const titulo = (sug?.legenda ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Vídeo externo do TikTok";
    const { data: job, error } = await context.supabase
      .from("jobs")
      .insert({
        profile_id: data.profileId, title: titulo, status: "publicado", formato: "externo",
        published_at: sug?.publicado_em ?? new Date().toISOString(), published_url: r.url,
        tiktok_video_url: r.url, tiktok_video_id: r.id, caption: sug?.legenda ?? null,
        video_thumbnail_path: sug?.capa_url ?? null,
      } as never)
      .select("id")
      .single();
    if (error || !job) {
      console.error("[metricas] vincular externo", error);
      throw new Error("Não foi possível vincular esse vídeo.");
    }
    await ligarHistorico(data.profileId, r.id, (job as Any).id);
    return { ok: true, jobId: (job as Any).id as string };
  });
