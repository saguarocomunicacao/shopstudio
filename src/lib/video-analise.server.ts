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
  detalhe: string | undefined;
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
    const { data: atual } = await db.from("video_analises").select("etapa_log").eq("id", row.id).maybeSingle();
    const logAtual = ((atual as { etapa_log?: unknown[] } | null)?.etapa_log ?? []) as unknown[];
    const ultimo = logAtual[logAtual.length - 1] as { etapa?: string } | undefined;
    await db.from("video_analises").update({
      etapa_log: ultimo?.etapa === "baixando" && logAtual.length === 1 ? logAtual : [...logAtual, { etapa: "baixando", em: new Date().toISOString(), run_id: runId }],
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
  const logDl = async (entrada: Record<string, unknown>) => {
    const { data: atual } = await db.from("video_analises").select("etapa_log").eq("id", row.id).maybeSingle();
    return [...(((atual as { etapa_log?: unknown[] } | null)?.etapa_log ?? []) as unknown[]), { em: new Date().toISOString(), ...entrada }];
  };
  const falhar = async (erro: string, detalhe?: string) => {
    const etapa_log = await logDl({ etapa: "erro", motivo: erro, ...(detalhe ? { detalhe } : {}), run_id: row.apify_run_id });
    return row.so_download && row.resultado ? upd({ status: "pronto", so_download: false, apify_run_id: null, erro, etapa_log }) : upd({ status: "erro", erro, etapa_log });
  };
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
    await falhar(run.status === "TIMED-OUT" ? "O download demorou demais. Tente novamente." : "Não foi possível baixar esse vídeo. Confira se ele é público e ainda está no ar.", `Apify: ${run.status}`);
    return run.status;
  }
  await registrarCusto();
  const item = run.datasetId ? await ap.lerItem(row.tenant_id, run.datasetId) : null;
  const mp4 = item ? ap.acharMp4(item) : null;
  if (!item || !mp4) {
    console.error("[analise] item sem mp4", JSON.stringify(item ?? {}).slice(0, 600));
    const errApify = item && typeof (item as Record<string, unknown>)["error"] === "string" ? String((item as Record<string, unknown>)["error"]) : null;
    await falhar("Não foi possível baixar esse vídeo. Ele pode ser privado ou ter sido removido.", errApify ? `Apify: ${errApify}` : item ? "Apify: resultado sem arquivo de vídeo" : "Apify: nenhum resultado");
    return "sem_mp4";
  }
  const meta = ap.extrairMeta(rede, item);
  let arquivo;
  try { arquivo = await ap.baixarArquivo(row.tenant_id, mp4); } catch (e) {
    console.error("[analise] copiar mp4", e);
    await falhar("Não foi possível copiar o vídeo baixado. Tente novamente.", e instanceof Error ? e.message : undefined);
    return "copia";
  }
  const path = `${row.tenant_id}/${row.profile_id}/${row.id}/video`;
  const { error } = await db.storage.from("video-analises").upload(path, arquivo.bytes, { contentType: arquivo.mime, upsert: true });
  if (error) { console.error("[analise] upload", error.message); await falhar("Não foi possível guardar o vídeo baixado."); return "upload"; }
  const titulo = row.titulo && !/^Vídeo d/.test(row.titulo) ? row.titulo : meta.titulo || row.titulo;
  const base = {
    storage_path: path, mime_type: arquivo.mime, rede_meta: meta, titulo, arquivo_bytes: arquivo.bytes.byteLength,
    etapa_log: await logDl({ etapa: "baixado" }),
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

// ===================== Análise assíncrona em etapas =====================
// enviando → processando_no_gemini → gerando → pronto | erro
// Cada chamada de avancarAnalise reivindica a linha (passo_lock), avança o que der e solta.

type Etapa = "enviando" | "processando_no_gemini" | "gerando" | "pronto" | "erro";
const LIMITE_ANALISE_MS = 15 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;

type RowAnalise = Row & {
  gemini_file_name: string | null; gemini_file_uri: string | null; etapa: string | null;
  analise_iniciada_em: string | null; tentativas: number; etapa_log: Record<string, unknown>[] | null;
  updated_at: string; created_at: string;
};

/** Marca o início (ou nova tentativa) da análise. Não chama a IA. */
export async function iniciarAnalise(id: string, reanalisar: boolean): Promise<{ ok: boolean; erro?: string }> {
  const db = await admin();
  const { data } = await db.from("video_analises").select("*").eq("id", id).maybeSingle();
  const row = data as unknown as RowAnalise | null;
  if (!row) return { ok: false, erro: "Análise não encontrada." };
  try {
    if (reanalisar) {
      const { assertSaldoPerfil } = await import("./saldo.server");
      await assertSaldoPerfil(row.profile_id, { analise_video: 1 });
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Sem saldo." };
  }
  if (!row.storage_path && !row.youtube_url) return { ok: false, erro: "O arquivo do vídeo não foi encontrado. Envie de novo." };
  const agora = new Date().toISOString();
  const tentativa = (row.tentativas ?? 0) + 1;
  // Vídeo antigo do YouTube por URL: não há envio, vai direto para gerar.
  const etapa: Etapa = row.storage_path ? "enviando" : "gerando";
  await db.from("video_analises").update({
    status: "analisando", erro: null, etapa, etapa_em: agora, analise_iniciada_em: agora, tentativas: tentativa,
    gemini_file_name: null, gemini_file_uri: row.storage_path ? null : row.youtube_url, passo_lock: null,
    etapa_log: [...(row.etapa_log ?? []), { etapa, em: agora, tentativa }],
  } as never).eq("id", id);
  return { ok: true };
}

/** Compatibilidade: inicia e já avança (usado após o download de links). */
export async function rodarAnalise(id: string, reanalisar: boolean): Promise<{ ok: boolean; erro?: string }> {
  const r = await iniciarAnalise(id, reanalisar);
  if (!r.ok) return r;
  await avancarAnalise(id);
  return { ok: true };
}

export async function avancarAnalise(id: string): Promise<string> {
  const db = await admin();
  const corte = new Date(Date.now() - LOCK_MS).toISOString();
  const { data } = await db.from("video_analises")
    .update({ passo_lock: new Date().toISOString() } as never)
    .eq("id", id).eq("status", "analisando")
    .or(`passo_lock.is.null,passo_lock.lt.${corte}`)
    .select("*");
  const row = ((data ?? []) as unknown as RowAnalise[])[0];
  if (!row) return "ocupado";

  let log = row.etapa_log ?? [];
  const upd = (v: Record<string, unknown>) => db.from("video_analises").update(v as never).eq("id", row.id);
  const mudar = async (etapa: Etapa, extra: Record<string, unknown> = {}, info: Record<string, unknown> = {}) => {
    const em = new Date().toISOString();
    log = [...log, { etapa, em, tentativa: row.tentativas, ...info }];
    row.etapa = etapa;
    await upd({ etapa, etapa_em: em, etapa_log: log, passo_lock: em, ...extra });
  };
  const falhar = async (msg: string, detalhe?: string) => {
    await mudar("erro", { status: "erro", erro: msg, passo_lock: null }, { erro: detalhe ?? msg, etapa_anterior: row.etapa });
  };

  const inicio = new Date(row.analise_iniciada_em ?? row.created_at).getTime();
  if (Date.now() - inicio > LIMITE_ANALISE_MS) {
    await falhar("A análise demorou demais. Tente novamente.", `timeout 15 min na etapa ${row.etapa ?? "desconhecida"}`);
    return "timeout";
  }
  if (!row.etapa) {
    // Análise antiga, anterior às etapas: aguarda o limite de 15 min.
    await upd({ passo_lock: null });
    return "legado";
  }

  try {
    const { resolveApiKey } = await import("./api-keys.server");
    const key = await resolveApiKey(row.tenant_id, "gemini");
    const mime = row.mime_type || "video/mp4";

    if (row.etapa === "enviando") {
      const t0 = Date.now();
      const { data: s, error } = await db.storage.from("video-analises").createSignedUrl(row.storage_path!, 900);
      if (error || !s?.signedUrl) throw new ErroAmigavel("O arquivo do vídeo não foi encontrado. Envie de novo.", error?.message);
      const arq = await enviarParaGeminiPorPartes(key, s.signedUrl, mime);
      row.gemini_file_name = arq.name;
      row.gemini_file_uri = arq.uri;
      await mudar("processando_no_gemini", { gemini_file_name: arq.name, gemini_file_uri: arq.uri },
        { envio_segundos: Math.round((Date.now() - t0) / 1000), bytes: arq.bytes, estado_inicial: arq.state });
    }

    if (row.etapa === "processando_no_gemini") {
      // Espera até ~60s nesta chamada; se ainda estiver processando, a próxima chamada continua.
      for (let i = 0; i < 12; i++) {
        const st = await estadoArquivoGemini(key, row.gemini_file_name!);
        if (st.state === "ACTIVE") { await mudar("gerando", {}, { estado: "ACTIVE" }); break; }
        if (st.state === "FAILED") throw new ErroAmigavel("O Gemini não conseguiu processar esse vídeo. Tente outro arquivo.", `file FAILED ${st.erro ?? ""}`);
        if (st.state === "UNKNOWN" && st.erro && /40[34]/.test(st.erro)) throw new ErroAmigavel("O vídeo enviado expirou no serviço de análise. Tente novamente.", st.erro);
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (row.etapa === "processando_no_gemini") { await upd({ passo_lock: null }); return "processando"; }
    }

    if (row.etapa === "gerando") {
      const t0 = Date.now();
      const { resolvePrompt, renderPrompt } = await import("./prompts.server");
      let base = "";
      try { base = await resolvePrompt(db, row.profile_id, "analise_video"); } catch { base = "Analise o vídeo curto de venda em português do Brasil. Foco: {pergunta}"; }
      const prompt = renderPrompt(base, { pergunta: row.pergunta || "análise padrão completa" }) +
        "\n\nResponda somente no JSON do schema. Tempos em segundos. resumo com no máximo 3 linhas.";
      const mimeGerar = row.storage_path ? mime : null;
      let resultado: ResultadoAnalise | null = null;
      let tokensIn = 0;
      let tokensOut = 0;
      for (let t = 0; t < 2 && !resultado; t++) {
        const { texto, uso } = await gerar(key, row.gemini_file_uri!, mimeGerar, prompt);
        tokensIn += uso.promptTokenCount ?? 0;
        tokensOut += uso.candidatesTokenCount ?? 0;
        try { resultado = ResultadoSchema.parse(JSON.parse(texto)); } catch (e) { console.error("[analise] json inválido", t, String(e).slice(0, 200)); }
      }
      // Tokens só são registrados depois que a resposta chegou.
      const { recordConsumo } = await import("./consumo.server");
      const eventoId = await recordConsumo({
        profileId: row.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL,
        unidade: "token_input", quantidade: tokensIn, metadados: { analise_id: row.id, origem: row.origem },
      });
      if (tokensOut)
        await recordConsumo({
          profileId: row.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL,
          unidade: "token_output", quantidade: tokensOut, semDebito: true, metadados: { analise_id: row.id },
        });
      let custo = 0;
      if (eventoId) {
        const { data: ev } = await db.from("consumo_eventos").select("tool_price_cents").eq("id", eventoId).maybeSingle();
        custo = Number(ev?.tool_price_cents ?? 0);
      }
      if (!resultado) throw new ErroAmigavel("A análise voltou incompleta. Tente novamente.", "json inválido nas 2 tentativas");
      const titulo = !row.storage_path && resultado.titulo_video ? resultado.titulo_video.slice(0, 200) : row.titulo;
      await mudar("pronto", {
        status: "pronto", resultado, titulo, passo_lock: null,
        duracao: row.duracao ?? (resultado.duracao_segundos || null),
        consumo_evento_id: eventoId, custo_cents: Number(row.custo_cents ?? 0) + custo, frames: [],
      }, { geracao_segundos: Math.round((Date.now() - t0) / 1000), tokens_in: tokensIn, tokens_out: tokensOut });
      if (row.created_by) {
        await db.from("notificacoes").insert({
          tenant_id: row.tenant_id, user_id: row.created_by, tipo: "analise_pronta", texto: `Análise pronta: ${titulo}`, origem: "usuario",
        });
      }
      return "pronto";
    }
    await upd({ passo_lock: null });
    return row.etapa ?? "?";
  } catch (e) {
    const amigavel = e instanceof ErroAmigavel || (e instanceof Error && e.name === "SemSaldo");
    const msg = amigavel ? (e as Error).message : "Não foi possível analisar o vídeo agora.";
    const detalhe = e instanceof ErroAmigavel ? e.detalhe ?? e.message : e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e);
    console.error("[analise] falha", row.id, row.etapa, detalhe);
    await falhar(msg, detalhe);
    return "erro";
  }
}

/** Varredura (cron): avança análises paradas e aplica o limite de 15 min. */
export async function varrerAnalises(limite = 3) {
  const db = await admin();
  const corte = new Date(Date.now() - LOCK_MS).toISOString();
  const { data } = await db.from("video_analises").select("id")
    .eq("status", "analisando").or(`passo_lock.is.null,passo_lock.lt.${corte}`)
    .order("updated_at").limit(limite);
  const out: { id: string; r: string }[] = [];
  for (const l of (data ?? []) as { id: string }[]) {
    try { out.push({ id: l.id, r: await avancarAnalise(l.id) }); } catch (e) { console.error("[analise] varredura", e); }
  }
  return out;
}
