/**
 * Cópia do vídeo renderizado para o nosso bucket privado.
 *
 * O JSON2Video apaga o arquivo em 7 dias, então todo job em "vídeo pronto"
 * precisa de uma cópia nossa. O estado da cópia fica em jobs.video_storage_status
 * (pendente | baixando | salvo | falhou) para a UI nunca ficar em "preparando" eterno.
 */

export type VideoStorageStatus = "pendente" | "baixando" | "salvo" | "falhou";

const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Uma tentativa travada em "baixando" há mais que isso é considerada morta. */
const LEASE_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 6;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function setStatus(
  jobId: string,
  status: VideoStorageStatus,
  extra: Record<string, unknown> = {},
) {
  const db = await admin();
  await db
    .from("jobs")
    .update({ video_storage_status: status, video_storage_updated_at: new Date().toISOString(), ...extra })
    .eq("id", jobId);
}

/** Baixa um arquivo remoto e envia ao bucket privado. Erros nunca são silenciados. */
async function copyToStorage(url: string, path: string, contentType: string) {
  const started = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`download HTTP ${res.status} em ${path}`);
  const blob = await res.blob();
  const downloadMs = Date.now() - started;
  const db = await admin();
  const { error } = await db.storage.from("job-media").upload(path, blob, { contentType, upsert: true });
  if (error) {
    throw new Error(`upload falhou (${blob.size} bytes, download ${downloadMs}ms): ${error.message}`);
  }
  console.log(
    `[video-storage] ${path} salvo: ${blob.size} bytes, download ${downloadMs}ms, total ${Date.now() - started}ms`,
  );
  return path;
}

type JobRow = {
  id: string;
  video_url: string | null;
  video_thumbnail_url: string | null;
  video_path: string | null;
  video_storage_status: string | null;
  video_storage_attempts: number | null;
  video_storage_updated_at: string | null;
};

const COLUMNS =
  "id, video_url, video_thumbnail_url, video_path, video_storage_status, video_storage_attempts, video_storage_updated_at";

/**
 * Garante a cópia local do vídeo do job. Idempotente e com trava simples:
 * uma segunda execução concorrente sai sem refazer o download.
 */
export async function ensureJobVideoStored(
  jobId: string,
  opts: { force?: boolean } = {},
): Promise<{ status: VideoStorageStatus; videoPath: string | null; error?: string }> {
  const db = await admin();
  const { data, error } = await db.from("jobs").select(COLUMNS).eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  const job = data as JobRow | null;
  if (!job) throw new Error("Job não encontrado.");
  if (job.video_path && !opts.force) return { status: "salvo", videoPath: job.video_path };
  if (!job.video_url) {
    await setStatus(jobId, "falhou", { video_storage_error: "O job não tem vídeo renderizado." });
    return { status: "falhou", videoPath: null, error: "O job não tem vídeo renderizado." };
  }

  const leaseAge = job.video_storage_updated_at ? Date.now() - Date.parse(job.video_storage_updated_at) : Infinity;
  if (!opts.force && job.video_storage_status === "baixando" && leaseAge < LEASE_MS) {
    return { status: "baixando", videoPath: null };
  }

  const attempts = (job.video_storage_attempts ?? 0) + 1;
  await setStatus(jobId, "baixando", { video_storage_attempts: attempts, video_storage_error: null });

  try {
    const videoPath = await copyToStorage(job.video_url, `videos/${jobId}.mp4`, "video/mp4");
    let thumbPath: string | null = null;
    if (job.video_thumbnail_url) {
      try {
        thumbPath = await copyToStorage(job.video_thumbnail_url, `thumbs/${jobId}.jpg`, "image/jpeg");
      } catch (e) {
        console.warn(`[video-storage] miniatura do job ${jobId} falhou:`, e);
      }
    }
    await setStatus(jobId, "salvo", {
      video_path: videoPath,
      video_storage_error: null,
      ...(thumbPath ? { video_thumbnail_path: thumbPath } : {}),
    });
    return { status: "salvo", videoPath };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Falha desconhecida ao salvar o vídeo.";
    console.error(`[video-storage] job ${jobId} tentativa ${attempts} falhou:`, motivo);
    await setStatus(jobId, "falhou", { video_storage_error: motivo });
    return { status: "falhou", videoPath: null, error: motivo };
  }
}

/** Nova tentativa com backoff curto, usada logo após o webhook. */
export async function ensureJobVideoStoredWithRetry(jobId: string, tries = 3) {
  let last: Awaited<ReturnType<typeof ensureJobVideoStored>> | null = null;
  for (let i = 0; i < tries; i++) {
    last = await ensureJobVideoStored(jobId, { force: i > 0 });
    if (last.status === "salvo") return last;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  return last!;
}

/**
 * Varre jobs com vídeo pronto e sem cópia local e tenta salvar um lote pequeno.
 * Usado pela rotina agendada — pega tudo que ficou para trás.
 */
export async function sweepPendingVideos(limit = 3) {
  const db = await admin();
  const { data, error } = await db
    .from("jobs")
    .select(COLUMNS)
    .in("status", ["video_pronto", "rascunho_enviado", "publicado"])
    .is("video_path", null)
    .not("video_url", "is", null)
    .lt("video_storage_attempts", MAX_ATTEMPTS)
    .order("video_storage_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JobRow[];
  const results: { jobId: string; status: VideoStorageStatus; error?: string }[] = [];
  for (const row of rows) {
    const r = await ensureJobVideoStored(row.id, { force: true });
    results.push({ jobId: row.id, status: r.status, ...(r.error ? { error: r.error } : {}) });
  }
  return results;
}
