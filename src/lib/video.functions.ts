import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Geração de vídeo "produto protagonista" via JSON2Video.
 * Doc: https://json2video.com/docs/v2/reference/json-syntax/movie
 */

const J2V_ENDPOINT = "https://api.json2video.com/v2/movies";
const PUBLIC_BASE = "https://project--c5a0c6dd-28ab-4eee-a22b-3c59cd2e5a81.lovable.app";

/** Vozes Azure (incluídas no plano) por idioma da identidade do perfil. */
const VOICE_BY_LANGUAGE: Record<string, string> = {
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

/** Idiomas aceitos pelo elemento subtitles (transcrição). */
const SUBTITLE_LANGUAGES = new Set([
  "pt-BR", "pt", "en", "en-US", "es", "fr", "de", "it", "ja", "ko", "id", "ms", "th", "vi", "ru",
]);

/** Quebra o roteiro salvo (GANCHO / CORPO / CTA) nos blocos narrados. */
export function splitScript(script: string): string[] {
  const clean = script.replace(/\r/g, "").trim();
  if (!clean) return [];
  const blocks = clean
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .replace(/^\s*(GANCHO[^\n]*|CORPO[^\n]*|CTA[^\n]*)\n?/i, "")
        .trim(),
    )
    .filter(Boolean);
  return blocks.length ? blocks : [clean];
}

function buildMovie(opts: {
  jobId: string;
  imageUrl: string | null;
  blocks: string[];
  voice: string;
  subtitleLanguage: string;
  webhookUrl: string;
}) {
  const scenes = opts.blocks.map((text, index) => ({
    "background-color": "#121212",
    elements: [
      ...(opts.imageUrl
        ? [
            {
              type: "image",
              src: opts.imageUrl,
              duration: -2,
              resize: "cover",
              position: "center-center",
              zoom: index % 2 === 0 ? 1 : -1,
              pan: index % 2 === 0 ? "right" : "left",
            },
          ]
        : []),
      { type: "voice", text, voice: opts.voice, model: "azure" },
    ],
  }));

  return {
    resolution: "instagram-story",
    quality: "high",
    "client-data": { job_id: opts.jobId },
    scenes,
    elements: [{ type: "subtitles", language: opts.subtitleLanguage, model: "default" }],
    exports: [
      {
        destinations: [
          { type: "webhook", endpoint: opts.webhookUrl, "content-type": "application/json" },
        ],
      },
    ],
  };
}

/** Dispara a renderização do vídeo de um job em "roteiro_pronto". */
export const generateJobVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const apiKey = process.env["JSON2VIDEO_API_KEY"];
    if (!apiKey) throw new Error("A geração de vídeo ainda não está configurada. Falta a chave do JSON2Video.");
    const token = process.env["JSON2VIDEO_WEBHOOK_TOKEN"];
    if (!token) throw new Error("A geração de vídeo não está configurada corretamente.");

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, product_id, profile_id, status, script")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Job não encontrado ou sem permissão de acesso.");

    const { data: canEdit, error: permError } = await supabase.rpc("can_edit_pipeline", {
      _profile_id: job.profile_id,
    });
    if (permError) throw new Error(permError.message);
    if (!canEdit) throw new Error("Você não tem permissão para gerar vídeo neste perfil.");

    if (job.status !== "roteiro_pronto") {
      throw new Error("O vídeo só pode ser gerado quando o roteiro está pronto.");
    }

    const blocks = splitScript(job.script ?? "");
    if (!blocks.length) throw new Error("Este job ainda não tem roteiro para narrar.");

    const [{ data: product }, { data: identity }] = await Promise.all([
      job.product_id
        ? supabase.from("products").select("image_url").eq("id", job.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("profile_identities").select("language").eq("profile_id", job.profile_id).maybeSingle(),
    ]);

    const language = identity?.language || "pt-BR";
    const voice = VOICE_BY_LANGUAGE[language] ?? VOICE_BY_LANGUAGE["pt-BR"]!;
    const subtitleLanguage = SUBTITLE_LANGUAGES.has(language) ? language : "auto";

    const movie = buildMovie({
      jobId: job.id,
      imageUrl: product?.image_url || null,
      blocks,
      voice,
      subtitleLanguage,
      webhookUrl: `${PUBLIC_BASE}/api/public/json2video-webhook/${token}`,
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
      throw new Error(`Não foi possível iniciar a geração do vídeo: ${detail}`);
    }

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        status: "gerando_video",
        render_id: payload.project,
        render_started_at: new Date().toISOString(),
        render_error: null,
        video_url: null,
        video_thumbnail_url: null,
      })
      .eq("id", job.id);
    if (updateError) throw new Error(updateError.message);

    return { renderId: payload.project, status: "gerando_video" as const };
  });
