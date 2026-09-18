import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração com a ElevenLabs para o catálogo de vozes: listar as vozes da
 * conta, clonar uma voz nova a partir de amostras e gerar o áudio de preview.
 */

const API = "https://api.elevenlabs.io/v1";
export const PREVIEW_MODEL = "eleven_flash_v2_5";
export const PREVIEW_TARIFA_MODELO = "elevenlabs-flash-v2-5";

function apiKey(): string {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("A chave da ElevenLabs não está configurada.");
  return key;
}

const bytesFromBase64 = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

async function readError(res: Response) {
  const body = await res.text();
  return `ElevenLabs respondeu ${res.status}: ${body.slice(0, 400)}`;
}

const generoFrom = (value: unknown): "masculino" | "feminino" | "neutro" | null => {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("female") || raw.includes("mulher")) return "feminino";
  if (raw.includes("male") || raw.includes("homem")) return "masculino";
  if (raw.includes("neutral")) return "neutro";
  return null;
};

/** Gera o mp3 de preview de uma voz e guarda no bucket privado. */
async function buildPreview(voiceId: string, texto: string, profileId: string | null) {
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto, model_id: PREVIEW_MODEL }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const audio = new Uint8Array(await res.arrayBuffer());

  const pipeline = await import("./video-pipeline.server");
  const stored = await pipeline.storeMedia(`voices/${voiceId}-${Date.now()}.mp3`, audio, "audio/mpeg");

  const { recordConsumo } = await import("./consumo.server");
  await recordConsumo({
    profileId,
    etapa: "narracao_elevenlabs",
    modelo: PREVIEW_TARIFA_MODELO,
    quantidade: texto.length / 1000,
    unidade: "mil_caracteres",
    metadados: { tipo: "preview_voz", caracteres: texto.length, voice_id: voiceId },
  });

  return stored.url;
}

/** Vozes disponíveis na conta ElevenLabs (catálogo + clonadas). */
export const listElevenLabsVoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": apiKey() } });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as { voices?: Record<string, unknown>[] };
    return {
      voices: (json.voices ?? []).map((v) => ({
        voiceId: String(v["voice_id"] ?? ""),
        nome: String(v["name"] ?? "Sem nome"),
        genero: generoFrom((v["labels"] as Record<string, unknown> | undefined)?.["gender"]),
        previewUrl: typeof v["preview_url"] === "string" ? (v["preview_url"] as string) : null,
        categoria: String(v["category"] ?? ""),
      })),
    };
  });

/** Clona uma voz a partir de amostras de áudio e salva no catálogo interno. */
export const cloneVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        nome: z.string().min(2).max(80),
        genero: z.enum(["masculino", "feminino", "neutro"]).nullable().default(null),
        profileId: z.string().uuid().nullable().default(null),
        consentimento: z.literal(true),
        samples: z
          .array(
            z.object({
              filename: z.string().min(1).max(120),
              mimeType: z.string().min(3).max(80),
              base64: z.string().min(64).max(20_000_000),
            }),
          )
          .min(1)
          .max(5),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const form = new FormData();
    form.append("name", data.nome);
    form.append("description", "Voz clonada no Shop Studio com consentimento da pessoa.");
    for (const sample of data.samples) {
      form.append("files", new Blob([bytesFromBase64(sample.base64)], { type: sample.mimeType }), sample.filename);
    }

    const res = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": apiKey() }, body: form });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as { voice_id?: string };
    const voiceId = json.voice_id;
    if (!voiceId) throw new Error("A ElevenLabs não devolveu o identificador da voz clonada.");

    const { PREVIEW_PHRASE } = await import("./voices");
    let previewUrl: string | null = null;
    try {
      previewUrl = await buildPreview(voiceId, PREVIEW_PHRASE, data.profileId);
    } catch (e) {
      console.error("[voices] preview da voz clonada falhou", e);
    }

    const { error } = await context.supabase.from("voices").insert({
      nome: data.nome,
      fonte: "clonada",
      voice_id: voiceId,
      genero: data.genero,
      profile_id: data.profileId,
      owner_id: context.userId,
      preview_url: previewUrl,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { voiceId, previewUrl };
  });

/** Gera (ou regera) o preview de uma voz já cadastrada. */
export const generateVoicePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: voice, error } = await context.supabase
      .from("voices")
      .select("id, fonte, voice_id, profile_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!voice) throw new Error("Voz não encontrada.");
    if (voice.fonte === "azure_padrao") {
      throw new Error("As vozes padrão são sintetizadas na montagem e não têm preview da ElevenLabs.");
    }

    const { PREVIEW_PHRASE } = await import("./voices");
    const url = await buildPreview(voice.voice_id, PREVIEW_PHRASE, voice.profile_id);

    const { error: upError } = await context.supabase.from("voices").update({ preview_url: url }).eq("id", voice.id);
    if (upError) throw new Error(upError.message);

    return { url };
  });

/** Renova o link do preview guardado no storage privado (expira em 7 dias). */
export const refreshVoicePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: voice, error } = await context.supabase
      .from("voices")
      .select("id, preview_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!voice?.preview_url) throw new Error("Esta voz ainda não tem preview.");

    const pipeline = await import("./video-pipeline.server");
    const url = await pipeline.refreshMediaUrl(voice.preview_url);
    if (url === voice.preview_url) return { url };
    await context.supabase.from("voices").update({ preview_url: url }).eq("id", voice.id);
    return { url };
  });
