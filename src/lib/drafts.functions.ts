import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  "id, profile_id, status, title, caption, hashtags, script, video_url, video_path, video_thumbnail_path, video_storage_status, video_storage_error, published_url, rejection_reason, product_id";

/** Primeira linha do roteiro: serve de gancho/título sugerido. */
function hookFromScript(script: string | null) {
  if (!script) return null;
  const lines = script.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hook = lines.find((l) => /^gancho/i.test(l));
  if (hook) {
    const inline = hook.replace(/^gancho\s*[:\-–]?\s*/i, "").trim();
    if (inline) return inline;
    const idx = lines.indexOf(hook);
    return lines[idx + 1] ?? null;
  }
  return lines[0] ?? null;
}

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
      hook: hookFromScript(row.script),
      caption: row.caption ?? "",
      hashtags: row.hashtags ?? [],
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
