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

class ErroAmigavel extends Error {
  detalhe?: string;
  constructor(msg: string, detalhe?: string) {
    super(msg);
    this.detalhe = detalhe;
  }
}

const PARTE = 8 * 1024 * 1024; // múltiplo de 256 KB, exigido pelo upload resumable

type ArquivoGemini = { name: string; uri: string; state: string };

/**
 * Envia o vídeo do storage para a Files API em partes de 8 MB (upload resumable).
 * Cada parte é lida do storage por Range: nunca o arquivo inteiro na memória.
 */
async function enviarParaGeminiPorPartes(key: string, signedUrl: string, mime: string): Promise<ArquivoGemini & { bytes: number }> {
  const probe = await fetch(signedUrl, { headers: { Range: "bytes=0-0" } });
  const total = Number((probe.headers.get("content-range") ?? "").split("/")[1] ?? 0);
  await probe.body?.cancel().catch(() => null);
  if (!total) throw new ErroAmigavel("O arquivo do vídeo não foi encontrado. Envie de novo.", `probe ${probe.status} sem content-range`);

  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(total),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "analise" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    const d = (await start.text().catch(() => "")).slice(0, 300);
    console.error("[analise] upload start", start.status, d);
    throw new ErroAmigavel("Não foi possível enviar o vídeo para análise.", `upload start ${start.status} ${d}`);
  }

  let info: { file?: { name?: string; uri?: string; state?: string } } = {};
  for (let offset = 0; offset < total; offset += PARTE) {
    const fim = Math.min(offset + PARTE, total) - 1;
    const parte = await fetch(signedUrl, { headers: { Range: `bytes=${offset}-${fim}` } });
    if (parte.status !== 206 && !(offset === 0 && fim === total - 1 && parte.ok)) {
      await parte.body?.cancel().catch(() => null);
      throw new ErroAmigavel("Não foi possível ler o arquivo do vídeo.", `range ${offset}-${fim} status ${parte.status}`);
    }
    const buf = await parte.arrayBuffer();
    const ultima = fim === total - 1;
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": String(offset),
        "X-Goog-Upload-Command": ultima ? "upload, finalize" : "upload",
        "Content-Length": String(buf.byteLength),
      },
      body: buf,
    });
    if (!up.ok) {
      const d = (await up.text().catch(() => "")).slice(0, 300);
      console.error("[analise] upload parte", offset, up.status, d);
      throw new ErroAmigavel("Não foi possível enviar o vídeo para análise.", `upload parte ${offset} ${up.status} ${d}`);
    }
    if (ultima) info = (await up.json().catch(() => ({}))) as typeof info;
    else await up.body?.cancel().catch(() => null);
  }
  if (!info.file?.uri || !info.file.name) throw new ErroAmigavel("Não foi possível enviar o vídeo para análise.", `finalize sem file: ${JSON.stringify(info).slice(0, 300)}`);
  return { name: info.file.name, uri: info.file.uri, state: info.file.state ?? "PROCESSING", bytes: total };
}

async function estadoArquivoGemini(key: string, name: string): Promise<{ state: string; erro?: string }> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${key}`);
  const j = (await r.json().catch(() => ({}))) as { state?: string; error?: { message?: string } };
  if (!r.ok) return { state: "UNKNOWN", erro: `${r.status} ${JSON.stringify(j).slice(0, 300)}` };
  return { state: j.state ?? "UNKNOWN", ...(j.error?.message ? { erro: j.error.message } : {}) };
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
    if (res.status === 429) throw new ErroAmigavel("O serviço de análise está ocupado. Tente de novo em instantes.", `gemini ${res.status} ${detail.slice(0, 300)}`);
    if (res.status === 400 || res.status === 403 || res.status === 404)
      throw new ErroAmigavel("Não foi possível abrir esse vídeo. Se for do YouTube, confira se ele é público e está disponível.", `gemini ${res.status} ${detail.slice(0, 300)}`);
    throw new ErroAmigavel("Não foi possível analisar o vídeo agora.", `gemini ${res.status} ${detail.slice(0, 300)}`);
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
    if (!soDownload) await db.from("video_analises").update({ status: "erro", erro: msg } as never).eq("id", row.id);
    return { ok: false as const, erro: msg };
  }
}

/**
 * Reivindica a linha pelo run_id (atômico: só um processo — webhook ou varredura — ganha).
 * Se o run ainda estiver rodando, devolve a linha com o horário original de início.
 */
async function reivindicarEProcessar(runId: string, inicioOriginal?: string | null) {
  const db = await admin();
  let q = db
    .from("video_analises")
    .update({ download_iniciado_em: null } as never)
    .eq("apify_run_id", runId)
    .eq("status", "baixando")
    .not("download_iniciado_em", "is", null);
  if (inicioOriginal) q = q.eq("download_iniciado_em", inicioOriginal);
  const { data } = await q.select("*");
  const antes = ((data ?? []) as unknown as Row[])[0];
  if (!antes) return "ignorado";
  // A linha retornada já vem com o campo zerado; buscamos o início pelo argumento ou usamos agora.
  const inicio = inicioOriginal ?? new Date().toISOString();
  const r = await verificarUm({ ...antes, download_iniciado_em: inicio });
  if (r === "aguardando") {
    await db.from("video_analises").update({ download_iniciado_em: inicio } as never)
      .eq("id", antes.id).eq("status", "baixando").is("download_iniciado_em", null);
  }
  return r;
}

/** Chamado pelo webhook do Apify quando o run termina. Idempotente por run_id. */
export async function concluirDownload(runId: string) {
  const db = await admin();
  const { data } = await db.from("video_analises").select("download_iniciado_em")
    .eq("apify_run_id", runId).eq("status", "baixando").maybeSingle();
  const inicio = (data as { download_iniciado_em: string | null } | null)?.download_iniciado_em;
  if (!inicio) return "ignorado";
  return reivindicarEProcessar(runId, inicio);
}

/** Rede de segurança: downloads parados há mais de 3 min sem webhook são consultados direto no Apify. */
export async function varrerDownloadsParados(limite = 10) {
  const db = await admin();
  const corte = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data } = await db.from("video_analises").select("apify_run_id, download_iniciado_em")
    .eq("status", "baixando").not("apify_run_id", "is", null).not("download_iniciado_em", "is", null)
    .lt("download_iniciado_em", corte).order("download_iniciado_em").limit(limite);
  const out: { run: string; r: string }[] = [];
  for (const l of (data ?? []) as { apify_run_id: string; download_iniciado_em: string }[]) {
    try { out.push({ run: l.apify_run_id, r: await reivindicarEProcessar(l.apify_run_id, l.download_iniciado_em) }); }
    catch (e) { console.error("[analise] varredura", e); out.push({ run: l.apify_run_id, r: "erro" }); }
  }
  return out;
}

async function verificarUm(row: Row): Promise<string> {
  const db = await admin();
  const upd = (v: Record<string, unknown>) => db.from("video_analises").update(v as never).eq("id", row.id);
  const falhar = (erro: string) =>
    row.so_download && row.resultado ? upd({ status: "pronto", so_download: false, apify_run_id: null, erro }) : upd({ status: "erro", erro });
  const ap = await import("./apify.server");
  const rede = row.origem as (typeof REDES)[number];
  if (!row.apify_run_id) { await falhar("O download não começou. Tente novamente."); return "sem_run"; }
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
    if (idade > 15 * 60 * 1000) {
      await ap.abortarRun(row.tenant_id, row.apify_run_id);
      await registrarCusto();
      await falhar("O download demorou demais. Tente novamente.");
      return "timeout";
    }
    return "aguardando";
  }
  if (run.status !== "SUCCEEDED") {
    await registrarCusto();
    await falhar(run.status === "TIMED-OUT" ? "O download demorou demais. Tente novamente." : "Não foi possível baixar esse vídeo. Confira se ele é público e ainda está no ar.");
    return run.status;
  }
  await registrarCusto();
  const item = run.datasetId ? await ap.lerItem(row.tenant_id, run.datasetId) : null;
  const mp4 = item ? ap.acharMp4(item) : null;
  if (!item || !mp4) {
    console.error("[analise] item sem mp4", JSON.stringify(item ?? {}).slice(0, 600));
    await falhar("Não foi possível baixar esse vídeo. Ele pode ser privado ou ter sido removido.");
    return "sem_mp4";
  }
  const meta = ap.extrairMeta(rede, item);
  let arquivo;
  try { arquivo = await ap.baixarArquivo(row.tenant_id, mp4); } catch (e) {
    console.error("[analise] copiar mp4", e);
    await falhar("Não foi possível copiar o vídeo baixado. Tente novamente.");
    return "copia";
  }
  const path = `${row.tenant_id}/${row.profile_id}/${row.id}/video`;
  const { error } = await db.storage.from("video-analises").upload(path, arquivo.bytes, { contentType: arquivo.mime, upsert: true });
  if (error) { console.error("[analise] upload", error.message); await falhar("Não foi possível guardar o vídeo baixado."); return "upload"; }
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

