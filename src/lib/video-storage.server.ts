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
  track: VideoTrack = "principal",
) {
  const cols = TRACKS[track];
  const db = await admin();
  await db
    .from("jobs")
    .update({
      [cols.status]: status,
      ...(track === "principal" ? { video_storage_updated_at: new Date().toISOString() } : {}),
      ...extra,
    })
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

/** Trilha de vídeo: a principal (pipeline/gravação) ou a versão gerada por IA de um vídeo próprio. */
export type VideoTrack = "principal" | "ia";

type TrackCols = {
  url: string;
  path: string;
  thumbUrl: string;
  thumbPath: string;
  status: string;
  error: string;
};

const TRACKS: Record<VideoTrack, TrackCols> = {
  principal: {
    url: "video_url",
    path: "video_path",
    thumbUrl: "video_thumbnail_url",
    thumbPath: "video_thumbnail_path",
    status: "video_storage_status",
    error: "video_storage_error",
  },
  ia: {
    url: "ai_video_url",
    path: "ai_video_path",
    thumbUrl: "ai_video_thumbnail_url",
    thumbPath: "ai_video_thumbnail_path",
    status: "ai_video_storage_status",
    error: "ai_video_storage_error",
  },
};

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
  opts: { force?: boolean; track?: VideoTrack } = {},
): Promise<{ status: VideoStorageStatus; videoPath: string | null; error?: string }> {
  const track = opts.track ?? "principal";
  const cols = TRACKS[track];
  const db = await admin();
  const select =
    track === "principal"
      ? COLUMNS
      : `id, ${cols.url}, ${cols.thumbUrl}, ${cols.path}, ${cols.status}, video_storage_attempts, video_storage_updated_at`;
  const { data, error } = await db.from("jobs").select(select).eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  if (!row) throw new Error("Job não encontrado.");
  const videoUrl = (row[cols.url] as string | null) ?? null;
  const existingPath = (row[cols.path] as string | null) ?? null;
  if (existingPath && !opts.force) return { status: "salvo", videoPath: existingPath };
  if (!videoUrl) {
    await setStatus(jobId, "falhou", { [cols.error]: "O job não tem vídeo renderizado." }, track);
    return { status: "falhou", videoPath: null, error: "O job não tem vídeo renderizado." };
  }

  const updatedAt = row["video_storage_updated_at"] as string | null;
  const leaseAge = updatedAt ? Date.now() - Date.parse(updatedAt) : Infinity;
  if (!opts.force && row[cols.status] === "baixando" && leaseAge < LEASE_MS) {
    return { status: "baixando", videoPath: null };
  }

  const attempts = ((row["video_storage_attempts"] as number | null) ?? 0) + 1;
  await setStatus(jobId, "baixando", { video_storage_attempts: attempts, [cols.error]: null }, track);

  const prefixo = track === "ia" ? `${jobId}-ia` : jobId;
  try {
    const videoPath = await copyToStorage(videoUrl, `videos/${prefixo}.mp4`, "video/mp4");
    let thumbPath: string | null = null;
    const thumbUrl = (row[cols.thumbUrl] as string | null) ?? null;
    if (thumbUrl) {
      try {
        thumbPath = await copyToStorage(thumbUrl, `thumbs/${prefixo}.jpg`, "image/jpeg");
      } catch (e) {
        console.warn(`[video-storage] miniatura do job ${jobId} falhou:`, e);
      }
    }
    await setStatus(
      jobId,
      "salvo",
      {
        [cols.path]: videoPath,
        [cols.error]: null,
        ...(thumbPath ? { [cols.thumbPath]: thumbPath } : {}),
      },
      track,
    );
    return { status: "salvo", videoPath };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Falha desconhecida ao salvar o vídeo.";
    console.error(`[video-storage] job ${jobId} (${track}) tentativa ${attempts} falhou:`, motivo);
    await setStatus(jobId, "falhou", { [cols.error]: motivo }, track);
    return { status: "falhou", videoPath: null, error: motivo };
  }
}

/** Nova tentativa com backoff curto, usada logo após o webhook. */
export async function ensureJobVideoStoredWithRetry(jobId: string, tries = 3, track: VideoTrack = "principal") {
  let last: Awaited<ReturnType<typeof ensureJobVideoStored>> | null = null;
  for (let i = 0; i < tries; i++) {
    last = await ensureJobVideoStored(jobId, { force: i > 0, track });
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
