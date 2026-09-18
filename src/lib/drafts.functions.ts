import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractHookFromScript } from "@/lib/script-parser";

/**
 * Fila de rascunhos: o vídeo renderizado é copiado para o nosso bucket privado
 * (o JSON2Video apaga o arquivo em 7 dias) e vira um kit de postagem manual.
 */

const SIGNED_TTL = 60 * 60 * 6;

const jobInput = (data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data);

async function sign(path: string | null | undefined) {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("job-media").createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

/**
 * Garante que o mp4 (e a miniatura) do job estejam no nosso storage.
 * A cópia em si vive em video-storage.server (com status, log e retry).
 */
export async function storeJobVideo(jobId: string, opts: { force?: boolean } = {}) {
  const { ensureJobVideoStored } = await import("./video-storage.server");
  return ensureJobVideoStored(jobId, opts);
}

type KitRow = {
  id: string;
  profile_id: string;
  status: string;
  title: string;
  hook: string | null;
  post_cta: string | null;
  caption: string | null;
  hashtags: string[] | null;
  script: string | null;
  video_url: string | null;
  video_path: string | null;
  video_thumbnail_path: string | null;
  video_storage_status: string | null;
  video_storage_error: string | null;
  published_url: string | null;
  rejection_reason: string | null;
  product_id: string | null;
};

const KIT_COLUMNS =
  "id, profile_id, status, title, hook, post_cta, caption, hashtags, script, video_url, video_path, video_thumbnail_path, video_storage_status, video_storage_error, published_url, rejection_reason, product_id";

/** Kit de postagem de um rascunho: vídeo do nosso storage + textos prontos. */
export const getDraftKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select(KIT_COLUMNS)
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");
    const row = job as KitRow;

    let videoPath = row.video_path;
    const thumbPath = row.video_thumbnail_path;
    let storageStatus = (row.video_storage_status ?? "pendente") as string;
    let storageError: string | null = row.video_storage_error ?? null;

    // Se o vídeo ainda não foi copiado, tenta agora (o link do render expira).
    if (!videoPath && row.video_url) {
      const stored = await storeJobVideo(row.id);
      videoPath = stored.videoPath;
      storageStatus = stored.status;
      storageError = stored.error ?? null;
    }

    const [settings, product] = await Promise.all([
      context.supabase
        .from("profile_video_settings")
        .select("require_review")
        .eq("profile_id", row.profile_id)
        .maybeSingle(),
      row.product_id
        ? context.supabase.from("products").select("name, url, image_url").eq("id", row.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      id: row.id,
      status: row.status,
      title: row.title,
      hook: row.hook ?? extractHookFromScript(row.script) ?? "",
      postCta: row.post_cta ?? "",
      caption: row.caption ?? "",
      hashtags: row.hashtags ?? [],
      script: row.script ?? "",
      videoUrl: (await sign(videoPath)) ?? null,
      thumbnailUrl: await sign(thumbPath),
      stored: !!videoPath,
      storageStatus,
      storageError,
      publishedUrl: row.published_url,
      rejectionReason: row.rejection_reason,
      requireReview: settings.data?.require_review ?? true,
      product: product.data
        ? { name: product.data.name as string, url: product.data.url as string }
        : null,
    };
  });

/** Salva somente os textos usados na publicação, sem alterar roteiro, cenas ou vídeo. */
export const saveDraftPostTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      postCta: z.string().trim().max(500),
      caption: z.string().trim().max(5000),
      hashtags: z.array(z.string().trim().min(1).max(100)).max(30),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error: readError } = await context.supabase
      .from("jobs")
      .select("id, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.status !== "video_pronto" && job.status !== "rascunho_enviado") {
      throw new Error(job.status === "publicado" ? "Este vídeo já foi publicado." : "Os textos de postagem ainda não estão disponíveis nesta etapa.");
    }

    const { error } = await context.supabase
      .from("jobs")
      .update({
        post_cta: data.postCta,
        caption: data.caption || null,
        hashtags: data.hashtags,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Rede de segurança: ao abrir o Pipeline, salva um lote pequeno de vídeos do perfil
 * que ainda não têm cópia local (respeita o limite de tentativas).
 */
export const sweepProfileVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("jobs")
      .select("id")
      .eq("profile_id", data.profileId)
      .in("status", ["video_pronto", "rascunho_enviado", "publicado"])
      .is("video_path", null)
      .not("video_url", "is", null)
      .lt("video_storage_attempts", 6)
      .limit(2);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => (r as { id: string }).id);
    for (const id of ids) await storeJobVideo(id);
    return { processados: ids.length };
  });

/** Estado da cópia local do vídeo, para a UI mostrar progresso/falha real. */
export const getVideoStorageState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, video_url, video_path, video_storage_status, video_storage_error, video_storage_attempts, video_storage_updated_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    const row = job as {
      video_url: string | null;
      video_path: string | null;
      video_storage_status: string | null;
      video_storage_error: string | null;
      video_storage_attempts: number | null;
      video_storage_updated_at: string | null;
    };
    return {
      stored: !!row.video_path,
      hasRender: !!row.video_url,
      status: (row.video_path ? "salvo" : (row.video_storage_status ?? "pendente")) as string,
      error: row.video_storage_error,
      attempts: row.video_storage_attempts ?? 0,
      updatedAt: row.video_storage_updated_at,
    };
  });

/** Nova tentativa de salvar o vídeo no nosso storage. */
export const retryDraftVideoStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, video_url")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job?.video_url) throw new Error("Este job não tem vídeo renderizado para salvar.");
    const r = await storeJobVideo(job.id, { force: true });
    if (r.status !== "salvo") throw new Error(r.error ?? "Não foi possível salvar o vídeo.");
    return { ok: true };
  });

/** Aprova o rascunho: sai de "aguardando revisão". */
export const approveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: "rascunho_enviado", approved_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marca como publicado no TikTok, com o link do post quando houver. */
export const markDraftPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), url: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error: readError } = await context.supabase
      .from("jobs")
      .select("id, status, profile_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!job) throw new Error("Rascunho não encontrado.");

    const { data: settings } = await context.supabase
      .from("profile_video_settings")
      .select("require_review")
      .eq("profile_id", job.profile_id)
      .maybeSingle();
    if ((settings?.require_review ?? true) && job.status === "video_pronto") {
      throw new Error("Este perfil exige aprovação do rascunho antes de publicar.");
    }

    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "publicado",
        published_at: new Date().toISOString(),
        published_url: data.url?.trim() || null,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Rejeita o rascunho: devolve ao pipeline para refazer, ou descarta o job. */
export const rejectDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ jobId: z.string().uuid(), reason: z.string().trim().max(500).optional(), discard: z.boolean().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.discard) {
      const { error } = await context.supabase.from("jobs").delete().eq("id", data.jobId);
      if (error) throw new Error(error.message);
      return { ok: true, discarded: true };
    }
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "cenas_geradas",
        approved_at: null,
        published_at: null,
        published_url: null,
        rejection_reason: data.reason?.trim() || "Rascunho recusado na revisão.",
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true, discarded: false };
  });
