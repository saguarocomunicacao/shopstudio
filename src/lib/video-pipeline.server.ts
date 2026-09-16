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

/** Traduz erros da API do Google para mensagens úteis ao usuário. */
function googleError(status: number, body: string): Error {
  if (status === 429) return new Error("Limite de uso do Google atingido. Tente de novo em alguns minutos.");
  if (status === 401 || status === 403) return new Error("A chave do Google foi recusada. Verifique a chave configurada.");
  return new Error(`O Google recusou a requisição (${status}). ${body.slice(0, 200)}`);
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

/** Consulta a operação do Veo; devolve o MP4 (URI ou base64) quando pronta. */
export async function pollVeoTake(operation: string): Promise<{ done: boolean; video?: VeoVideo }> {
  const res = await fetch(`${GEMINI_BASE}/${operation}`, { headers: { "x-goog-api-key": geminiKey() } });
  const text = await res.text();
  if (!res.ok) throw googleError(res.status, text);
  const payload = JSON.parse(text) as { done?: boolean; error?: { message?: string }; response?: unknown };
  if (payload.error?.message) throw new Error(`A animação da cena falhou: ${payload.error.message}`);
  if (!payload.done) return { done: false };

  // Operação concluída: registra a resposta inteira para diagnóstico.
  console.log("[veo] operação concluída", operation, text.slice(0, 4000));

  const video = findVeoVideo(payload.response);
  if (video) return { done: true, video };

  const reasons = [...new Set(findFilterReasons(payload.response))].filter(Boolean);
  if (reasons.length) {
    throw new Error(
      `A cena foi bloqueada pelo filtro de conteúdo do Google (não é erro técnico): ${reasons.join("; ")}. Ajuste a descrição da cena e gere de novo.`,
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

/** Monta o Movie do JSON2Video costurando os takes com narração, legenda e textos. */
export function buildMovie(opts: {
  jobId: string;
  scenes: Scene[];
  voice: string;
  subtitleLanguage: string;
  webhookUrl: string;
  priceLabel: string | null;
  ctaText: string | null;
}) {
  const scenes = opts.scenes.map((scene, index) => {
    const elements: Record<string, unknown>[] = [
      { type: "video", src: scene.video_url, duration: -2, fit: "cover", muted: true, loop: -1 },
      { type: "voice", text: scene.narration, voice: opts.voice, model: "azure" },
    ];
    if (index === 0 && opts.priceLabel) {
      elements.push({
        type: "text",
        text: opts.priceLabel,
        style: "001",
        y: 220,
        settings: { "font-size": "80px", color: "#FFFFFF", "font-weight": "900" },
      });
    }
    if (scene.overlay_text) {
      elements.push({
        type: "text",
        text: scene.overlay_text,
        style: "008",
        y: 1500,
        settings: { "font-size": "64px", color: "#FFFFFF", "font-weight": "800" },
      });
    }
    if (index === opts.scenes.length - 1 && opts.ctaText) {
      elements.push({
        type: "text",
        text: opts.ctaText,
        style: "001",
        y: 1750,
        settings: { "font-size": "70px", color: "#FFFFFF", "font-weight": "900" },
      });
    }
    return { transition: { style: "fade", duration: 0.4 }, elements };
  });

  return {
    resolution: "instagram-story",
    quality: "high",
    "client-data": { job_id: opts.jobId },
    scenes,
    elements: [{ type: "subtitles", language: opts.subtitleLanguage, model: "default" }],
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
            motion_prompt: { type: "string", description: "Prompt em inglês do movimento da cena para animação" },
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
