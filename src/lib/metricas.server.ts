/**
 * Coleta diária de métricas dos próprios perfis no TikTok (Apify, clockworks/tiktok-scraper em modo perfil).
 * Fluxo assíncrono: inicia o run e guarda o id; a rotina de 5 min (ou a tela aberta) processa quando termina.
 */
import { apifyFetch, lerRun, abortarRun } from "./apify.server";
import { hojeBr, idDoLinkTiktok } from "./metricas-calc";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ATOR = "clockworks~tiktok-scraper";
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export const limparHandle = (h: string | null | undefined) => (h ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "").split(/[/?]/)[0] ?? "";

async function salvarColeta(profileId: string, tenantId: string, patch: Record<string, unknown>) {
  const db = await admin();
  await db.from("metricas_coleta").upsert({ profile_id: profileId, tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() } as never, { onConflict: "profile_id" });
}

/**
 * Compartilhado com Perfis de referência: inicia o run do ator em modo perfil.
 * Lança erro amigável se não der.
 */
export async function iniciarRunPerfil(tenantId: string, handle: string, qtd: number): Promise<string> {
  const input = {
    profiles: [handle],
    resultsPerPage: qtd,
    profileScrapeSections: ["videos"],
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    commentsPerPost: 0,
    scrapeRelatedVideos: false,
  };
  const res = await apifyFetch(tenantId, `/acts/${ATOR}/runs?timeout=600`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    console.error("[metricas] iniciar", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error(res.status === 402 ? "A conta de coleta está sem saldo. Avise o suporte." : "Não foi possível começar a coleta de métricas.");
  }
  const runId = ((await res.json()) as { data?: { id?: string } }).data?.id;
  if (!runId) throw new Error("Não foi possível começar a coleta de métricas.");
  return runId;
}

export type ItensPerfil = { autor: Any | null; videos: Any[]; erro: string | null };

/** Compartilhado: lê o dataset do run e separa autor e vídeos do @. */
export async function lerItensPerfil(tenantId: string, datasetId: string, handle: string, dicaErro = "Confira o @ na aba Dados do perfil."): Promise<ItensPerfil> {
  const res = await apifyFetch(tenantId, `/datasets/${datasetId}/items?limit=100&clean=true`);
  const itens = (res.ok ? await res.json().catch(() => []) : []) as Any[];
  const h = handle.toLowerCase();
  const videos = itens.filter((i) => i && i.id && !i.error && (!i.authorMeta?.name || String(i.authorMeta.name).toLowerCase() === h));
  const autorAchado = itens.find((i) => i?.authorMeta && String(i.authorMeta.name ?? "").toLowerCase() === h)?.authorMeta as Any | undefined;
  if (!videos.length && !autorAchado) {
    const erroItem = itens.find((i) => i?.error)?.error as string | undefined;
    const erro = erroItem && /not.?found|doesn.?t exist|no.?user|invalid/i.test(erroItem)
      ? `Não encontramos a conta @${h} no TikTok. ${dicaErro}`
      : `Não foi possível ler a conta @${h} no TikTok. Tente atualizar de novo.`;
    return { autor: null, videos: [], erro };
  }
  const autor = autorAchado ?? videos[0].authorMeta ?? {};
  if (autor.privateAccount) return { autor, videos, erro: `A conta @${h} é privada. Deixe a conta pública para coletar métricas.` };
  return { autor, videos, erro: null };
}

/** Compartilhado: linha de números de um vídeo (mesmos campos das duas tabelas). */
export const numerosVideo = (i: Any) => ({
  views: num(i.playCount), likes: num(i.diggCount), comentarios: num(i.commentCount), compartilhamentos: num(i.shareCount), salvos: num(i.collectCount), reposts: num(i.repostCount),
});
export const numerosPerfil = (a: Any) => ({ seguidores: num(a.fans), seguindo: num(a.following), curtidas_total: num(a.heart), videos_total: num(a.video) });

/** Inicia a coleta de um perfil. Lança erro amigável se não der. */
export async function iniciarColeta(profileId: string, manual: boolean): Promise<void> {
  const db = await admin();
  const { data: p } = await db.from("profiles").select("id, tenant_id, handle").eq("id", profileId).maybeSingle();
  if (!p) throw new Error("Perfil não encontrado.");
  const handle = limparHandle(p.handle);
  if (!handle) throw new Error("Informe o @ do perfil para coletar métricas.");
  const { data: c } = await db.from("metricas_coleta").select("status, iniciado_em, ultimo_manual_em").eq("profile_id", profileId).maybeSingle();
  if (c?.status === "coletando" && c.iniciado_em && Date.now() - new Date(c.iniciado_em).getTime() < 20 * 60_000) {
    if (manual) throw new Error("A coleta desse perfil já está em andamento.");
    return;
  }
  if (manual && c?.ultimo_manual_em) {
    const prox = new Date(c.ultimo_manual_em).getTime() + 60 * 60_000;
    if (Date.now() < prox) {
      const hora = new Date(prox).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      throw new Error(`Esse perfil já foi atualizado na última hora. Tente de novo às ${hora}.`);
    }
  }
  let runId: string;
  try {
    runId = await iniciarRunPerfil(p.tenant_id, handle, 50);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível começar a coleta de métricas.";
    await salvarColeta(profileId, p.tenant_id, { status: "erro", ultimo_erro: msg });
    throw new Error(msg);
  }
  const agora = new Date().toISOString();
  await salvarColeta(profileId, p.tenant_id, { status: "coletando", run_id: runId, iniciado_em: agora, ...(manual ? { ultimo_manual_em: agora } : {}) });
}

export async function registrarCusto(profileId: string, runId: string, usd: number) {
  if (!usd) return;
  const { recordConsumo } = await import("./consumo.server");
  await recordConsumo({
    profileId, etapa: "apify_download" as never, acao: "analise_video", modelo: "apify:metricas",
    unidade: "usd_real" as never, quantidade: usd, semDebito: true,
    metadados: { tipo: "coleta_metricas", run_id: runId, custo_usd: usd },
  });
}

export async function guardarCapa(tenantId: string, profileId: string, videoId: string, url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) return null;
    const path = `metricas/${tenantId}/${profileId}/${videoId}.jpg`;
    const db = await admin();
    const { error } = await db.storage.from("job-media").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

const num = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Math.round(Number(x)));

/** Processa uma coleta em andamento. Idempotente pelo run_id. */
export async function processarColeta(profileId: string): Promise<string> {
  const db = await admin();
  const { data: c } = await db.from("metricas_coleta").select("*").eq("profile_id", profileId).maybeSingle();
  if (!c || c.status !== "coletando" || !c.run_id) return "nada";
  const { data: p } = await db.from("profiles").select("id, tenant_id, handle").eq("id", profileId).maybeSingle();
  if (!p) return "sem_perfil";
  const run = await lerRun(p.tenant_id, c.run_id);
  const falhar = async (msg: string) => {
    await salvarColeta(profileId, p.tenant_id, { status: "erro", ultimo_erro: msg, run_id: null });
  };
  if (["RUNNING", "READY", "UNKNOWN"].includes(run.status)) {
    if (Date.now() - new Date(c.iniciado_em ?? Date.now()).getTime() > 20 * 60_000) {
      await abortarRun(p.tenant_id, c.run_id);
      await registrarCusto(profileId, c.run_id, run.custoUsd);
      await falhar("A coleta demorou demais. Tente atualizar de novo.");
      return "timeout";
    }
    return "aguardando";
  }
  // Trava por run_id: só um processamento passa.
  const { data: lock } = await db.from("metricas_coleta").update({ status: "processando", updated_at: new Date().toISOString() } as never).eq("profile_id", profileId).eq("run_id", c.run_id).eq("status", "coletando").select("profile_id");
  if (!lock?.length) return "ja_processado";
  await registrarCusto(profileId, c.run_id, run.custoUsd);
  if (run.status !== "SUCCEEDED" || !run.datasetId) {
    await falhar(run.status === "TIMED-OUT" ? "A coleta demorou demais. Tente atualizar de novo." : "A coleta de métricas falhou. Tente atualizar de novo.");
    return "falhou";
  }
  const handle = limparHandle(p.handle).toLowerCase();
  const lidos = await lerItensPerfil(p.tenant_id, run.datasetId, handle);
  if (lidos.erro) {
    await falhar(lidos.erro);
    return lidos.autor ? "privada" : "sem_dados";
  }
  const videos = lidos.videos;
  const a = lidos.autor;
  const hoje = hojeBr();
  await db.from("perfil_metricas").upsert({
    tenant_id: p.tenant_id, profile_id: profileId, data: hoje,
    ...numerosPerfil(a),
  } as never, { onConflict: "profile_id,data" });
  if (!videos.length) {
    await salvarColeta(profileId, p.tenant_id, { status: "ok", run_id: null, ultima_coleta_em: new Date().toISOString(), ultimo_erro: null });
    return "ok_sem_videos";
  }

  const ids = videos.map((i) => String(i.id));
  const { data: jobs } = await db.from("jobs").select("id, tiktok_video_id").eq("profile_id", profileId).in("tiktok_video_id", ids);
  const jobPorVideo = new Map(((jobs ?? []) as Any[]).map((j) => [j.tiktok_video_id, j.id]));
  await db.from("video_metricas").upsert(
    videos.map((i) => ({
      tenant_id: p.tenant_id, profile_id: profileId, tiktok_video_id: String(i.id), job_id: jobPorVideo.get(String(i.id)) ?? null, data: hoje,
      ...numerosVideo(i),
    })) as never,
    { onConflict: "profile_id,tiktok_video_id,data" },
  );

  const semJob = videos.filter((i) => !jobPorVideo.has(String(i.id)));
  if (semJob.length) {
    const { data: existentes } = await db.from("videos_nao_vinculados").select("tiktok_video_id, capa_url").eq("profile_id", profileId).in("tiktok_video_id", semJob.map((i) => String(i.id)));
    const comCapa = new Set(((existentes ?? []) as Any[]).filter((e) => e.capa_url).map((e) => e.tiktok_video_id));
    const linhas = [];
    for (const i of semJob) {
      const vid = String(i.id);
      const capa = comCapa.has(vid) ? undefined : i.videoMeta?.coverUrl ? await guardarCapa(p.tenant_id, profileId, vid, i.videoMeta.coverUrl) : null;
      linhas.push({
        tenant_id: p.tenant_id, profile_id: profileId, tiktok_video_id: vid,
        url: i.webVideoUrl || `https://www.tiktok.com/@${handle}/video/${vid}`,
        legenda: i.text ? String(i.text).slice(0, 500) : null,
        publicado_em: i.createTimeISO ?? null, duracao: num(i.videoMeta?.duration), visto_em: new Date().toISOString(),
        ...(capa !== undefined ? { capa_url: capa } : {}),
      });
    }
    await db.from("videos_nao_vinculados").upsert(linhas as never, { onConflict: "profile_id,tiktok_video_id" });
  }
  await salvarColeta(profileId, p.tenant_id, { status: "ok", run_id: null, ultima_coleta_em: new Date().toISOString(), ultimo_erro: null });
  return "ok";
}

/** Rotina diária: inicia a coleta de todos os perfis ativos com @. */
export async function iniciarColetasDiarias() {
  const db = await admin();
  const { data } = await db.from("profiles").select("id, handle, status");
  const perfis = ((data ?? []) as Any[]).filter((p) => limparHandle(p.handle) && String(p.status).toLowerCase() !== "pausado");
  const out: Record<string, string> = {};
  for (const p of perfis) {
    try {
      await iniciarColeta(p.id, false);
      out[p.id] = "iniciado";
    } catch (e) {
      out[p.id] = e instanceof Error ? e.message : "erro";
      // Falha de um perfil não quebra os outros; o alerta fica na coleta.
      const { data: prof } = await db.from("profiles").select("tenant_id").eq("id", p.id).maybeSingle();
      if (prof) await salvarColeta(p.id, prof.tenant_id, { status: "erro", ultimo_erro: out[p.id] });
    }
  }
  return out;
}

/** Rede de segurança: processa coletas em andamento. */
export async function varrerColetas(limite = 10) {
  const db = await admin();
  const { data } = await db.from("metricas_coleta").select("profile_id").eq("status", "coletando").order("iniciado_em").limit(limite);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Any[]) {
    try {
      out[r.profile_id] = await processarColeta(r.profile_id);
    } catch (e) {
      console.error("[metricas] processar", r.profile_id, e);
      out[r.profile_id] = "erro";
    }
  }
  // Coleta travada em "processando" por queda do servidor volta a "coletando".
  await db.from("metricas_coleta").update({ status: "coletando" } as never).eq("status", "processando").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  return out;
}

/** Resolve link curto (vm.tiktok.com) e extrai o ID do vídeo. */
export async function resolverLinkTiktok(url: string): Promise<{ url: string; id: string } | null> {
  const direto = idDoLinkTiktok(url);
  if (direto) return { url: url.trim(), id: direto };
  try {
    let atual = url.trim();
    for (let i = 0; i < 4; i++) {
      const r = await fetch(atual, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
      const loc = r.headers.get("location");
      if (!loc) break;
      atual = new URL(loc, atual).toString();
      const id = idDoLinkTiktok(atual);
      if (id) return { url: atual.split("?")[0]!, id };
    }
  } catch {
    /* sem rede */
  }
  return null;
}

/** Depois de vincular: liga o histórico já coletado ao job. */
export async function ligarHistorico(profileId: string, videoId: string, jobId: string) {
  const db = await admin();
  await db.from("video_metricas").update({ job_id: jobId } as never).eq("profile_id", profileId).eq("tiktok_video_id", videoId);
  await db.from("videos_nao_vinculados").update({ vinculado_job_id: jobId } as never).eq("profile_id", profileId).eq("tiktok_video_id", videoId);
}
