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

/** Passo 1: inicia a geração das IMAGENS das cenas (Gemini). Não chama o Veo. */
export const generateJobScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);

    if (job.status !== "roteiro_pronto") {
      throw new Error("As cenas só podem ser geradas quando o roteiro está pronto.");
    }
    if (!splitScript(job.script ?? "").length) {
      throw new Error("Este job ainda não tem roteiro para narrar.");
    }
    if (!process.env["GEMINI_API_KEY"]) {
      throw new Error("A geração de cenas ainda não está configurada. Falta a chave do Google (Gemini/Veo).");
    }

    // Etapa barata: só trava se o admin optar por bloquear tudo ao estourar o teto.
    const { assertOrcamento: assertOrcamentoCenas } = await import("./orcamento.server");
    await assertOrcamentoCenas(job.profile_id, { barata: true });

    const { error } = await supabase
      .from("jobs")
      .update({
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

/** Passo 2: aprovação humana das cenas -> anima no Veo e monta no JSON2Video. */
export const approveJobScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);

    if (job.status !== "cenas_geradas") {
      throw new Error("Aprove as cenas quando elas estiverem geradas.");
    }
    const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as { image_url?: string }[];
    if (!scenes.length || scenes.some((s) => !s.image_url)) {
      throw new Error("Ainda há cenas sem imagem gerada.");
    }
    if (!process.env["JSON2VIDEO_API_KEY"]) {
      throw new Error("A montagem do vídeo ainda não está configurada. Falta a chave do JSON2Video.");
    }

    // Etapa cara: respeita o teto de orçamento do mês.
    const { assertOrcamento, assertSaldoFornecedor } = await import("./orcamento.server");
    await assertOrcamento(job.profile_id);
    await assertSaldoFornecedor("animacao_veo");

    const { error } = await supabase
      .from("jobs")
      .update({
        status: "gerando_video",
        render_stage: "takes",
        render_started_at: new Date().toISOString(),
        render_error: null,
        render_id: null,
      })
      .eq("id", job.id);
    if (error) throw new Error(error.message);

    return { stage: "takes" as const };
  });

/** Regera a imagem de UMA cena (barato) antes da aprovação, com prompt editável. */
export const regenerateJobScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ jobId: z.string().uuid(), index: z.number().int().min(0), prompt: z.string().min(3).max(1200).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);
    if (job.status !== "cenas_geradas") throw new Error("Só é possível regerar cenas nesta etapa.");

    // Nova tentativa começando: limpa o erro anterior antes de gerar.
    await supabase.from("jobs").update({ render_error: null }).eq("id", job.id);

    const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as import("./video-pipeline.server").Scene[];
    const scene = scenes[data.index];
    if (!scene) throw new Error("Cena não encontrada.");

    const pipeline = await import("./video-pipeline.server");
    const [{ data: product }, { data: settingsRow }] = await Promise.all([
      job.product_id
        ? supabase.from("products").select("image_url").eq("id", job.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("profile_video_settings")
        .select("avatar_mode, avatar_reference_url, gemini_model")
        .eq("profile_id", job.profile_id)
        .maybeSingle(),
    ]);

    const imagePrompt = data.prompt?.trim() || scene.image_prompt;
    const references: { base64: string; mimeType: string }[] = [];
    if (product?.image_url) {
      const img = await pipeline.fetchAsBase64(product.image_url);
      references.push({ base64: img.base64, mimeType: img.mimeType });
    }
    if (settingsRow?.avatar_mode === "fixo" && settingsRow?.avatar_reference_url) {
      const avatar = await pipeline.fetchAsBase64(settingsRow.avatar_reference_url);
      references.push({ base64: avatar.base64, mimeType: avatar.mimeType });
    }

    const generated = await pipeline.generateSceneImage({
      model: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
      prompt: `${imagePrompt} Vertical 9:16 framing. Keep the product identical to the product reference photo.`,
      references,
    });
    const stored = await pipeline.storeMedia(
      `${job.id}/cena-${data.index + 1}-${Date.now()}.jpg`,
      Uint8Array.from(atob(generated.base64), (c) => c.charCodeAt(0)),
      generated.mimeType,
    );

    // A cena regerada perde o take antigo: será animada de novo na aprovação.
    const { operation: _op, video_path: _vp, video_url: _vu, approved: _approved, ...rest } = scene as typeof scene & { approved?: boolean };
    scenes[data.index] = {
      ...rest,
      image_prompt: imagePrompt,
      image_path: stored.path,
      image_url: stored.url,
    };

    const { error } = await supabase
      .from("jobs")
      .update({ scenes, gemini_images_count: (job.gemini_images_count ?? 0) + 1, render_error: null })
      .eq("id", job.id);
    if (error) throw new Error(error.message);

    const { recordConsumo } = await import("./consumo.server");
    await recordConsumo({
      jobId: job.id,
      profileId: job.profile_id,
      etapa: "cena_gemini",
      modelo: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
      quantidade: 1,
      unidade: "imagem",
      metadados: { cena: data.index + 1, origem: "regeneracao" },
    });

    return { url: stored.url };
  });

/** Executa a próxima etapa pendente do job (chamada repetidamente pela tela). */
export const advanceJobVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const job = await loadJob(supabase, data.jobId);

    const running =
      (job.status === "roteiro_pronto" || job.status === "gerando_video") &&
      !!job.render_stage &&
      job.render_stage !== "render";
    if (!running) return { stage: job.render_stage, done: true, progress: null };

    const pipeline = await import("./video-pipeline.server");

    try {
      return await runStep(supabase, job, pipeline);
    } catch (e) {
      const message = e instanceof Error ? e.message : "A geração do vídeo falhou.";
      // Falha na fase de imagens volta ao roteiro; depois da aprovação volta às cenas aprovadas.
      const backTo = job.render_stage === "planejando" || job.render_stage === "cenas" ? "roteiro_pronto" : "cenas_geradas";
      await supabase
        .from("jobs")
        .update({ status: backTo, render_stage: null, render_error: message })
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

  const consumo = await import("./consumo.server");


  const settings = {
    avatar_mode: settingsRow?.avatar_mode ?? "livre",
    avatar_reference_url: settingsRow?.avatar_reference_url ?? null,
    takes_count: settingsRow?.takes_count ?? 3,
    gemini_model: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
    veo_model: settingsRow?.veo_model ?? "veo-3.1-fast-generate-preview",
    take_duration: settingsRow?.take_duration ?? 8,
  };
  const language = identity?.language || "pt-BR";

  const prompts = await import("./prompts.server");
  const promptVars = {
    perfil: profile?.name ?? "",
    categoria: profile?.niche || "geral",
    produto: product?.name ?? "",
    preco: product ? Number(product.price).toFixed(2) : "",
    comissao: product ? `${Number(product.commission)}%` : "",
    categoria_produto: product?.niche || "",
    idioma: language,
    tom_de_voz: identity?.tone ?? "",
    observacoes_estilo: identity?.style_notes ?? "",
    numero_cenas: settings.takes_count,
    duracao_cena: settings.take_duration,
  };

  // ---------- Etapa 1a: planejar as cenas ----------
  if (job.render_stage === "planejando") {
    const scriptBlocks = splitScript(job.script ?? "");
    const template = await prompts.resolvePrompt(supabase, job.profile_id, "cena");
    const prompt = prompts.renderPrompt(template, {
      ...promptVars,
      roteiro: scriptBlocks.map((b, i) => `${i + 1}. ${b}`).join("\n"),
    });

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
      await consumo.recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "cena_gemini",
        modelo: settings.gemini_model,
        quantidade: 1,
        unidade: "imagem",
        metadados: { cena: index + 1, origem: "geracao_inicial" },
      });
      return { stage: "cenas", done: false, progress: { done: index + 1, total: scenes.length } };
    }
    // Imagens prontas: pausa para revisão humana antes de gastar com a animação.
    // Etapa concluída com sucesso: limpa qualquer erro de tentativa anterior.
    await supabase
      .from("jobs")
      .update({ status: "cenas_geradas", render_stage: null, render_error: null })
      .eq("id", job.id);
    return { stage: null, done: true, progress: { done: scenes.length, total: scenes.length } };

  }

  // ---------- Etapa 2: animar cada cena com o Veo ----------
  if (job.render_stage === "takes") {
    const index = scenes.findIndex((s) => !s.video_url);
    if (index >= 0) {
      const scene = scenes[index]!;
      if (!scene.operation) {
        const image = await pipeline.fetchAsBase64(scene.image_url!);
        // Prompt 100% visual: qualquer menção a fala/som faz o Veo bloquear pelo filtro de áudio.
        const motionTemplate = await prompts.resolvePrompt(supabase, job.profile_id, "movimento");
        const motionPrompt = pipeline.sanitizeMotionPrompt(
          prompts.renderPrompt(motionTemplate, { ...promptVars, cena_descricao: scene.motion_prompt }),
        );
        const operation = await pipeline.startVeoTake({
          model: settings.veo_model,
          prompt: motionPrompt,
          image: { base64: image.base64, mimeType: image.mimeType },
          durationSeconds: settings.take_duration,
        });
        scenes[index] = { ...scene, operation };
        await supabase.from("jobs").update({ scenes }).eq("id", job.id);
        return { stage: "takes", done: false, progress: { done: index, total: scenes.length } };
      }

      let status: Awaited<ReturnType<typeof pipeline.pollVeoTake>>;
      try {
        status = await pipeline.pollVeoTake(scene.operation);
      } catch (e) {
        // Bloqueio de filtro (tipicamente o áudio nativo do Veo) é intermitente:
        // reprograma a mesma cena até 3 vezes antes de desistir.
        const attempts = (scene.attempts ?? 0) + 1;
        if (e instanceof pipeline.VeoFilteredError && attempts < 3) {
          const { operation: _drop, ...rest } = scene;
          scenes[index] = { ...rest, attempts };
          // Nova tentativa já começou: não deixa o erro antigo na tela.
          await supabase.from("jobs").update({ scenes, render_error: null }).eq("id", job.id);
          // O take descartado já foi gerado (e cobrado): registra o consumo.
          await consumo.recordConsumo({
            jobId: job.id,
            profileId: job.profile_id,
            etapa: "animacao_veo",
            modelo: settings.veo_model,
            quantidade: settings.take_duration,
            unidade: "segundo_video",
            metadados: { cena: index + 1, tentativa: attempts, descartado: true, duracao_estimada: true },
          });
          return { stage: "takes", done: false, progress: { done: index, total: scenes.length } };
        }
        throw e;
      }
      if (!status.done) return { stage: "takes", done: false, progress: { done: index, total: scenes.length } };

      const video = await pipeline.downloadVeoVideo(status.video!);
      const stored = await pipeline.storeMedia(`${job.id}/take-${index + 1}.mp4`, video.bytes, "video/mp4");
      scenes[index] = { ...scene, video_path: stored.path, video_url: stored.url };
      // Take concluído: limpa o erro da tentativa anterior (ex.: bloqueio de filtro já superado).
      await supabase
        .from("jobs")
        .update({ scenes, veo_takes_count: (job.veo_takes_count ?? 0) + 1, render_error: null })
        .eq("id", job.id);
      const realDuration = status.durationSeconds ?? null;
      await consumo.recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "animacao_veo",
        modelo: settings.veo_model,
        quantidade: realDuration ?? settings.take_duration,
        unidade: "segundo_video",
        metadados: {
          cena: index + 1,
          duracao_estimada: realDuration === null,
          ...(realDuration === null ? { duracao_configurada: settings.take_duration } : {}),
        },
      });
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

    const assemblyTemplate = await prompts.resolvePrompt(supabase, job.profile_id, "montagem");
    const movieSettings = prompts.parseMovieSettings(prompts.renderPrompt(assemblyTemplate, promptVars));

    const movie = pipeline.buildMovie({
      jobId: job.id,
      scenes,
      voice: pipeline.VOICE_BY_LANGUAGE[language] ?? pipeline.VOICE_BY_LANGUAGE["pt-BR"]!,
      subtitleLanguage: pipeline.SUBTITLE_LANGUAGES.has(language) ? language : "auto",
      webhookUrl: `${PUBLIC_BASE}/api/public/json2video-webhook/${token}`,
      settings: movieSettings,
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
      .update({ render_id: payload.project, render_stage: "render", render_error: null })
      .eq("id", job.id);

    // Créditos da montagem: alguns retornos já trazem aqui; senão fica com o webhook.
    const credits = consumo.findCredits(payload);
    if (credits !== null) {
      await consumo.recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "montagem_json2video",
        modelo: "json2video",
        quantidade: credits,
        unidade: "credito_montagem",
        metadados: { origem: "resposta_envio", project: payload.project },
      });
    }
    return { stage: "render", done: true, progress: { done: scenes.length, total: scenes.length } };
  }

  return { stage: job.render_stage, done: true, progress: null };
}

/** Gera (com o Gemini) a imagem de referência da pessoa fixa de um perfil. */
export const generateAvatarReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid(), description: z.string().min(3).max(400) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // A própria RLS de profile_video_settings exige a permissão perfis:editar.
    const { error: guardError } = await supabase
      .from("profile_video_settings")
      .upsert({ profile_id: data.profileId, avatar_mode: "fixo" }, { onConflict: "profile_id" });
    if (guardError) throw new Error("Você não tem permissão para editar este perfil.");

    const { data: settings } = await supabase
      .from("profile_video_settings")
      .select("gemini_model")
      .eq("profile_id", data.profileId)
      .maybeSingle();

    const pipeline = await import("./video-pipeline.server");
    const generated = await pipeline.generateSceneImage({
      model: settings?.gemini_model ?? "gemini-3.1-flash-image",
      prompt: `Photorealistic vertical 9:16 portrait of ${data.description}. Natural lighting, neutral background, looking at the camera, social media creator look. No text.`,
      references: [],
    });

    const stored = await pipeline.storeMedia(
      `avatars/${data.profileId}.jpg`,
      Uint8Array.from(atob(generated.base64), (c) => c.charCodeAt(0)),
      generated.mimeType,
    );

    const { error } = await supabase
      .from("profile_video_settings")
      .update({ avatar_reference_url: stored.url })
      .eq("profile_id", data.profileId);
    if (error) throw new Error(error.message);

    return { url: stored.url };
  });
