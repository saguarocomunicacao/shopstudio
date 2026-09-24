/**
 * Núcleo da Análise de vídeo (servidor): Gemini + download de links via Apify.
 */
import { ResultadoSchema, type ResultadoAnalise } from "./video-analise-schema";

export const GEMINI_MODEL = "gemini-3.6-flash";

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


type Row = {
  id: string; tenant_id: string; profile_id: string; created_by: string | null; origem: string;
  youtube_url: string | null; link_url: string | null; storage_path: string | null; mime_type: string | null;
  titulo: string; duracao: number | null; pergunta: string | null; status: string; custo_cents: number | null;
  frames: unknown; apify_run_id: string | null; download_iniciado_em: string | null; so_download: boolean;
  rede_meta: Record<string, unknown> | null; resultado: unknown;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const REDES = ["tiktok", "youtube", "instagram"] as const;

/** Começa o download de um link (status baixando). */
export async function comecarDownload(row: Pick<Row, "id" | "tenant_id" | "origem" | "link_url" | "youtube_url">, soDownload = false) {
  const db = await admin();
  const url = row.link_url || row.youtube_url;
  const rede = row.origem as (typeof REDES)[number];
  try {
    if (!url || !REDES.includes(rede)) throw new ErroAmigavel("Link inválido.");
    const { iniciarDownload } = await import("./apify.server");
    const runId = await iniciarDownload(row.tenant_id, rede, url);
    await db.from("video_analises").update({
      status: "baixando", erro: null, apify_run_id: runId, download_iniciado_em: new Date().toISOString(), so_download: soDownload,
    } as never).eq("id", row.id);
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error && !/MISSING_TENANT_KEY/.test(e.message) ? e.message : e instanceof Error ? e.message : "Não foi possível baixar o link.";
    if (!(e instanceof ErroAmigavel)) console.error("[analise] download", e);
    await db.from("video_analises").update({ status: "erro", erro: msg } as never).eq("id", row.id);
    return { ok: false as const, erro: msg };
  }
}

/** Confere downloads em andamento (cron de 1 min). */
export async function verificarDownloads(limite = 5) {
  const db = await admin();
  const { data } = await db.from("video_analises").select("*").eq("status", "baixando").order("download_iniciado_em").limit(limite);
  const out: { id: string; r: string }[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    out.push({ id: row.id, r: await verificarUm(row).catch((e) => { console.error("[analise] verificar", e); return "falha"; }) });
  }
  return out;
}

async function verificarUm(row: Row): Promise<string> {
  const db = await admin();
  const upd = (v: Record<string, unknown>) => db.from("video_analises").update(v as never).eq("id", row.id);
  const ap = await import("./apify.server");
  const rede = row.origem as (typeof REDES)[number];
  if (!row.apify_run_id) { await upd({ status: "erro", erro: "O download não começou. Tente novamente." }); return "sem_run"; }
  const run = await ap.lerRun(row.tenant_id, row.apify_run_id);
  const idade = Date.now() - new Date(row.download_iniciado_em ?? Date.now()).getTime();
  const registrarCusto = async () => {
    if (!run.custoUsd) return 0;
    const { recordConsumo } = await import("./consumo.server");
    await recordConsumo({
      profileId: row.profile_id, etapa: "apify_download" as never, acao: "analise_video", modelo: `apify:${rede}`,
      unidade: "usd_real" as never, quantidade: run.custoUsd, semDebito: true,
      metadados: { analise_id: row.id, run_id: row.apify_run_id, rede, custo_usd: run.custoUsd },
    });
    return run.custoUsd;
  };
  if (["RUNNING", "READY", "UNKNOWN"].includes(run.status)) {
    if (idade > 10 * 60 * 1000) {
      await ap.abortarRun(row.tenant_id, row.apify_run_id);
      await registrarCusto();
      await upd({ status: "erro", erro: "O download demorou demais (mais de 10 minutos). Tente novamente." });
      return "timeout";
    }
    return "aguardando";
  }
  if (run.status !== "SUCCEEDED") {
    await registrarCusto();
    await upd({ status: "erro", erro: run.status === "TIMED-OUT" ? "O download demorou demais. Tente novamente." : "Não foi possível baixar esse vídeo. Confira se ele é público e ainda está no ar." });
    return run.status;
  }
  await registrarCusto();
  const item = run.datasetId ? await ap.lerItem(row.tenant_id, run.datasetId) : null;
  const mp4 = item ? ap.acharMp4(item) : null;
  if (!item || !mp4) {
    console.error("[analise] item sem mp4", JSON.stringify(item ?? {}).slice(0, 600));
    await upd({ status: "erro", erro: "Não foi possível baixar esse vídeo. Ele pode ser privado ou ter sido removido." });
    return "sem_mp4";
  }
  const meta = ap.extrairMeta(rede, item);
  let arquivo;
  try { arquivo = await ap.baixarArquivo(row.tenant_id, mp4); } catch (e) {
    console.error("[analise] copiar mp4", e);
    await upd({ status: "erro", erro: "Não foi possível copiar o vídeo baixado. Tente novamente." });
    return "copia";
  }
  const path = `${row.tenant_id}/${row.profile_id}/${row.id}/video`;
  const { error } = await db.storage.from("video-analises").upload(path, arquivo.bytes, { contentType: arquivo.mime, upsert: true });
  if (error) { console.error("[analise] upload", error.message); await upd({ status: "erro", erro: "Não foi possível guardar o vídeo baixado." }); return "upload"; }
  const titulo = row.titulo && !/^Vídeo d/.test(row.titulo) ? row.titulo : meta.titulo || row.titulo;
  const base = {
    storage_path: path, mime_type: arquivo.mime, rede_meta: meta, titulo,
    duracao: row.duracao ?? meta.duracao, apify_run_id: null, frames: [],
  };
  if (row.so_download && row.resultado) {
    await upd({ ...base, status: "pronto", so_download: false });
    return "baixado";
  }
  await upd({ ...base, status: "analisando" });
  await rodarAnalise(row.id, false);
  return "analisado";
}

/** Roda o Gemini sobre uma análise (arquivo no storage ou URL do YouTube antiga). */
export async function rodarAnalise(id: string, reanalisar: boolean): Promise<{ ok: boolean; erro?: string }> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("video_analises").select("*").eq("id", id).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) return { ok: false, erro: "Análise não encontrada." };
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
      if (!row.storage_path && row.youtube_url) {
        fileUri = row.youtube_url;
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
}
