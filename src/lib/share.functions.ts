import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Link público de um vídeo pronto. O token é a única credencial e resolve
 * exclusivamente para o mp4 daquele job — nenhum outro dado é exposto.
 */

const SHARE_TTL = 60 * 60 * 6;

/** Token longo e imprevisível (32 chars hex + uuid). */
function newToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}${crypto.randomUUID().replace(/-/g, "")}`;
}

export type ShareRow = {
  id: string;
  token: string;
  ativo: boolean;
  expires_at: string | null;
  views: number;
  created_at: string;
};

/** Links de compartilhamento existentes de um job. */
export const listJobShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("job_shares")
      .select("id, token, ativo, expires_at, views, created_at")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ShareRow[];
  });

/** Cria um link público para o vídeo do job. */
export const createJobShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), dias: z.number().int().min(1).max(365).nullable().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error: jobError } = await context.supabase
      .from("jobs")
      .select("id, video_path, video_url")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Vídeo não encontrado.");
    if (!job.video_path && !job.video_url) throw new Error("Este job ainda não tem vídeo pronto.");

    const expires = data.dias ? new Date(Date.now() + data.dias * 86400000).toISOString() : null;
    const { data: row, error } = await context.supabase
      .from("job_shares")
      .insert({ job_id: data.jobId, token: newToken(), expires_at: expires, created_by: context.userId })
      .select("id, token, ativo, expires_at, views, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ShareRow;
  });

/** Revoga (ou reativa) um link público. */
export const setJobShareActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ shareId: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("job_shares")
      .update({ ativo: data.ativo })
      .eq("id", data.shareId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Página pública: resolve o token para o vídeo assinado. Sem autenticação
 * por design, mas devolve apenas título e vídeo daquele job.
 */
export const getSharedVideo = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(16).max(128) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share } = await supabaseAdmin
      .from("job_shares")
      .select("id, job_id, ativo, expires_at, views")
      .eq("token", data.token)
      .maybeSingle();

    if (!share || !share.ativo) return { ok: false as const };
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return { ok: false as const };

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("title, video_path, video_thumbnail_path")
      .eq("id", share.job_id)
      .maybeSingle();
    if (!job?.video_path) return { ok: false as const };

    const [video, thumb] = await Promise.all([
      supabaseAdmin.storage.from("job-media").createSignedUrl(job.video_path, SHARE_TTL),
      job.video_thumbnail_path
        ? supabaseAdmin.storage.from("job-media").createSignedUrl(job.video_thumbnail_path, SHARE_TTL)
        : Promise.resolve({ data: null }),
    ]);
    if (!video.data?.signedUrl) return { ok: false as const };

    await supabaseAdmin
      .from("job_shares")
      .update({ views: (share.views ?? 0) + 1 })
      .eq("id", share.id);

    return {
      ok: true as const,
      title: (job.title as string) || "",
      videoUrl: video.data.signedUrl,
      thumbnailUrl: thumb.data?.signedUrl ?? null,
    };
  });
