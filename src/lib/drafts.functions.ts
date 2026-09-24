import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractCtaFromScript, extractHookFromScript } from "@/lib/script-parser";

/**
 * Fila de rascunhos: o vídeo renderizado é copiado para o nosso bucket privado
 * (o JSON2Video apaga o arquivo em 7 dias) e vira um kit de postagem manual.
 */

const SIGNED_TTL = 60 * 60 * 6;

const jobInput = (data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data);

async function assertCanEditDraft(supabase: any, profileId: string) {
  const { data: canEdit, error } = await supabase.rpc("can_edit_pipeline", { _profile_id: profileId });
  if (error) throw new Error(error.message);
  if (!canEdit) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
}

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
  video_original_path: string | null;
  video_edits: unknown;
  video_thumbnail_path: string | null;
  video_storage_status: string | null;
  video_storage_error: string | null;
  published_url: string | null;
  rejection_reason: string | null;
  product_id: string | null;
  formato: string;
};

const KIT_COLUMNS =
  "id, profile_id, status, title, hook, post_cta, caption, hashtags, script, video_url, video_path, video_original_path, video_edits, video_thumbnail_path, video_storage_status, video_storage_error, published_url, rejection_reason, product_id, formato";

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
      postCta: row.post_cta ?? extractCtaFromScript(row.script) ?? "",
      caption: row.caption ?? "",
      hashtags: row.hashtags ?? [],
      script: row.script ?? "",
      videoUrl: (await sign(videoPath)) ?? null,
      thumbnailUrl: await sign(thumbPath),
      stored: !!videoPath,
      // Versão exibida é a editada quando existe; o original segue guardado.
      edited: !!row.video_original_path && !!videoPath && row.video_original_path !== videoPath,
      formato: row.formato,
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
      hook: z.string().trim().max(500),
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
        hook: data.hook || null,
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

/* ------------------------------------------------------------------ *
 * Retroceder etapa e Lixeira (exclusão em duas etapas)
 * ------------------------------------------------------------------ */

/** Volta o rascunho para a fase anterior da fila (uma por vez). */
export const moveDraftBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, status, formato")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");

    type BackPatch = {
      status: "rascunho_enviado" | "video_pronto" | "roteiro_pronto";
      published_at?: null;
      published_url?: null;
      approved_at?: null;
      recorded_at?: null;
    };
    let patch: BackPatch | null = null;
    if (job.status === "publicado") {
      patch = { status: "rascunho_enviado", published_at: null, published_url: null };
    } else if (job.status === "rascunho_enviado") {
      patch = { status: "video_pronto", approved_at: null };
    } else if (job.status === "video_pronto" && job.formato === "gravacao") {
      patch = { status: "roteiro_pronto", recorded_at: null, approved_at: null };
    }
    if (!patch) throw new Error("Este vídeo já está na primeira etapa da fila.");

    const { error: upError } = await context.supabase.from("jobs").update(patch).eq("id", data.jobId);
    if (upError) throw new Error(upError.message);
    return { ok: true };
  });

/** Move o rascunho para a Lixeira (soft delete), guardando a fase de origem. */
export const trashDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, status, deleted_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");
    if (job.deleted_at) return { ok: true };

    const { error: upError } = await context.supabase
      .from("jobs")
      .update({ deleted_at: new Date().toISOString(), deleted_from_status: job.status })
      .eq("id", data.jobId);
    if (upError) throw new Error(upError.message);
    return { ok: true };
  });

/** Tira o item da Lixeira e devolve à fase em que estava. */
export const restoreDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, status, deleted_from_status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");

    const { error: upError } = await context.supabase
      .from("jobs")
      .update({
        deleted_at: null,
        deleted_from_status: null,
        status: job.deleted_from_status ?? job.status,
      })
      .eq("id", data.jobId);
    if (upError) throw new Error(upError.message);
    return { ok: true };
  });

/** Exclusão permanente: registro, arquivos no storage e links públicos. */
export const purgeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, video_path, video_original_path, video_thumbnail_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");

    const { error: sharesError } = await context.supabase.from("job_shares").delete().eq("job_id", job.id);
    if (sharesError) throw new Error(sharesError.message);

    const { data: deleted, error: deleteError } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", job.id)
      .select("id")
      .maybeSingle();
    if (deleteError) throw new Error(deleteError.message);
    if (!deleted) throw new Error("Você não tem permissão para excluir este vídeo.");

    const arquivos = [
      ...new Set(
        [job.video_path, job.video_original_path, job.video_thumbnail_path].filter((p): p is string => !!p),
      ),
    ];
    if (arquivos.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: storageError } = await supabaseAdmin.storage.from("job-media").remove(arquivos);
      if (storageError) console.error("Falha ao limpar arquivos do job excluído", { jobId: job.id, message: storageError.message });
    }
    return { ok: true };
  });

/**
 * Links assinados do vídeo/miniatura de vários rascunhos, para o card mostrar
 * preview de verdade (o frame do próprio vídeo) em vez de um bloco preto.
 */
export const getDraftPreviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobIds: z.array(z.string().uuid()).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!data.jobIds.length) return { previews: [] as { id: string; videoUrl: string | null; thumbnailUrl: string | null; aiThumbnailUrl: string | null }[] };
    const { data: rows, error } = await context.supabase
      .from("jobs")
      .select("id, video_path, video_thumbnail_path, video_thumbnail_url, ai_video_thumbnail_path, ai_video_thumbnail_url")
      .in("id", data.jobIds);
    if (error) throw new Error(error.message);
    const previews = await Promise.all(
      (rows ?? []).map(async (row) => ({
        id: row.id as string,
        videoUrl: await sign(row.video_path as string | null),
        thumbnailUrl: (await sign(row.video_thumbnail_path as string | null)) ?? (row.video_thumbnail_url as string | null),
        aiThumbnailUrl: (await sign(row.ai_video_thumbnail_path as string | null)) ?? (row.ai_video_thumbnail_url as string | null),
      })),
    );
    return { previews };
  });

/** Prepara o envio privado de uma miniatura extraída no navegador. */
export const createDraftThumbnailUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");
    await assertCanEditDraft(context.supabase, job.profile_id);

    const path = `thumbs/${job.id}-${Date.now()}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("job-media")
      .createSignedUploadUrl(path);
    if (signError || !signed) throw new Error(signError?.message ?? "Não foi possível preparar a miniatura.");
    return { path, token: signed.token };
  });

/** Associa a miniatura enviada ao job e remove a anterior quando necessário. */
export const saveDraftThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), path: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, video_thumbnail_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Rascunho não encontrado.");
    if (!data.path.startsWith(`thumbs/${job.id}-`)) throw new Error("Miniatura inválida para este rascunho.");
    await assertCanEditDraft(context.supabase, job.profile_id);

    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({ video_thumbnail_path: data.path })
      .eq("id", job.id);
    if (updateError) throw new Error(updateError.message);
    if (job.video_thumbnail_path && job.video_thumbnail_path !== data.path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("job-media").remove([job.video_thumbnail_path]);
    }
    return { ok: true };
  });

/**
 * Duplica um job em qualquer status: cópia fiel e independente (textos, configs,
 * personas, estilo, voz e arquivos copiados no storage), sempre nascendo em rascunho.
 */
export const duplicateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(jobInput)
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase.from("jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Vídeo não encontrado.");
    await assertCanEditDraft(context.supabase, job.profile_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = Date.now();
    const copied: string[] = [];
    const copyFile = async (path: string | null) => {
      if (!path) return null;
      const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const target = `${dir}copia-${crypto.randomUUID()}-${stamp}${ext}`;
      const { error: cpError } = await supabaseAdmin.storage.from("job-media").copy(path, target);
      if (cpError) {
        console.error("Falha ao copiar arquivo do job", { jobId: job.id, path, message: cpError.message });
        throw new Error("Não foi possível copiar os arquivos de vídeo. Tente novamente.");
      }
      copied.push(target);
      return target;
    };

    try {
      // Mesmo arquivo pode estar em mais de uma coluna: copia uma vez só.
      const cache = new Map<string, string | null>();
      const dup = async (p: string | null) => {
        if (!p) return null;
        if (!cache.has(p)) cache.set(p, await copyFile(p));
        return cache.get(p)!;
      };
      const {
        id: _id, created_at: _c, updated_at: _u, created_by: _cb,
        ...rest
      } = job as Record<string, unknown> & typeof job;
      const title = job.title.trim().endsWith("(cópia)") ? job.title : `${job.title} (cópia)`;
      const insert = {
        ...rest,
        title,
        created_by: context.userId,
        status: "roteiro_pronto" as const,
        recorded_at: null,
        approved_at: null,
        published_at: null,
        published_url: null,
        rejection_reason: null,
        deleted_at: null,
        deleted_from_status: null,
        automation_schedule_id: null,
        render_id: null,
        render_error: null,
        render_stage: null,
        render_started_at: null,
        ai_status: null,
        ai_render_stage: null,
        ai_render_id: null,
        ai_render_error: null,
        ai_render_started_at: null,
        video_storage_attempts: 0,
        video_storage_error: null,
        video_path: await dup(job.video_path),
        video_original_path: await dup(job.video_original_path),
        video_edited_path: await dup(job.video_edited_path),
        video_thumbnail_path: await dup(job.video_thumbnail_path),
        ai_video_path: await dup(job.ai_video_path),
        ai_video_thumbnail_path: await dup(job.ai_video_thumbnail_path),
      };
      const { data: novo, error: insError } = await context.supabase
        .from("jobs")
        .insert(insert as never)
        .select("id")
        .single();
      if (insError) throw new Error(insError.message);
      return { jobId: novo.id as string };
    } catch (e) {
      if (copied.length) await supabaseAdmin.storage.from("job-media").remove(copied);
      throw e;
    }
  });

/** Links das versões ainda sem duração registrada (backfill no navegador). */
export const getMissingDurationSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobIds: z.array(z.string().uuid()).max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    if (!data.jobIds.length) return { items: [] as Array<{ id: string; original: string | null; edited: string | null; ai: string | null }> };
    const { data: rows } = await context.supabase
      .from("jobs")
      .select("id, video_original_path, video_edited_path, ai_video_path, ai_video_url, video_original_duracao, video_edited_duracao, ai_video_duracao")
      .in("id", data.jobIds);
    const items = [];
    for (const r of (rows ?? []) as Array<Record<string, any>>) {
      const original = r["video_original_path"] && r["video_original_duracao"] == null ? await sign(r["video_original_path"]) : null;
      const edited = r["video_edited_path"] && r["video_edited_duracao"] == null ? await sign(r["video_edited_path"]) : null;
      const ai = (r["ai_video_path"] || r["ai_video_url"]) && r["ai_video_duracao"] == null ? (await sign(r["ai_video_path"])) ?? r["ai_video_url"] : null;
      if (original || edited || ai) items.push({ id: r["id"] as string, original, edited, ai });
    }
    return { items };
  });
