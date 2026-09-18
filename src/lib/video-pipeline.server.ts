/**
 * Pipeline de vídeo profissional: Gemini (cenas com pessoa usando o produto)
 * -> Veo (animação imagem->vídeo) -> JSON2Video (montagem com narração).
 *
 * Docs oficiais:
 * - Gemini Interactions (imagem): https://ai.google.dev/gemini-api/docs/image-generation
 * - Veo (predictLongRunning):     https://ai.google.dev/gemini-api/docs/video
 * - JSON2Video Movie:             https://json2video.com/docs/v2/reference/json-syntax/movie
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 dias: tempo de sobra para render + revisão

export type ScenePlan = {
  narration: string;
  image_prompt: string;
  motion_prompt: string;
  overlay_text: string;
};

export type Scene = ScenePlan & {
  image_path?: string;
  image_url?: string;
  operation?: string;
  attempts?: number;
  video_path?: string;
  video_url?: string;
  /** Narração em mp3 gerada na ElevenLabs (só quando o perfil usa voz ElevenLabs). */
  audio_path?: string;
  audio_url?: string;
  audio_duration?: number;
  /** Texto e voz usados no mp3: mudou o roteiro/voz, a cena é regerada. */
  audio_text?: string;
  audio_voice?: string;
};

/**
 * O Veo 3.1 SEMPRE gera áudio nativo (não existe parâmetro para desligar na
 * Gemini API) e bloqueia o vídeo quando o áudio é filtrado. Como a narração
 * vem do JSON2Video, o prompt enviado ao Veo precisa ser 100% visual: qualquer
 * frase que mencione fala, voz, música ou som é removida antes do envio.
 */
const AUDIO_WORDS =
  /\b(audio|áudio|voice|voz|voice-?over|narrat\w*|narra\w*|speak\w*|speech|talking|says?|saying|dialog\w*|diálog\w*|whisper\w*|sings?|singing|song|music\w*|música|sound\w*|som|sonor\w*|asmr|noise|ruído|silent|silence|silênc\w*|mute\w*|subtitle\w*|legenda\w*|caption\w*)\b/i;

export function sanitizeMotionPrompt(prompt: string): string {
  const kept = prompt
    .split(/(?<=[.;!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !AUDIO_WORDS.test(sentence));
  const visual = kept.join(" ").trim();
  return visual || "Cinematic handheld camera slowly moves around the subject, natural motion, vertical framing.";
}

/** Vozes Azure (incluídas no plano do JSON2Video) por idioma da identidade do perfil. */
export const VOICE_BY_LANGUAGE: Record<string, string> = {
  "pt-BR": "pt-BR-FranciscaNeural",
  "en-US": "en-US-EmmaMultilingualNeural",
  "es-ES": "es-ES-ElviraNeural",
  "fr-FR": "fr-FR-DeniseNeural",
  "de-DE": "de-DE-KatjaNeural",
  "it-IT": "it-IT-ElsaNeural",
  "ja-JP": "ja-JP-NanamiNeural",
  "ko-KR": "ko-KR-SunHiNeural",
  "id-ID": "id-ID-GadisNeural",
  "ms-MY": "ms-MY-YasminNeural",
  "th-TH": "th-TH-PremwadeeNeural",
  "vi-VN": "vi-VN-HoaiMyNeural",
  "ru-RU": "ru-RU-SvetlanaNeural",
  "ar-SA": "ar-SA-ZariyahNeural",
};

export const SUBTITLE_LANGUAGES = new Set([
  "pt-BR", "pt", "en", "en-US", "es", "fr", "de", "it", "ja", "ko", "id", "ms", "th", "vi", "ru",
]);

const geminiKey = () => {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("A geração de cenas não está configurada. Falta a chave do Google (Gemini/Veo).");
  return key;
};

/** Erro do Google com marcação de "instabilidade temporária" (vale tentar de novo). */
class GoogleApiError extends Error {
  transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = "GoogleApiError";
    this.transient = transient;
  }
}

/** Um erro é transitório quando vale a pena tentar de novo automaticamente. */
export function isTransientError(error: unknown): boolean {
  return !!(error && typeof error === "object" && (error as { transient?: boolean }).transient === true);
}

/** Traduz erros da API do Google para mensagens úteis ao usuário. */
function googleError(status: number, body: string): Error {
  if (status === 429) {
    return new GoogleApiError(
      "O Google está limitando as chamadas agora (429). É temporário: espere alguns minutos e tente de novo.",
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new GoogleApiError("A chave do Google foi recusada. Verifique a chave configurada.", false);
  }
  if (status === 400) {
    return new GoogleApiError(
      `O Google recusou o conteúdo desta cena (400). Ajuste a descrição da imagem e tente de novo. ${body.slice(0, 160)}`,
      false,
    );
  }
  if (status === 408 || status >= 500) {
    return new GoogleApiError(
      `Instabilidade temporária do Google (${status}). Não é problema da sua cena: tente gerar de novo em instantes.`,
      true,
    );
  }
  return new GoogleApiError(`O Google recusou a requisição (${status}). ${body.slice(0, 200)}`, false);
}


/** Baixa uma imagem/arquivo e devolve em base64. */
export async function fetchAsBase64(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Não foi possível baixar o arquivo (${res.status}).`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return {
    base64: btoa(binary),
    bytes: buffer,
    mimeType: res.headers.get("content-type")?.split(";")[0] || "image/jpeg",
  };
}

const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Gera uma imagem 9:16 com o Gemini, usando a foto real do produto como referência. */
export async function generateSceneImage(opts: {
  model: string;
  prompt: string;
  references: { base64: string; mimeType: string }[];
}): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": geminiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      input: [
        { type: "text", text: opts.prompt },
        ...opts.references.map((r) => ({ type: "image", data: r.base64, mime_type: r.mimeType })),
      ],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16" },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw googleError(res.status, text);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("O Gemini devolveu uma resposta inesperada ao gerar a cena.");
  }

  const image = findImagePart(json);
  if (!image) throw new Error("O Gemini não devolveu imagem para esta cena. Tente novamente.");
  return image;
}

/** Procura o payload de imagem na resposta (output_image, outputs[], candidates[]...). */
function findImagePart(value: unknown): { base64: string; mimeType: string } | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const data = obj["data"] ?? obj["base64"];
  const mime = (obj["mime_type"] ?? obj["mimeType"]) as string | undefined;
  if (typeof data === "string" && data.length > 256) {
    return { base64: data, mimeType: mime || "image/jpeg" };
  }
  for (const nested of Object.values(obj)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findImagePart(item);
        if (found) return found;
      }
    } else {
      const found = findImagePart(nested);
      if (found) return found;
    }
  }
  return null;
}

/** Dispara a animação imagem->vídeo no Veo (assíncrono) e devolve o nome da operação. */
export async function startVeoTake(opts: {
  model: string;
  prompt: string;
  image: { base64: string; mimeType: string };
  durationSeconds: number;
}): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/models/${opts.model}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": geminiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [
        {
          prompt: opts.prompt,
          // Formato oficial da Gemini API para image-to-video (não é inlineData).
          image: { bytesBase64Encoded: opts.image.base64, mimeType: opts.image.mimeType },
        },
      ],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: opts.durationSeconds,
        resolution: "720p",
        personGeneration: "allow_adult",
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw googleError(res.status, text);
  const payload = JSON.parse(text) as { name?: string };
  if (!payload.name) throw new Error("O Veo não devolveu a operação de renderização.");
  return payload.name;
}

type VeoVideo = { uri?: string; base64?: string; mimeType?: string };

/**
 * A resposta do Veo varia conforme o modelo/versão: o vídeo pode vir em
 * response.generateVideoResponse.generatedSamples[].video.uri ou em
 * response.generatedVideos[].video (uri ou bytesBase64Encoded). Procura em
 * qualquer profundidade para não depender do formato exato.
 */
function findVeoVideo(node: unknown, depth = 0): VeoVideo | null {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVeoVideo(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const uri = obj["uri"] ?? obj["videoUri"] ?? obj["url"];
  const data = obj["bytesBase64Encoded"] ?? obj["videoBytes"] ?? obj["data"];
  const mime = typeof obj["mimeType"] === "string" ? (obj["mimeType"] as string) : "video/mp4";
  if (typeof uri === "string" && uri) return { uri, mimeType: mime };
  if (typeof data === "string" && data.length > 100) return { base64: data, mimeType: mime };
  for (const value of Object.values(obj)) {
    const found = findVeoVideo(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Junta motivos de bloqueio por filtro de conteúdo (RAI/safety), se houver. */
function findFilterReasons(node: unknown, acc: string[] = [], depth = 0): string[] {
  if (!node || typeof node !== "object" || depth > 8) return acc;
  if (Array.isArray(node)) {
    for (const item of node) findFilterReasons(item, acc, depth + 1);
    return acc;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if ((k.includes("rai") || k.includes("filter") || k.includes("safety") || k.includes("blocked")) && value) {
      if (typeof value === "string") acc.push(value);
      else if (typeof value === "number" && value > 0) acc.push(`${key}: ${value}`);
      else if (Array.isArray(value)) acc.push(...value.filter((v): v is string => typeof v === "string"));
    }
    findFilterReasons(value, acc, depth + 1);
  }
  return acc;
}

/** Bloqueio pelos filtros do Google (inclui o filtro do áudio nativo do Veo). */
export class VeoFilteredError extends Error {}

/** Procura a duração real do vídeo na resposta do Veo (varia por modelo/versão). */
function findVeoDuration(node: unknown, depth = 0): number | null {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVeoDuration(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (k.includes("duration")) {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
      if (Number.isFinite(n) && n > 0) return k.includes("ms") || n > 600 ? n / 1000 : n;
    }
    const found = findVeoDuration(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Consulta a operação do Veo; devolve o MP4 (URI ou base64) quando pronta. */
export async function pollVeoTake(
  operation: string,
): Promise<{ done: boolean; video?: VeoVideo; durationSeconds?: number }> {
  const res = await fetch(`${GEMINI_BASE}/${operation}`, { headers: { "x-goog-api-key": geminiKey() } });
  const text = await res.text();
  if (!res.ok) throw googleError(res.status, text);
  const payload = JSON.parse(text) as { done?: boolean; error?: { message?: string }; response?: unknown };
  if (payload.error?.message) throw new Error(`A animação da cena falhou: ${payload.error.message}`);
  if (!payload.done) return { done: false };

  // Operação concluída: registra a resposta inteira para diagnóstico.
  console.log("[veo] operação concluída", operation, text.slice(0, 4000));

  const video = findVeoVideo(payload.response);
  if (video) {
    const duration = findVeoDuration(payload.response);
    return { done: true, video, ...(duration ? { durationSeconds: duration } : {}) };
  }

  const reasons = [...new Set(findFilterReasons(payload.response))].filter(Boolean);
  if (reasons.length) {
    const detail = reasons.join("; ");
    const audio = /audio|áudio/i.test(detail);
    throw new VeoFilteredError(
      audio
        ? `O Google bloqueou esta cena por causa do áudio que o Veo gera automaticamente (não é erro técnico): ${detail}. Estamos tentando de novo com uma descrição só visual.`
        : `A cena foi bloqueada pelo filtro de conteúdo do Google (não é erro técnico): ${detail}. Ajuste a descrição da cena e gere de novo.`,
    );
  }
  throw new Error(`A animação terminou sem gerar vídeo. Resposta do Google: ${JSON.stringify(payload.response ?? {}).slice(0, 600)}`);
}

/** Baixa o MP4 do Veo: da URI (Files API, exige a chave) ou do base64 devolvido na operação. */
export async function downloadVeoVideo(video: VeoVideo) {
  if (video.uri) return fetchAsBase64(video.uri, { "x-goog-api-key": geminiKey() });
  if (!video.base64) throw new Error("A animação terminou sem gerar vídeo.");
  const binary = atob(video.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { base64: video.base64, bytes, mimeType: video.mimeType ?? "video/mp4" };
}

/**
 * URLs assinadas expiram. Quando a URL aponta para o bucket privado job-media,
 * assina de novo a partir do caminho do objeto antes de usar.
 */
export async function refreshMediaUrl(url: string): Promise<string> {
  const match = url.match(/\/object\/(?:sign|public)\/job-media\/([^?]+)/);
  if (!match?.[1]) return url;
  const path = decodeURIComponent(match[1]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("job-media").createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? url;
}

/** Baixa as imagens de referência da pessoa (até 3) para mandar ao Gemini. */
export async function loadPersonReferences(urls: (string | null | undefined)[]) {
  const refs: { base64: string; mimeType: string }[] = [];
  for (const raw of urls.filter((u): u is string => !!u).slice(0, 3)) {
    try {
      const fresh = await refreshMediaUrl(raw);
      const img = await fetchAsBase64(fresh);
      refs.push({ base64: img.base64, mimeType: img.mimeType });
    } catch {
      // Referência indisponível não pode derrubar a geração da cena.
    }
  }
  return refs;
}

/** URLs das fotos reais do produto (principal + extras do Kalodata), até 4. */
export function productImageUrls(
  product: { image_url?: string | null; extra_image_urls?: unknown } | null,
): string[] {
  const extras = Array.isArray(product?.extra_image_urls)
    ? product!.extra_image_urls.filter((u): u is string => typeof u === "string" && !!u)
    : [];
  return [...new Set([product?.image_url ?? "", ...extras].filter(Boolean))].slice(0, 4);
}

/** Baixa as fotos do produto como referência visual. Falhas são ignoradas. */
export async function loadProductReferences(urls: string[]) {
  const refs: { base64: string; mimeType: string }[] = [];
  for (const url of urls.slice(0, 4)) {
    try {
      const img = await fetchAsBase64(url);
      refs.push({ base64: img.base64, mimeType: img.mimeType });
    } catch {
      // Foto indisponível não pode derrubar a geração da cena.
    }
  }
  return refs;
}

/** Guia de referências + exigência de fidelidade ao produto real. */
export function buildReferenceGuide(personCount: number, productCount: number): string {
  const parts: string[] = [];
  if (personCount > 0) {
    parts.push(
      personCount === 1
        ? "Image 1 is an identity reference of the person."
        : `Images 1 through ${personCount} are identity references of the same person.`,
    );
  }
  if (productCount > 0) {
    const first = personCount + 1;
    const last = personCount + productCount;
    parts.push(
      `Image${productCount > 1 ? `s ${first} to ${last} are` : ` ${first} is`} the real product, shown from different angles. Reproduce the product exactly: identical material, texture, shape, colour, label and proportions. Do not replace it with a similar product from a different category or made of a different material.`,
    );
  }
  return parts.join(" ");
}

/** Bloco prioritário que preserva a identidade exata da pessoa de referência. */
export const SAME_PERSON_SUFFIX =
  "CRITICAL IDENTITY REQUIREMENT: The person in every scene must be the EXACT SAME individual shown in the person reference photos (the first input images). Preserve identity precisely: same facial structure, face shape, eyes, nose, mouth, skin tone, hair color and hairstyle. This is the same real person across all scenes, not a similar-looking person. Do not stylize, beautify, or alter their features. Match the person reference photos as closely as possible.";

/** Exigência de fidelidade ao produto real anexada a cada prompt de cena. */
export const PRODUCT_FIDELITY_SUFFIX =
  "The product must match the reference photos and the product facts exactly: same material, same shape, same finish, same colour and same label. Never substitute it with a similar product from another category or material.";

/** Guarda um arquivo no bucket privado e devolve caminho + URL assinada. */
export async function storeMedia(path: string, bytes: Uint8Array, contentType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from("job-media")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Não foi possível guardar o arquivo gerado: ${error.message}`);
  const { data, error: signError } = await supabaseAdmin.storage
    .from("job-media")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !data?.signedUrl) throw new Error("Não foi possível liberar o arquivo gerado.");
  return { path, url: data.signedUrl };
}

/** Modelo de narração da ElevenLabs e o nome do modelo usado na tarifa. */
export const ELEVENLABS_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_TARIFA_MODELO = "elevenlabs-flash-v2-5";
/** Folga em segundos para a troca de cena nunca cortar o fim da narração. */
export const NARRATION_PADDING = 0.3;

/**
 * Gera o mp3 da narração de uma cena na ElevenLabs. Usa o endpoint
 * with-timestamps, que devolve o alinhamento por caractere: assim a duração
 * real do áudio é lida da própria resposta, sem depender do arquivo.
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 */
export async function synthesizeNarration(opts: {
  voiceId: string;
  text: string;
  model?: string;
  language?: string;
}): Promise<{ bytes: Uint8Array; durationSeconds: number | null }> {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("A narração não está configurada. Falta a chave da ElevenLabs.");

  const body: Record<string, unknown> = { text: opts.text, model_id: opts.model || ELEVENLABS_MODEL };
  const lang = opts.language?.split("-")[0];
  if (lang) body["language_code"] = lang;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const json = (await res.json()) as {
      audio_base64?: string;
      alignment?: { character_end_times_seconds?: number[] };
    };
    if (json.audio_base64) {
      const ends = json.alignment?.character_end_times_seconds ?? [];
      const last = ends.length ? ends[ends.length - 1]! : null;
      return {
        bytes: base64ToBytes(json.audio_base64),
        durationSeconds: typeof last === "number" && last > 0 ? last : null,
      };
    }
  }

  // Fallback: endpoint simples (mp3 puro) com duração estimada pelo bitrate.
  const plain = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!plain.ok) {
    const detail = await plain.text();
    throw new Error(`A ElevenLabs recusou a narração (${plain.status}). ${detail.slice(0, 200)}`);
  }
  const bytes = new Uint8Array(await plain.arrayBuffer());
  // mp3 128 kbps = 16.000 bytes por segundo.
  const estimated = bytes.length / 16000;
  return { bytes, durationSeconds: estimated > 0 ? estimated : null };
}

/** Monta o Movie do JSON2Video costurando os takes com narração, legenda e textos. */
export function buildMovie(opts: {
  jobId: string;
  scenes: Scene[];
  voice: string;
  subtitleLanguage: string;
  webhookUrl: string;
  sceneDuration?: number;
  settings: import("./prompts.server").MovieSettings;
}) {
  const s = opts.settings;
  const scenes = opts.scenes.map((scene) => {
    const elements: Record<string, unknown>[] = [
      {
        type: "video",
        src: scene.video_url,
        duration: -2,
        resize: s.resize,
        width: "100%",
        height: "100%",
        position: "center-center",
        muted: true,
        loop: -1,
      },
    ];

    if (scene.audio_url) {
      // Narração ElevenLabs: áudio externo com duração intrínseca do mp3.
      elements.push({ type: "audio", src: scene.audio_url, start: 0, duration: -1 });
      const audio = (scene.audio_duration ?? 0) + NARRATION_PADDING;
      // A cena precisa comportar o mp3 inteiro, senão a narração é cortada na
      // troca de cena. O vídeo (duration -2, loop -1) acompanha a cena.
      const duration = Math.max(opts.sceneDuration ?? 0, audio);
      return {
        transition: { style: "fade", duration: s.transition },
        ...(duration > 0 ? { duration: Number(duration.toFixed(2)) } : {}),
        elements,
      };
    }

    elements.push({ type: "voice", text: scene.narration, voice: opts.voice, model: "azure" });
    return { transition: { style: "fade", duration: s.transition }, elements };
  });

  return {
    resolution: "instagram-story",
    quality: "high",
    "client-data": { job_id: opts.jobId },
    scenes,
    elements: s.subtitles
      ? [
          {
            type: "subtitles",
            language: opts.subtitleLanguage,
            model: "default",
            settings: {
              style: s.style,
              position: "custom",
              x: 540,
              y: s.positionY,
              "font-family": s.fontFamily,
              "font-size": s.fontSize,
              "max-words-per-line": s.wordsPerLine,
              "word-color": s.textColor,
              "line-color": s.textColor,
              "outline-color": s.outlineColor,
              "outline-width": s.outlineWidth,
              "shadow-color": s.shadowColor,
              "shadow-offset": s.shadowOffset,
            },
          },
        ]
      : [],
    exports: [
      {
        destinations: [{ type: "webhook", endpoint: opts.webhookUrl, "content-type": "application/json" }],
      },
    ],
  };
}

/** Planeja as cenas com a IA nativa do Lovable (JSON estrito). */
export async function planScenes(prompt: string, takes: number): Promise<ScenePlan[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A inteligência artificial não está configurada.");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            narration: { type: "string", description: "Fala narrada desta cena, no idioma do perfil" },
            image_prompt: { type: "string", description: "Prompt em inglês da imagem 9:16 com pessoa ou mão usando o produto" },
            motion_prompt: {
              type: "string",
              description:
                "Prompt em inglês descrevendo APENAS o movimento visual e da câmera. Proibido mencionar fala, voz, narração, diálogo, música, som, silêncio ou legenda.",
            },
            overlay_text: { type: "string", description: "Texto curto na tela (pode ser vazio)" },
          },
          required: ["narration", "image_prompt", "motion_prompt", "overlay_text"],
        },
      },
    },
    required: ["scenes"],
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input: prompt,
      stream: true,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "cenas", strict: true, schema } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("A IA está sobrecarregada. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA acabaram. Adicione créditos para continuar.");
    throw new Error(`Não foi possível planejar as cenas. (${res.status}) ${detail.slice(0, 160)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        else if (event.type === "response.completed" && event.response?.output_text) text = event.response.output_text;
      } catch {
        // frames parciais / keep-alive
      }
    }
  }

  let parsed: { scenes?: ScenePlan[] };
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new Error("A IA devolveu um plano de cenas inválido. Tente novamente.");
  }
  const scenes = (parsed.scenes ?? []).slice(0, takes).map((s) => ({
    narration: String(s.narration ?? "").trim(),
    image_prompt: String(s.image_prompt ?? "").trim(),
    motion_prompt: String(s.motion_prompt ?? "").trim(),
    overlay_text: String(s.overlay_text ?? "").trim(),
  }));
  if (!scenes.length) throw new Error("A IA não conseguiu planejar as cenas. Tente novamente.");
  return scenes;
}
