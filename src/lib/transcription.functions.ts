import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ditado por voz: o áudio é enviado ao Gemini apenas para transcrever e é
 * descartado em seguida (nunca gravamos o arquivo em lugar nenhum).
 */

const MODELO = "gemini-3.6-flash-audio";
const GEMINI_MODEL = "gemini-3.6-flash";

const INSTRUCAO = [
  "Transcreva literalmente o áudio em português do Brasil (pt-BR).",
  "Responda somente com o texto falado, sem comentários, sem aspas e sem rótulos.",
  "Corrija apenas pontuação e capitalização; não resuma, não traduza e não invente palavras.",
  "Se não houver fala audível, responda exatamente: (sem fala)",
].join(" ");

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        jobId: z.string().uuid().nullable().optional(),
        /** Áudio em base64, sem o prefixo data:. */
        audioBase64: z.string().min(100).max(14_000_000),
        mimeType: z.string().trim().min(3).max(100),
        durationSeconds: z.number().min(0).max(600).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: canEdit, error: permError } = await context.supabase.rpc("can_edit_pipeline", {
      _profile_id: data.profileId,
    });
    if (permError) throw new Error(permError.message);
    if (!canEdit) throw new Error("Você não tem permissão para criar conteúdo neste perfil.");

    const { resolveApiKey, tenantIdOfProfile } = await import("./api-keys.server");
    const tenantId = await tenantIdOfProfile(context.supabase, data.profileId);
    const key = await resolveApiKey(tenantId, "gemini");

    if (data.durationSeconds && data.durationSeconds < 1) {
      throw new Error("O áudio ficou muito curto. Segure o microfone e fale por alguns segundos.");
    }

    const mime = data.mimeType.split(";")[0]?.trim() || "audio/webm";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: INSTRUCAO }, { inline_data: { mime_type: mime, data: data.audioBase64 } }],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "text/plain" },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[transcricao] falha do Google", res.status, detail.slice(0, 300));
      if (res.status === 429) throw new Error("O serviço de transcrição está ocupado. Tente de novo em instantes.");
      if (res.status === 401 || res.status === 403) throw new Error("A chave do Google foi recusada para a transcrição.");
      if (res.status === 400) throw new Error("O áudio não pôde ser transcrito. Grave de novo, falando mais perto do microfone.");
      throw new Error("Não foi possível transcrever o áudio agora. Tente de novo ou digite o assunto.");
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number };
    };
    const texto = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!texto || texto.toLowerCase().includes("(sem fala)")) {
      throw new Error("Não consegui entender nenhuma fala nesse áudio. Grave de novo ou digite o assunto.");
    }

    const minutos = data.durationSeconds > 0 ? data.durationSeconds / 60 : 0;
    if (minutos > 0) {
      const { recordConsumo } = await import("./consumo.server");
      await recordConsumo({
        jobId: data.jobId ?? null,
        profileId: data.profileId,
        etapa: "transcricao_audio",
        modelo: MODELO,
        unidade: "minuto_audio",
        quantidade: Number(minutos.toFixed(3)),
        metadados: { origem: "ditado_assunto", segundos: Math.round(data.durationSeconds) },
      });
    }

    return { texto };
  });
