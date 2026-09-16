import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Orquestração do vídeo profissional com pessoa usando o produto.
 * Cada chamada executa UMA etapa (idempotente) para não estourar o tempo
 * de requisição: planejar cenas -> gerar imagens -> animar takes -> montar.
 */

const J2V_ENDPOINT = "https://api.json2video.com/v2/movies";
const PUBLIC_BASE = "https://project--c5a0c6dd-28ab-4eee-a22b-3c59cd2e5a81.lovable.app";

export const RENDER_STAGE_LABELS: Record<string, string> = {
  planejando: "Planejando as cenas",
  cenas: "Gerando as cenas",
  takes: "Animando os takes",
  montagem: "Montando o vídeo",
  render: "Finalizando a montagem",
};

type JobRow = {
  id: string;
  product_id: string | null;
  profile_id: string;
  status: string;
  script: string | null;
  caption: string | null;
  render_stage: string | null;
  scenes: unknown;
  gemini_images_count: number;
  veo_takes_count: number;
};

/** Quebra o roteiro salvo (GANCHO / CORPO / CTA) nos blocos narrados. */
export function splitScript(script: string): string[] {
  const clean = script.replace(/\r/g, "").trim();
  if (!clean) return [];
  const blocks = clean
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^\s*(GANCHO[^\n]*|CORPO[^\n]*|CTA[^\n]*)\n?/i, "").trim())
    .filter(Boolean);
  return blocks.length ? blocks : [clean];
}

const input = (data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data);

/** Carrega o job, valida permissão de pipeline e devolve os dados. */
async function loadJob(supabase: any, jobId: string): Promise<JobRow> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, product_id, profile_id, status, script, caption, render_stage, scenes, gemini_images_count, veo_takes_count")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Job não encontrado ou sem permissão de acesso.");

  const { data: canEdit, error: permError } = await supabase.rpc("can_edit_pipeline", { _profile_id: job.profile_id });
  if (permError) throw new Error(permError.message);
  if (!canEdit) throw new Error("Você não tem permissão para gerar vídeo neste perfil.");
  return job as JobRow;
}

/** Inicia o processo: limpa o estado anterior e coloca o job em "gerando_video". */
export const generateJobVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);

    if (job.status !== "roteiro_pronto") {
      throw new Error("O vídeo só pode ser gerado quando o roteiro está pronto.");
    }
    if (!splitScript(job.script ?? "").length) {
      throw new Error("Este job ainda não tem roteiro para narrar.");
    }
    if (!process.env["GEMINI_API_KEY"]) {
      throw new Error("A geração de vídeo ainda não está configurada. Falta a chave do Google (Gemini/Veo).");
    }
    if (!process.env["JSON2VIDEO_API_KEY"]) {
      throw new Error("A geração de vídeo ainda não está configurada. Falta a chave do JSON2Video.");
    }

    const { error } = await supabase
      .from("jobs")
      .update({
        status: "gerando_video",
        render_stage: "planejando",
        render_started_at: new Date().toISOString(),
        render_error: null,
        render_id: null,
        scenes: [],
        gemini_images_count: 0,
        veo_takes_count: 0,
        video_url: null,
        video_thumbnail_url: null,
      })
      .eq("id", job.id);
    if (error) throw new Error(error.message);

    return { stage: "planejando" as const };
  });

/** Executa a próxima etapa pendente do job (chamada repetidamente pela tela). */
export const advanceJobVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);

    if (job.status !== "gerando_video" || !job.render_stage || job.render_stage === "render") {
      return { stage: job.render_stage, done: true, progress: null };
    }

    const pipeline = await import("./video-pipeline.server");

    try {
      return await runStep(supabase, job, pipeline);
    } catch (e) {
      const message = e instanceof Error ? e.message : "A geração do vídeo falhou.";
      await supabase
        .from("jobs")
        .update({ status: "roteiro_pronto", render_stage: null, render_error: message })
        .eq("id", job.id);
      throw new Error(message);
    }
  });

async function runStep(
  supabase: any,
  job: JobRow,
  pipeline: typeof import("./video-pipeline.server"),
) {
  const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as import("./video-pipeline.server").Scene[];

  const [{ data: product }, { data: identity }, { data: profile }, { data: settingsRow }] = await Promise.all([
    job.product_id
      ? supabase.from("products").select("name, price, commission, image_url, niche").eq("id", job.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profile_identities").select("tone, language, style_notes").eq("profile_id", job.profile_id).maybeSingle(),
    supabase.from("profiles").select("name, niche").eq("id", job.profile_id).maybeSingle(),
    supabase
      .from("profile_video_settings")
      .select("avatar_mode, avatar_reference_url, takes_count, gemini_model, veo_model, take_duration")
      .eq("profile_id", job.profile_id)
      .maybeSingle(),
  ]);

  const settings = {
    avatar_mode: settingsRow?.avatar_mode ?? "livre",
    avatar_reference_url: settingsRow?.avatar_reference_url ?? null,
    takes_count: settingsRow?.takes_count ?? 3,
    gemini_model: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
    veo_model: settingsRow?.veo_model ?? "veo-3.1-fast-generate-001",
    take_duration: settingsRow?.take_duration ?? 8,
  };
  const language = identity?.language || "pt-BR";

  // ---------- Etapa 1a: planejar as cenas ----------
  if (job.render_stage === "planejando") {
    const scriptBlocks = splitScript(job.script ?? "");
    const prompt = [
      `Você dirige vídeos curtos verticais (9:16) de afiliado para TikTok Shop.`,
      `Crie exatamente ${settings.takes_count} cenas para este roteiro.`,
      `Perfil: ${profile?.name ?? "perfil"} (categoria: ${profile?.niche || "geral"}).`,
      product ? `Produto: ${product.name} (categoria ${product.niche || "geral"}, R$ ${Number(product.price).toFixed(2)}).` : "",
      `Roteiro (narração já escrita, distribua entre as cenas mantendo a ordem e o idioma ${language}):`,
      scriptBlocks.map((b, i) => `${i + 1}. ${b}`).join("\n"),
      identity?.style_notes ? `Estilo do perfil: ${identity.style_notes}` : "",
      `REGRA OBRIGATÓRIA: em TODAS as cenas deve aparecer uma PESSOA ou uma MÃO usando, vestindo, aplicando ou demonstrando o produto — nunca o produto sozinho parado.`,
      `image_prompt: em inglês, descreve uma foto realista vertical 9:16, iluminação natural, estética TikTok, pessoa/mão real usando o produto no contexto certo da categoria. O produto DEVE permanecer idêntico à foto de referência enviada (forma, cor, rótulo, proporções).`,
      `motion_prompt: em inglês, descreve apenas o MOVIMENTO da cena (a mão mexendo, a pessoa girando, a câmera aproximando), curto e concreto.`,
      `narration: a fala daquela cena no idioma ${language}, curta o suficiente para caber em ${settings.take_duration} segundos.`,
      `overlay_text: até 5 palavras para aparecer na tela (ou vazio).`,
    ]
      .filter(Boolean)
      .join("\n");

    const planned = await pipeline.planScenes(prompt, settings.takes_count);
    await supabase.from("jobs").update({ scenes: planned, render_stage: "cenas" }).eq("id", job.id);
    return { stage: "cenas", done: false, progress: { done: 0, total: planned.length } };
  }

  // ---------- Etapa 1b: gerar as imagens das cenas ----------
  if (job.render_stage === "cenas") {
    const index = scenes.findIndex((s) => !s.image_url);
    if (index >= 0) {
      const scene = scenes[index]!;
      const references: { base64: string; mimeType: string }[] = [];
      if (product?.image_url) {
        const productImage = await pipeline.fetchAsBase64(product.image_url);
        references.push({ base64: productImage.base64, mimeType: productImage.mimeType });
      }
      if (settings.avatar_mode === "fixo" && settings.avatar_reference_url) {
        const avatar = await pipeline.fetchAsBase64(settings.avatar_reference_url);
        references.push({ base64: avatar.base64, mimeType: avatar.mimeType });
      }

      const promptSuffix = settings.avatar_mode === "fixo" && settings.avatar_reference_url
        ? " Use the same person shown in the reference portrait, keeping face, hair and body consistent."
        : "";
      const generated = await pipeline.generateSceneImage({
        model: settings.gemini_model,
        prompt: `${scene.image_prompt} Vertical 9:16 framing. Keep the product identical to the product reference photo.${promptSuffix}`,
        references,
      });

      const stored = await pipeline.storeMedia(
        `${job.id}/cena-${index + 1}.jpg`,
        Uint8Array.from(atob(generated.base64), (c) => c.charCodeAt(0)),
        generated.mimeType,
      );
      scenes[index] = { ...scene, image_path: stored.path, image_url: stored.url };
      await supabase
        .from("jobs")
        .update({ scenes, gemini_images_count: (job.gemini_images_count ?? 0) + 1 })
        .eq("id", job.id);
      return { stage: "cenas", done: false, progress: { done: index + 1, total: scenes.length } };
    }
    await supabase.from("jobs").update({ render_stage: "takes" }).eq("id", job.id);
    return { stage: "takes", done: false, progress: { done: 0, total: scenes.length } };
  }

  // ---------- Etapa 2: animar cada cena com o Veo ----------
  if (job.render_stage === "takes") {
    const index = scenes.findIndex((s) => !s.video_url);
    if (index >= 0) {
      const scene = scenes[index]!;
      if (!scene.operation) {
        const image = await pipeline.fetchAsBase64(scene.image_url!);
        const operation = await pipeline.startVeoTake({
          model: settings.veo_model,
          prompt: `${scene.motion_prompt} No spoken dialogue, no on-screen text.`,
          image: { base64: image.base64, mimeType: image.mimeType },
          durationSeconds: settings.take_duration,
        });
        scenes[index] = { ...scene, operation };
        await supabase.from("jobs").update({ scenes }).eq("id", job.id);
        return { stage: "takes", done: false, progress: { done: index, total: scenes.length } };
      }

      const status = await pipeline.pollVeoTake(scene.operation);
      if (!status.done) return { stage: "takes", done: false, progress: { done: index, total: scenes.length } };

      const video = await pipeline.downloadVeoVideo(status.uri!);
      const stored = await pipeline.storeMedia(`${job.id}/take-${index + 1}.mp4`, video.bytes, "video/mp4");
      scenes[index] = { ...scene, video_path: stored.path, video_url: stored.url };
      await supabase
        .from("jobs")
        .update({ scenes, veo_takes_count: (job.veo_takes_count ?? 0) + 1 })
        .eq("id", job.id);
      return { stage: "takes", done: false, progress: { done: index + 1, total: scenes.length } };
    }
    await supabase.from("jobs").update({ render_stage: "montagem" }).eq("id", job.id);
    return { stage: "montagem", done: false, progress: { done: scenes.length, total: scenes.length } };
  }

  // ---------- Etapa 3: montar no JSON2Video ----------
  if (job.render_stage === "montagem") {
    const apiKey = process.env["JSON2VIDEO_API_KEY"];
    const token = process.env["JSON2VIDEO_WEBHOOK_TOKEN"];
    if (!apiKey || !token) throw new Error("A montagem do vídeo não está configurada corretamente.");

    const movie = pipeline.buildMovie({
      jobId: job.id,
      scenes,
      voice: pipeline.VOICE_BY_LANGUAGE[language] ?? pipeline.VOICE_BY_LANGUAGE["pt-BR"]!,
      subtitleLanguage: pipeline.SUBTITLE_LANGUAGES.has(language) ? language : "auto",
      webhookUrl: `${PUBLIC_BASE}/api/public/json2video-webhook/${token}`,
      priceLabel: product ? `R$ ${Number(product.price).toFixed(2).replace(".", ",")}` : null,
      ctaText: "Link na bio",
    });

    const res = await fetch(J2V_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; project?: string; message?: string; error?: string }
      | null;
    if (!res.ok || !payload?.project) {
      const detail = payload?.message || payload?.error || `erro ${res.status}`;
      throw new Error(`Não foi possível montar o vídeo: ${detail}`);
    }

    await supabase
      .from("jobs")
      .update({ render_id: payload.project, render_stage: "render" })
      .eq("id", job.id);
    return { stage: "render", done: true, progress: { done: scenes.length, total: scenes.length } };
  }

  return { stage: job.render_stage, done: true, progress: null };
}
