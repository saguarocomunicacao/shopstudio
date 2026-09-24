import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GEMINI_MODEL = "gemini-3.6-flash";

const YT_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i;

export const criarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        origem: z.enum(["arquivo", "youtube"]),
        youtubeUrl: z.string().trim().max(500).nullable(),
        mimeType: z.string().max(100).nullable(),
        titulo: z.string().trim().max(200),
        duracao: z.number().min(0).max(36000).nullable(),
        pergunta: z.string().trim().max(1000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: data.profileId });
    if (!ok) throw new Error("Você não tem permissão para criar conteúdo neste perfil.");
    if (data.origem === "youtube" && !YT_RE.test(data.youtubeUrl ?? "")) {
      throw new Error("Esse link não parece ser de um vídeo do YouTube.");
    }
    const { assertSaldoPerfil, tenantOfProfile } = await import("./saldo.server");
    await assertSaldoPerfil(data.profileId, { analise_video: 1 });
    const tenantId = await tenantOfProfile(data.profileId);
    if (!tenantId) throw new Error("Perfil não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = crypto.randomUUID();
    const storagePath = data.origem === "arquivo" ? `${tenantId}/${data.profileId}/${id}/video` : null;
    const { error } = await supabaseAdmin.from("video_analises").insert({
      id,
      tenant_id: tenantId,
      profile_id: data.profileId,
      created_by: context.userId,
      origem: data.origem,
      youtube_url: data.origem === "youtube" ? data.youtubeUrl : null,
      storage_path: storagePath,
      mime_type: data.mimeType,
      titulo: data.titulo || (data.origem === "youtube" ? "Vídeo do YouTube" : "Vídeo enviado"),
      duracao: data.duracao,
      pergunta: data.pergunta || null,
      status: data.origem === "arquivo" ? "enviando" : "analisando",
    });
    if (error) {
      console.error("[analise] insert", error.message);
      throw new Error("Não foi possível iniciar a análise.");
    }
    return { id, storagePath };
  });

const ts = z.coerce.number().catch(0);
const txt = z.coerce.string().catch("");
const ResultadoSchema = z.object({
  resumo: txt,
  transcricao: z.array(z.object({ inicio: ts, fim: ts, texto: txt })).catch([]),
  cenas: z
    .array(
      z.object({
        inicio: ts,
        fim: ts,
        descricao_visual: txt,
        texto_na_tela: txt,
        pessoa_ou_mao: txt,
        produto_visivel: txt,
      }),
    )
    .catch([]),
  gancho: z.object({ texto: txt, por_que_funciona: txt }),
  cta: z.object({ texto: txt, momento: ts }),
  produto: z.object({ nome: txt, categoria: txt, como_e_mostrado: txt }),
  tom_de_voz: txt,
  ritmo: z.object({ cortes_por_minuto: ts, descricao: txt }),
  formato: txt,
  hashtags_sugeridas: z.array(txt).catch([]),
  titulo_video: txt.optional(),
  duracao_segundos: ts.optional(),
});
export type ResultadoAnalise = z.infer<typeof ResultadoSchema>;

const S = { type: "STRING" };
const N = { type: "NUMBER" };
const obj = (props: Record<string, unknown>) => ({ type: "OBJECT", properties: props, required: Object.keys(props) });
const RESPONSE_SCHEMA = obj({
  resumo: S,
  transcricao: { type: "ARRAY", items: obj({ inicio: N, fim: N, texto: S }) },
  cenas: {
    type: "ARRAY",
    items: obj({ inicio: N, fim: N, descricao_visual: S, texto_na_tela: S, pessoa_ou_mao: S, produto_visivel: S }),
  },
  gancho: obj({ texto: S, por_que_funciona: S }),
  cta: obj({ texto: S, momento: N }),
  produto: obj({ nome: S, categoria: S, como_e_mostrado: S }),
  tom_de_voz: S,
  ritmo: obj({ cortes_por_minuto: N, descricao: S }),
  formato: S,
  hashtags_sugeridas: { type: "ARRAY", items: S },
  titulo_video: S,
  duracao_segundos: N,
});

class ErroAmigavel extends Error {}

async function enviarParaGemini(key: string, bytes: ArrayBuffer, mime: string): Promise<string> {
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "analise" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    console.error("[analise] upload start", start.status, (await start.text()).slice(0, 300));
    throw new ErroAmigavel("Não foi possível enviar o vídeo para análise.");
  }
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  const info = (await up.json().catch(() => ({}))) as { file?: { name?: string; uri?: string; state?: string } };
  if (!up.ok || !info.file?.uri) {
    console.error("[analise] upload", up.status, JSON.stringify(info).slice(0, 300));
    throw new ErroAmigavel("Não foi possível enviar o vídeo para análise.");
  }
  let state = info.file.state;
  for (let i = 0; i < 60 && state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${info.file.name}?key=${key}`);
    state = ((await r.json().catch(() => ({}))) as { state?: string }).state;
  }
  if (state !== "ACTIVE") throw new ErroAmigavel("O vídeo não pôde ser processado. Tente outro arquivo.");
  return info.file.uri;
}

async function gerar(key: string, fileUri: string, mime: string | null, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ file_data: mime ? { file_uri: fileUri, mime_type: mime } : { file_uri: fileUri } }, { text: prompt }],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[analise] gemini", res.status, detail.slice(0, 400));
    if (res.status === 429) throw new ErroAmigavel("O serviço de análise está ocupado. Tente de novo em instantes.");
    if (res.status === 400 || res.status === 403 || res.status === 404)
      throw new ErroAmigavel("Não foi possível abrir esse vídeo. Se for do YouTube, confira se ele é público e está disponível.");
    throw new ErroAmigavel("Não foi possível analisar o vídeo agora.");
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const texto = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { texto, uso: body.usageMetadata ?? {} };
}

export const executarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reanalisar: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("video_analises").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Análise não encontrada.");
    const { data: ok } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: row.profile_id });
    if (!ok) throw new Error("Você não tem permissão para analisar vídeos neste perfil.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upd = (v: Record<string, unknown>) => supabaseAdmin.from("video_analises").update(v as never).eq("id", row.id);

    try {
      if (data.reanalisar) {
        const { assertSaldoPerfil } = await import("./saldo.server");
        await assertSaldoPerfil(row.profile_id, { analise_video: 1 });
      }
      await upd({ status: "analisando", erro: null });
      const { resolveApiKey } = await import("./api-keys.server");
      const key = await resolveApiKey(row.tenant_id, "gemini");

      let fileUri: string;
      let mime: string | null = null;
      if (row.origem === "youtube") {
        fileUri = row.youtube_url!;
      } else {
        const { data: blob, error } = await supabaseAdmin.storage.from("video-analises").download(row.storage_path!);
        if (error || !blob) throw new ErroAmigavel("O arquivo enviado não foi encontrado. Envie de novo.");
        mime = row.mime_type || blob.type || "video/mp4";
        fileUri = await enviarParaGemini(key, await blob.arrayBuffer(), mime);
      }

      const { resolvePrompt, renderPrompt } = await import("./prompts.server");
      let base = "";
      try {
        base = await resolvePrompt(supabaseAdmin, row.profile_id, "analise_video");
      } catch {
        base = "Analise o vídeo curto de venda em português do Brasil. Foco: {pergunta}";
      }
      const prompt =
        renderPrompt(base, { pergunta: row.pergunta || "análise padrão completa" }) +
        "\n\nResponda somente no JSON do schema. Tempos em segundos. resumo com no máximo 3 linhas.";

      let resultado: ResultadoAnalise | null = null;
      let tokensIn = 0;
      let tokensOut = 0;
      for (let tentativa = 0; tentativa < 2 && !resultado; tentativa++) {
        const { texto, uso } = await gerar(key, fileUri, mime, prompt);
        tokensIn += uso.promptTokenCount ?? 0;
        tokensOut += uso.candidatesTokenCount ?? 0;
        try {
          resultado = ResultadoSchema.parse(JSON.parse(texto));
        } catch (e) {
          console.error("[analise] json inválido", tentativa, String(e).slice(0, 200));
        }
      }

      const { recordConsumo } = await import("./consumo.server");
      const eventoId = await recordConsumo({
        profileId: row.profile_id,
        etapa: "analise_video",
        acao: "analise_video",
        modelo: GEMINI_MODEL,
        unidade: "token_input",
        quantidade: tokensIn,
        metadados: { analise_id: row.id, origem: row.origem },
      });
      if (tokensOut)
        await recordConsumo({
          profileId: row.profile_id,
          etapa: "analise_video",
          acao: "analise_video",
          modelo: GEMINI_MODEL,
          unidade: "token_output",
          quantidade: tokensOut,
          semDebito: true,
          metadados: { analise_id: row.id },
        });
      let custo = 0;
      if (eventoId) {
        const { data: ev } = await supabaseAdmin.from("consumo_eventos").select("tool_price_cents").eq("id", eventoId).maybeSingle();
        custo = Number(ev?.tool_price_cents ?? 0);
      }

      if (!resultado) throw new ErroAmigavel("A análise voltou incompleta. Tente novamente.");

      const titulo =
        row.origem === "youtube" && resultado.titulo_video ? resultado.titulo_video.slice(0, 200) : row.titulo;
      await upd({
        status: "pronto",
        resultado,
        titulo,
        duracao: row.duracao ?? (resultado.duracao_segundos || null),
        consumo_evento_id: eventoId,
        custo_cents: Number(row.custo_cents ?? 0) + custo,
        frames: data.reanalisar ? [] : row.frames,
      });
      if (row.created_by) {
        await supabaseAdmin.from("notificacoes").insert({
          tenant_id: row.tenant_id,
          user_id: row.created_by,
          tipo: "analise_pronta",
          texto: `Análise pronta: ${titulo}`,
          origem: "usuario",
        });
      }
      return { ok: true };
    } catch (e) {
      const msg =
        e instanceof ErroAmigavel || (e instanceof Error && e.name === "SemSaldo")
          ? (e as Error).message
          : "Não foi possível analisar o vídeo agora.";
      if (!(e instanceof ErroAmigavel)) console.error("[analise] falha", e);
      await upd({ status: "erro", erro: msg });
      return { ok: false, erro: msg };
    }
  });
