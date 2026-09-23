import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_VISUAL_STYLE, isVisualStyle, visualStylePrompt, type VisualStyle } from "@/lib/visual-style";

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
  narracao: "Gerando a narração",
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
  voice_ref: string | null;
  tenant_id: string;
  formato?: string | null;
  ai_status?: string | null;
  ai_render_stage?: string | null;
  avatar_id?: string | null;
  avatar_reference_urls?: unknown;
  avatar_description?: string | null;
  cenas_count?: number | null;
  take_duration?: number | null;
  visual_style_override?: string | null;
  visual_style_custom?: string | null;
};


/**
 * Trilha de IA do vídeo próprio ("Gravar eu mesmo").
 * O job gravado continua com status/render_stage/vídeo intactos: a geração por
 * IA acontece em colunas espelhadas (ai_*), então a gravação nunca é perdida.
 */
const AI_TRACK_KEYS: Record<string, string> = {
  status: "ai_status",
  render_stage: "ai_render_stage",
  render_id: "ai_render_id",
  render_error: "ai_render_error",
  render_started_at: "ai_render_started_at",
  video_url: "ai_video_url",
  video_thumbnail_url: "ai_video_thumbnail_url",
  video_storage_status: "ai_video_storage_status",
  video_storage_error: "ai_video_storage_error",
};

export const isAiTrack = (job: { formato?: string | null }) => job.formato === "gravacao";

/** Status efetivo da trilha em execução. */
function jobStatus(job: JobRow): string {
  return isAiTrack(job) ? (job.ai_status ?? "roteiro_pronto") : job.status;
}

/** Etapa efetiva da trilha em execução. */
function jobStage(job: JobRow): string | null {
  return isAiTrack(job) ? (job.ai_render_stage ?? null) : job.render_stage;
}

/** Converte um patch do pipeline para as colunas da trilha certa. */
export function trackPatch<T extends Record<string, unknown>>(job: { formato?: string | null }, patch: T): T {
  if (!isAiTrack(job)) return patch;
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [AI_TRACK_KEYS[key] ?? key, value]),
  ) as T;
}


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

/** Lista de URLs de referência da pessoa salvas no perfil (até 3). */
export function profileAvatarUrls(settings: { avatar_reference_url?: string | null; avatar_reference_urls?: unknown } | null): string[] {
  const list = Array.isArray(settings?.avatar_reference_urls)
    ? settings.avatar_reference_urls.filter((u): u is string => typeof u === "string" && !!u)
    : [];
  if (list.length) return list.slice(0, 5);
  return settings?.avatar_reference_url ? [settings.avatar_reference_url] : [];
}

/** Lista de URLs guardadas num campo jsonb. */
function urlList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === "string" && !!u).slice(0, 5) : [];
}

export type AvatarSettings = {
  avatar_mode?: string | null;
  avatar_reference_url?: string | null;
  avatar_reference_urls?: unknown;
  avatar_description?: string | null;
};

export type AvatarJob = { avatar_reference_urls?: unknown; avatar_description?: string | null };

/**
 * Avatar efetivo de uma cena.
 * - O override do vídeo (fotos ou descrição) vence o avatar do perfil.
 * - Com fotos: elas são as referências de identidade.
 * - Só com descrição: a primeira cena cria a pessoa a partir do texto e as
 *   demais reaproveitam a imagem dela, mantendo a MESMA pessoa no vídeo.
 * - Sem nada: comportamento antigo (pessoa qualquer, fixada pela cena 1).
 */
function avatarForScene(
  job: AvatarJob,
  settings: AvatarSettings | null,
  scenes: { image_url?: string }[],
  index: number,
): { urls: string[]; description: string } {
  const jobUrls = urlList(job.avatar_reference_urls);
  const jobDescription = (job.avatar_description ?? "").trim();
  const override = jobUrls.length > 0 || jobDescription.length > 0;

  const urls = override ? jobUrls : settings?.avatar_mode === "fixo" ? profileAvatarUrls(settings) : [];
  const description = override ? jobDescription : (settings?.avatar_description ?? "").trim();
  if (urls.length) return { urls, description: "" };

  const first = scenes[0]?.image_url;
  return { urls: index > 0 && first ? [first] : [], description };
}

/** Bloco de prompt que descreve a pessoa quando não há fotos de referência. */
function personDescriptionBlock(description: string): string {
  if (!description) return "";
  return `PERSON DESCRIPTION: The person appearing in the scene must match this description: ${description}. Keep exactly the same person, face and hair across every scene of this video.\n\n`;
}

type VisualStyleSettings = { visual_style?: string | null; visual_style_custom?: string | null };

export function effectiveVisualStyle(
  job: Pick<JobRow, "visual_style_override" | "visual_style_custom">,
  settings: VisualStyleSettings | null,
): { style: VisualStyle; custom: string | null; prompt: string } {
  const override = isVisualStyle(job.visual_style_override) ? job.visual_style_override : null;
  const profileStyle = isVisualStyle(settings?.visual_style) ? settings.visual_style : DEFAULT_VISUAL_STYLE;
  const style = override ?? profileStyle;
  const custom = style === "personalizado"
    ? (override ? job.visual_style_custom : settings?.visual_style_custom)?.trim() || null
    : null;
  return { style, custom, prompt: visualStylePrompt(style, custom) };
}

/** Tags {{nome}} citadas numa descrição de cena, em ordem e sem repetição. */
export function sceneTags(prompt: string): string[] {
  const found = [...(prompt ?? "").matchAll(/\{\{\s*([A-Za-z0-9_-]{2,24})\s*\}\}/g)].map((m) =>
    m[1]!.toLowerCase(),
  );
  return [...new Set(found)];
}

export type ScenePersonas = { prompt: string; urls: string[]; labels: string[] };

/**
 * Cenas com várias pessoas: resolve as tags {{alex}} nas personas da biblioteca
 * do perfil e usa UMA foto principal por pessoa (várias fotos por pessoa viram
 * ruído em cena multi-pessoa). Sem tag reconhecida, devolve null e o fluxo de
 * avatar único segue igual.
 */
export async function resolveScenePersonas(
  supabase: any,
  profileId: string,
  prompt: string,
): Promise<ScenePersonas | null> {
  const tags = sceneTags(prompt);
  if (!tags.length) return null;

  const { data } = await supabase
    .from("profile_avatars")
    .select("name, tag, primary_url, reference_urls")
    .eq("profile_id", profileId);

  const byTag = new Map<string, { name: string; url: string }>();
  for (const row of (data ?? []) as {
    name: string;
    tag: string | null;
    primary_url: string | null;
    reference_urls: unknown;
  }[]) {
    const tag = (row.tag ?? "").trim().toLowerCase();
    if (!tag) continue;
    const refs = urlList(row.reference_urls);
    const url = row.primary_url && refs.includes(row.primary_url) ? row.primary_url : (row.primary_url ?? refs[0] ?? "");
    if (!url) continue;
    byTag.set(tag, { name: row.name, url });
  }

  const labels: string[] = [];
  const urls: string[] = [];
  for (const tag of tags) {
    const persona = byTag.get(tag);
    if (!persona) continue;
    labels.push(persona.name);
    urls.push(persona.url);
  }
  if (!labels.length) return null;

  const texto = prompt.replace(/\{\{\s*([A-Za-z0-9_-]{2,24})\s*\}\}/g, (_all, raw: string) => {
    const persona = byTag.get(raw.toLowerCase());
    return persona ? persona.name : raw;
  });

  return { prompt: texto, urls, labels };
}


/**
 * Voz do perfil quando ela é da ElevenLabs (clonada ou catálogo). Voz padrão
 * Azure (ou nada configurado) devolve null e o fluxo antigo segue intacto.
 */
async function resolveElevenLabsVoice(
  supabase: any,
  voiceRef: string | null,
): Promise<{ id: string; nome: string; voice_id: string } | null> {
  if (!voiceRef) return null;
  const { data } = await supabase
    .from("voices")
    .select("id, nome, fonte, voice_id")
    .eq("id", voiceRef)
    .maybeSingle();
  if (!data || data.fonte === "azure_padrao" || !data.voice_id) return null;
  return { id: data.id, nome: data.nome, voice_id: data.voice_id };
}

/**
 * No plano BYOK confere, ANTES de começar, se o cliente tem as chaves que
 * este vídeo vai usar. ElevenLabs só é exigida quando a voz do perfil é dela.
 */
async function assertVideoKeys(supabase: any, job: JobRow) {
  const { data: settingsRow } = await supabase
    .from("profile_video_settings")
    .select("voice_ref")
    .eq("profile_id", job.profile_id)
    .maybeSingle();
  const voice = await resolveElevenLabsVoice(supabase, job.voice_ref ?? settingsRow?.voice_ref ?? null);
  const { assertTenantKeys, providersForFullVideo } = await import("./api-keys.server");
  await assertTenantKeys(job.tenant_id, providersForFullVideo(!!voice));
}

/**
 * Carrega o job, valida permissão de pipeline e devolve os dados.
 * `skipPermission` é usado SOMENTE pela automação (cron), que roda sem sessão
 * e já validou o dono da agenda/tenant antes de chamar o pipeline.
 */
async function loadJob(supabase: any, jobId: string, skipPermission = false): Promise<JobRow> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, product_id, profile_id, tenant_id, status, script, caption, render_stage, scenes, gemini_images_count, veo_takes_count, voice_ref, formato, ai_status, ai_render_stage, avatar_id, avatar_reference_urls, avatar_description, cenas_count, take_duration, visual_style_override, visual_style_custom")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Job não encontrado ou sem permissão de acesso.");

  if (!skipPermission) {
    const { data: canEdit, error: permError } = await supabase.rpc("can_edit_pipeline", { _profile_id: job.profile_id });
    if (permError) throw new Error(permError.message);
    if (!canEdit) throw new Error("Você não tem permissão para gerar vídeo neste perfil.");
  }
  return job as JobRow;
}


/** Passo 1 (núcleo): inicia a geração das IMAGENS das cenas (Gemini). Não chama o Veo. */
export async function startJobScenes(supabase: any, jobId: string, skipPermission = false) {
  const job = await loadJob(supabase, jobId, skipPermission);

  if (jobStatus(job) !== "roteiro_pronto") {
    throw new Error("As cenas só podem ser geradas quando o roteiro está pronto.");
  }
  if (!splitScript(job.script ?? "").length) {
    throw new Error("Este job ainda não tem roteiro para narrar.");
  }
  await assertVideoKeys(supabase, job);

  // Etapa barata: só trava se o admin optar por bloquear tudo ao estourar o teto.
  const { assertOrcamento: assertOrcamentoCenas } = await import("./orcamento.server");
  await assertOrcamentoCenas(job.profile_id, { barata: true });

  // Trava de saldo ANTES de começar: o vídeo inteiro precisa de cenas, animações,
  // montagem e (quando há voz) narração. Falta de qualquer uma impede a geração.
  {
    const { assertSaldo, needsVideoCompleto } = await import("./saldo.server");
    const { data: cfg } = await supabase
      .from("profile_video_settings")
      .select("takes_count, voice_ref")
      .eq("profile_id", job.profile_id)
      .maybeSingle();
    const cenas = job.cenas_count ?? cfg?.takes_count ?? 3;
    await assertSaldo(
      job.tenant_id,
      needsVideoCompleto({ cenas, comNarracao: !!(job.voice_ref ?? cfg?.voice_ref) }),
    );
  }

  // Retentativa: se já existem cenas com imagem, elas são preservadas e só
  // as que ficaram sem imagem são refeitas. Nada do que deu certo é perdido.
  const existing = (Array.isArray(job.scenes) ? job.scenes : []) as { image_url?: string }[];
  const resume = existing.length > 0 && existing.some((scene) => scene.image_url);

  const { error } = await supabase
    .from("jobs")
    .update({
      ...trackPatch(job, {
        render_stage: resume ? "cenas" : "planejando",
        render_started_at: new Date().toISOString(),
        render_error: null,
        render_id: null,
        video_url: null,
        video_thumbnail_url: null,
        ...(isAiTrack(job) ? { status: "roteiro_pronto" } : {}),
      }),
      ...(resume ? {} : { scenes: [], gemini_images_count: 0, veo_takes_count: 0 }),
    })
    .eq("id", job.id);

  if (error) throw new Error(error.message);

  return { stage: (resume ? "cenas" : "planejando") as "cenas" | "planejando" };
}

export const generateJobScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => startJobScenes(context.supabase, data.jobId));

/** Passo 2 (núcleo): aprovação das cenas -> anima no Veo e monta no JSON2Video. */
export async function approveJobScenesCore(supabase: any, jobId: string, skipPermission = false) {
  const job = await loadJob(supabase, jobId, skipPermission);

  if (jobStatus(job) !== "cenas_geradas") {
    throw new Error("Aprove as cenas quando elas estiverem geradas.");
  }
  const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as { image_url?: string }[];
  if (!scenes.length || scenes.some((s) => !s.image_url)) {
    throw new Error("Ainda há cenas sem imagem gerada.");
  }
  await assertVideoKeys(supabase, job);

  // Etapa cara: respeita o teto de orçamento do mês.
  const { assertOrcamento, assertSaldoFornecedor } = await import("./orcamento.server");
  await assertOrcamento(job.profile_id);
  await assertSaldoFornecedor("animacao_veo");

  {
    const { assertSaldo, needsVideoCompleto } = await import("./saldo.server");
    const { data: cfg } = await supabase
      .from("profile_video_settings")
      .select("voice_ref")
      .eq("profile_id", job.profile_id)
      .maybeSingle();
    await assertSaldo(
      job.tenant_id,
      needsVideoCompleto({
        cenas: scenes.length,
        comCenas: false,
        comNarracao: !!(job.voice_ref ?? cfg?.voice_ref),
      }),
    );
  }

  const { error } = await supabase
    .from("jobs")
    .update(
      trackPatch(job, {
        status: "gerando_video",
        render_stage: "takes",
        render_started_at: new Date().toISOString(),
        render_error: null,
        render_id: null,
      }),
    )
    .eq("id", job.id);
  if (error) throw new Error(error.message);

  return { stage: "takes" as const };
}

export const approveJobScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => approveJobScenesCore(context.supabase, data.jobId));


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
    const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as import("./video-pipeline.server").Scene[];
    const scene = scenes[data.index];
    if (!scene) throw new Error("Cena não encontrada.");

    const { assertOrcamento: assertOrcamentoRegen } = await import("./orcamento.server");
    await assertOrcamentoRegen(job.profile_id, { barata: true });
    const { assertSaldo } = await import("./saldo.server");
    await assertSaldo(job.tenant_id, { cena: 1 });

    // Cenas prontas podem ser regeradas na revisão; uma cena que FALHOU (ficou
    // sem imagem) também pode ser refeita sozinha, sem descartar as que deram certo.
    const retryFailed = jobStatus(job) === "roteiro_pronto" && !jobStage(job) && !scene.image_url;
    if (jobStatus(job) !== "cenas_geradas" && !retryFailed) {
      throw new Error("Só é possível regerar cenas nesta etapa.");
    }

    // Nova tentativa começando: limpa o erro anterior antes de gerar.
    await supabase.from("jobs").update(trackPatch(job, { render_error: null })).eq("id", job.id);



    const pipeline = await import("./video-pipeline.server");
    const [{ data: product }, { data: settingsRow }] = await Promise.all([
      job.product_id
        ? supabase.from("products").select("image_url, extra_image_urls").eq("id", job.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("profile_video_settings")
        .select("avatar_mode, avatar_reference_url, avatar_reference_urls, avatar_description, gemini_model, visual_style, visual_style_custom")
        .eq("profile_id", job.profile_id)
        .maybeSingle(),
    ]);

    const imagePrompt = data.prompt?.trim() || scene.image_prompt;
    const personas = await resolveScenePersonas(supabase, job.profile_id, imagePrompt);
    const avatar = avatarForScene(job, settingsRow, scenes, data.index);
    const personRefs = await pipeline.loadPersonReferences(personas ? personas.urls : avatar.urls);
    const productRefs = await pipeline.loadProductReferences(pipeline.productImageUrls(product));
    const references: { base64: string; mimeType: string }[] = [...personRefs, ...productRefs];

    const sceneText = personas ? personas.prompt : imagePrompt;
    const style = effectiveVisualStyle(job, settingsRow);
    const identityRequirement = personas
      ? `${pipeline.personaIdentityBlock(personas.labels)}\n\n`
      : personRefs.length
        ? `${pipeline.SAME_PERSON_SUFFIX}\n\n`
        : personDescriptionBlock(avatar.description);
    const referenceGuide = personas
      ? pipeline.buildPersonaGuide(personas.labels, productRefs.length)
      : pipeline.buildReferenceGuide(personRefs.length, productRefs.length);

    const { withTenantKeys } = await import("./api-keys.server");
    const generated = await withTenantKeys(job.tenant_id, () =>
      pipeline.generateSceneImage({
        model: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
        prompt: `${style.prompt}\n\n${identityRequirement}${referenceGuide}\n\nSCENE: ${sceneText} Vertical 9:16 framing. ${pipeline.PRODUCT_FIDELITY_SUFFIX}`,
        references,
      }),
    );
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

    // Refazendo uma cena que falhou: quando todas ficam com imagem, o job
    // volta sozinho para a revisão das cenas.
    const completed = retryFailed && scenes.every((s) => s.image_url);

    const { error } = await supabase
      .from("jobs")
      .update({
        scenes,
        gemini_images_count: (job.gemini_images_count ?? 0) + 1,
        ...trackPatch(job, {
          render_error: null,
          ...(completed ? { status: "cenas_geradas", render_stage: null } : {}),
        }),

      })
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

/** Executa a próxima etapa pendente do job (núcleo, chamado pela tela e pela automação). */
export async function advanceJobVideoCore(supabase: any, jobId: string, skipPermission = false) {
  const job = await loadJob(supabase, jobId, skipPermission);

  const stageAtual = jobStage(job);
  const running =
    (jobStatus(job) === "roteiro_pronto" || jobStatus(job) === "gerando_video") &&
    !!stageAtual &&
    stageAtual !== "render";
  if (!running) return { stage: stageAtual, done: true, progress: null };

  const { assertOrcamento: assertOrcamentoEtapa } = await import("./orcamento.server");
  await assertOrcamentoEtapa(job.profile_id, { barata: true });

  const pipeline = await import("./video-pipeline.server");

  const { withTenantKeys } = await import("./api-keys.server");
  try {
    return await withTenantKeys(job.tenant_id, () => runStep(supabase, job, pipeline));
  } catch (e) {
    const base = e instanceof Error ? e.message : "A geração do vídeo falhou.";
    const feitas = (Array.isArray(job.scenes) ? job.scenes : []).filter(
      (s) => !!(s as { image_url?: string })?.image_url,
    ).length;
    // Falha nas imagens não descarta o que já ficou pronto.
    const message =
      stageAtual === "cenas" && feitas > 0
        ? `${base} As ${feitas} cena(s) já geradas foram mantidas: refaça apenas as que ficaram sem imagem.`
        : base;
    // Falha na fase de imagens volta ao roteiro; depois da aprovação volta às cenas aprovadas.
    const backTo = stageAtual === "planejando" || stageAtual === "cenas" ? "roteiro_pronto" : "cenas_geradas";
    await supabase
      .from("jobs")
      .update(trackPatch(job, { status: backTo, render_stage: null, render_error: message }))
      .eq("id", job.id);

    throw new Error(message);
  }
}

export const advanceJobVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => advanceJobVideoCore(context.supabase, data.jobId));



async function runStep(
  supabase: any,
  job: JobRow,
  pipeline: typeof import("./video-pipeline.server"),
) {
  const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as import("./video-pipeline.server").Scene[];
  const stage = jobStage(job);

  const [{ data: product }, { data: identity }, { data: profile }, { data: settingsRow }] = await Promise.all([
    job.product_id
      ? supabase.from("products").select("name, seller_name, price, commission, image_url, niche, description, extra_image_urls").eq("id", job.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profile_identities").select("tone, language, style_notes").eq("profile_id", job.profile_id).maybeSingle(),
    supabase.from("profiles").select("name, niche").eq("id", job.profile_id).maybeSingle(),
    supabase
      .from("profile_video_settings")
      .select("avatar_mode, avatar_reference_url, avatar_reference_urls, avatar_description, takes_count, gemini_model, veo_model, take_duration, voice_ref, visual_style, visual_style_custom")
      .eq("profile_id", job.profile_id)
      .maybeSingle(),
  ]);

  const consumo = await import("./consumo.server");


  const settings = {
    avatar_mode: settingsRow?.avatar_mode ?? "livre",
    avatar_reference_url: settingsRow?.avatar_reference_url ?? null,
    // Cenas/duração: o valor gravado no job (usado pela automação) vence o do perfil.
    takes_count: job.cenas_count ?? settingsRow?.takes_count ?? 3,
    gemini_model: settingsRow?.gemini_model ?? "gemini-3.1-flash-image",
    veo_model: settingsRow?.veo_model ?? "veo-3.1-fast-generate-preview",
    take_duration: job.take_duration ?? settingsRow?.take_duration ?? 8,

    // Voz efetiva: a escolhida no job vence a voz padrão do perfil.
    voice_ref: job.voice_ref ?? settingsRow?.voice_ref ?? null,
  };
  const language = identity?.language || "pt-BR";
  const visualStyle = effectiveVisualStyle(job, settingsRow);

  const prompts = await import("./prompts.server");
  const promptVars = {
    perfil: profile?.name ?? "",
    categoria: profile?.niche || "geral",
    produto: product?.name ?? "",
    preco: product ? Number(product.price).toFixed(2) : "",
    comissao: product ? `${Number(product.commission)}%` : "",
    categoria_produto: product?.niche || "",
    descricao_produto: (product?.description ?? "").slice(0, 2000),
    idioma: language,
    tom_de_voz: identity?.tone ?? "",
    observacoes_estilo: identity?.style_notes ?? "",
    estilo_visual: visualStyle.custom ?? visualStyle.style,
    numero_cenas: settings.takes_count,
    duracao_cena: settings.take_duration,
  };

  // ---------- Etapa 1a: planejar as cenas ----------
  if (stage === "planejando") {
    const scriptBlocks = splitScript(job.script ?? "");
    const template = await prompts.resolvePrompt(supabase, job.profile_id, "cena");
    const prompt = prompts.renderPrompt(template, {
      ...promptVars,
      roteiro: scriptBlocks.map((b, i) => `${i + 1}. ${b}`).join("\n"),
    });

    const planned = await pipeline.planScenes(prompt, settings.takes_count);
    await supabase.from("jobs").update({ scenes: planned, ...trackPatch(job, { render_stage: "cenas" }) }).eq("id", job.id);
    return { stage: "cenas", done: false, progress: { done: 0, total: planned.length } };
  }

  // ---------- Etapa 1b: gerar as imagens das cenas ----------
  if (stage === "cenas") {
    const index = scenes.findIndex((s) => !s.image_url);
    if (index >= 0) {
      const scene = scenes[index]!;
      const personas = await resolveScenePersonas(supabase, job.profile_id, scene.image_prompt);
      const avatar = avatarForScene(job, settingsRow, scenes, index);
      const personRefs = await pipeline.loadPersonReferences(personas ? personas.urls : avatar.urls);
      const productRefs = await pipeline.loadProductReferences(pipeline.productImageUrls(product));
      const references: { base64: string; mimeType: string }[] = [...personRefs, ...productRefs];

      const sceneText = personas ? personas.prompt : scene.image_prompt;
      const identityRequirement = personas
        ? `${pipeline.personaIdentityBlock(personas.labels)}\n\n`
        : personRefs.length
          ? `${pipeline.SAME_PERSON_SUFFIX}\n\n`
          : personDescriptionBlock(avatar.description);
      const referenceGuide = personas
        ? pipeline.buildPersonaGuide(personas.labels, productRefs.length)
        : pipeline.buildReferenceGuide(personRefs.length, productRefs.length);
      const productFacts = product?.description
        ? `\n\nPRODUCT FACTS (from the real listing, obey them): ${String(product.description).replace(/\s+/g, " ").slice(0, 700)}`
        : "";
      const generated = await pipeline.generateSceneImage({
        model: settings.gemini_model,
        prompt: `${visualStyle.prompt}\n\n${identityRequirement}${referenceGuide}${productFacts}\n\nSCENE: ${sceneText} Vertical 9:16 framing. ${pipeline.PRODUCT_FIDELITY_SUFFIX}`,
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
      .update(trackPatch(job, { status: "cenas_geradas", render_stage: null, render_error: null }))
      .eq("id", job.id);
    return { stage: null, done: true, progress: { done: scenes.length, total: scenes.length } };

  }

  // ---------- Etapa 2: animar cada cena com o Veo ----------
  if (stage === "takes") {
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
          await supabase.from("jobs").update({ scenes, ...trackPatch(job, { render_error: null }) }).eq("id", job.id);
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
        .update({ scenes, veo_takes_count: (job.veo_takes_count ?? 0) + 1, ...trackPatch(job, { render_error: null }) })
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
    // Perfil com voz ElevenLabs gera a narração antes da montagem.
    const voice = await resolveElevenLabsVoice(supabase, settings.voice_ref);
    const next = voice ? "narracao" : "montagem";
    await supabase.from("jobs").update(trackPatch(job, { render_stage: next })).eq("id", job.id);
    return { stage: next, done: false, progress: { done: scenes.length, total: scenes.length } };
  }

  // ---------- Etapa 2b: narração na ElevenLabs (uma cena por chamada) ----------
  if (stage === "narracao") {
    const voice = await resolveElevenLabsVoice(supabase, settings.voice_ref);
    if (!voice) {
      await supabase.from("jobs").update(trackPatch(job, { render_stage: "montagem" })).eq("id", job.id);
      return { stage: "montagem", done: false, progress: { done: scenes.length, total: scenes.length } };
    }

    // Idempotência: só regera a cena cujo texto ou voz mudou.
    const index = scenes.findIndex(
      (s) => !s.audio_url || s.audio_text !== s.narration || s.audio_voice !== voice.voice_id,
    );
    if (index >= 0) {
      const scene = scenes[index]!;
      const texto = (scene.narration ?? "").trim();
      if (!texto) {
        scenes[index] = { ...scene, audio_text: scene.narration, audio_voice: voice.voice_id };
        await supabase.from("jobs").update({ scenes }).eq("id", job.id);
        return { stage: "narracao", done: false, progress: { done: index + 1, total: scenes.length } };
      }

      const audio = await pipeline.synthesizeNarration({
        voiceId: voice.voice_id,
        text: texto,
        language,
      });
      const stored = await pipeline.storeMedia(
        `narration/${job.id}/${index}.mp3`,
        audio.bytes,
        "audio/mpeg",
      );
      scenes[index] = {
        ...scene,
        audio_path: stored.path,
        audio_url: stored.url,
        ...(audio.durationSeconds ? { audio_duration: audio.durationSeconds } : {}),
        audio_text: scene.narration,
        audio_voice: voice.voice_id,
      };
      await supabase.from("jobs").update({ scenes, ...trackPatch(job, { render_error: null }) }).eq("id", job.id);

      await consumo.recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "narracao_elevenlabs",
        modelo: pipeline.ELEVENLABS_TARIFA_MODELO,
        quantidade: texto.length / 1000,
        unidade: "mil_caracteres",
        metadados: {
          cena: index + 1,
          caracteres: texto.length,
          voz: voice.nome,
          voice_id: voice.voice_id,
          duracao: audio.durationSeconds,
        },
      });
      return { stage: "narracao", done: false, progress: { done: index + 1, total: scenes.length } };
    }

    await supabase.from("jobs").update(trackPatch(job, { render_stage: "montagem" })).eq("id", job.id);
    return { stage: "montagem", done: false, progress: { done: scenes.length, total: scenes.length } };
  }

  // ---------- Etapa 3: montar no JSON2Video ----------
  if (stage === "montagem") {
    const { providerKey } = await import("./api-keys.server");
    const apiKey = await providerKey("json2video");
    const token = process.env["JSON2VIDEO_WEBHOOK_TOKEN"];
    if (!token) throw new Error("A montagem do vídeo não está configurada corretamente.");

    const assemblyTemplate = await prompts.resolvePrompt(supabase, job.profile_id, "montagem");
    const movieSettings = prompts.parseMovieSettings(prompts.renderPrompt(assemblyTemplate, promptVars));
    const { buildSubtitleVocabulary } = await import("./subtitle-vocabulary");
    const subtitleVocabulary = buildSubtitleVocabulary({
      productName: product?.name,
      sellerName: product?.seller_name,
      narrations: scenes.map((scene) => scene.narration),
    });

    const movie = pipeline.buildMovie({
      jobId: job.id,
      scenes,
      voice: pipeline.VOICE_BY_LANGUAGE[language] ?? pipeline.VOICE_BY_LANGUAGE["pt-BR"]!,
      subtitleLanguage: pipeline.SUBTITLE_LANGUAGES.has(language) ? language : "auto",
      subtitleVocabulary,
      webhookUrl: `${PUBLIC_BASE}/api/public/json2video-webhook/${token}`,
      sceneDuration: settings.take_duration,
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
      .update(trackPatch(job, { render_id: payload.project, render_stage: "render", render_error: null }))
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

  return { stage, done: true, progress: null };
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
    const { withTenantKeys, tenantIdOfProfile } = await import("./api-keys.server");
    const tenantId = await tenantIdOfProfile(supabase, data.profileId);
    const generated = await withTenantKeys(tenantId, () =>
      pipeline.generateSceneImage({
        model: settings?.gemini_model ?? "gemini-3.1-flash-image",
        prompt: `Photorealistic vertical 9:16 portrait of ${data.description}. Natural lighting, neutral background, looking at the camera, social media creator look. No text.`,
        references: [],
      }),
    );

    const stored = await pipeline.storeMedia(
      `avatars/${data.profileId}.jpg`,
      Uint8Array.from(atob(generated.base64), (c) => c.charCodeAt(0)),
      generated.mimeType,
    );

    const { error } = await supabase
      .from("profile_video_settings")
      .update({ avatar_reference_url: stored.url, avatar_reference_urls: [stored.url] })
      .eq("profile_id", data.profileId);
    if (error) throw new Error(error.message);

    return { url: stored.url };
  });

/** Salva até 5 fotos enviadas pelo usuário como referência da pessoa fixa. */
export const saveAvatarReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        images: z
          .array(
            z.union([
              z.object({
                base64: z.string().min(16).max(9_000_000),
                mimeType: z.enum(["image/jpeg", "image/png", "image/jpg", "image/webp"]),
              }),
              z.object({ url: z.string().url() }),
            ]),
          )
          .max(5),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // A própria RLS de profile_video_settings exige a permissão perfis:editar.
    const { error: guardError } = await supabase
      .from("profile_video_settings")
      .upsert({ profile_id: data.profileId, avatar_mode: "fixo" }, { onConflict: "profile_id" });
    if (guardError) throw new Error("Você não tem permissão para editar este perfil.");

    const pipeline = await import("./video-pipeline.server");
    const urls: string[] = [];
    for (const [i, image] of data.images.entries()) {
      if ("url" in image) {
        urls.push(image.url);
        continue;
      }
      const ext = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
      const stored = await pipeline.storeMedia(
        `avatars/${data.profileId}/${Date.now()}-${i + 1}.${ext}`,
        Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0)),
        image.mimeType,
      );
      urls.push(stored.url);
    }

    const { error } = await supabase
      .from("profile_video_settings")
      .update({ avatar_reference_urls: urls, avatar_reference_url: urls[0] ?? null })
      .eq("profile_id", data.profileId);
    if (error) throw new Error(error.message);

    return { urls };
  });
