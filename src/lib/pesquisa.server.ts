/**
 * Inteligência > Pesquisar: busca por hashtag ou palavra no TikTok (Apify, clockworks/tiktok-scraper).
 * Assíncrono como as coletas: inicia o run, a tela aberta ou a rotina de 5 min processa quando termina.
 */
import { apifyFetch, lerRun, abortarRun } from "./apify.server";
import { guardarCapa, numerosVideo, registrarCusto } from "./metricas.server";
import { provavelPortugues } from "./pesquisa-calc";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ATOR = "clockworks~tiktok-scraper";
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
export const RETENCAO_DIAS = 90;

async function salvar(id: string, patch: Record<string, unknown>) {
  const db = await admin();
  await db.from("pesquisas_tiktok").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
}

export const limparTermo = (tipo: "hashtag" | "palavra", termo: string) =>
  tipo === "hashtag" ? termo.trim().replace(/^#+/, "").replace(/\s+/g, "").toLowerCase() : termo.trim().replace(/\s+/g, " ");

export async function iniciarPesquisa(opts: { tenantId: string; profileId: string; userId: string; tipo: "hashtag" | "palavra"; termo: string; qtd: number }) {
  const termo = limparTermo(opts.tipo, opts.termo);
  if (termo.length < 2) throw new Error("Digite um termo com pelo menos 2 letras.");
  const input = {
    ...(opts.tipo === "hashtag" ? { hashtags: [termo] } : { searchQueries: [termo], searchSection: "/video" }),
    resultsPerPage: opts.qtd,
    // Região Brasil: o ator usa proxy residencial do país pedido, e o TikTok devolve resultados do BR.
    proxyCountryCode: "BR",
    shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false,
    commentsPerPost: 0, scrapeRelatedVideos: false,
  };
  const res = await apifyFetch(opts.tenantId, `/acts/${ATOR}/runs?timeout=600`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) {
    console.error("[pesquisa] iniciar", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error(res.status === 402 ? "A conta de coleta está sem saldo. Avise o suporte." : "Não foi possível começar a pesquisa.");
  }
  const runId = ((await res.json()) as { data?: { id?: string } }).data?.id;
  if (!runId) throw new Error("Não foi possível começar a pesquisa.");
  const db = await admin();
  const { data, error } = await db.from("pesquisas_tiktok").insert({
    tenant_id: opts.tenantId, profile_id: opts.profileId, tipo: opts.tipo, termo, qtd: opts.qtd, status: "coletando",
    run_id: runId, iniciado_em: new Date().toISOString(), created_by: opts.userId,
  } as never).select("id").single();
  if (error || !data) throw new Error("Não foi possível salvar a pesquisa.");
  return (data as Any).id as string;
}

const tagsDe = (i: Any): string[] => {
  const lista = Array.isArray(i.hashtags) ? i.hashtags.map((h: Any) => String(h?.name ?? h ?? "")).filter(Boolean) : [];
  if (lista.length) return [...new Set(lista as string[])].slice(0, 30);
  return [...new Set(((String(i.text ?? "").match(/#[\p{L}\d_]+/gu) ?? []) as string[]).map((t) => t.slice(1)))].slice(0, 30);
};

/** Processa a pesquisa quando o run termina. Idempotente pelo run_id. */
export async function processarPesquisa(id: string): Promise<string> {
  const db = await admin();
  const { data: r } = await db.from("pesquisas_tiktok").select("*").eq("id", id).maybeSingle();
  const p = r as Any;
  if (!p || p.status !== "coletando" || !p.run_id) return "nada";
  const run = await lerRun(p.tenant_id, p.run_id);
  const extra = { pesquisa_id: id, termo: p.termo, tipo_pesquisa: p.tipo };
  if (["RUNNING", "READY", "UNKNOWN"].includes(run.status)) {
    if (Date.now() - new Date(p.iniciado_em ?? Date.now()).getTime() > 15 * 60_000) {
      await abortarRun(p.tenant_id, p.run_id);
      await registrarCusto(p.profile_id, p.run_id, run.custoUsd, extra);
      await salvar(id, { status: "erro", erro: "A pesquisa demorou demais. Tente repetir.", run_id: null, custo_usd: run.custoUsd ?? 0 });
      return "timeout";
    }
    return "aguardando";
  }
  const { data: lock } = await db.from("pesquisas_tiktok").update({ status: "processando", updated_at: new Date().toISOString() } as never)
    .eq("id", id).eq("run_id", p.run_id).eq("status", "coletando").select("id");
  if (!lock?.length) return "ja_processado";
  await registrarCusto(p.profile_id, p.run_id, run.custoUsd, extra);
  if (run.status !== "SUCCEEDED" || !run.datasetId) {
    await salvar(id, { status: "erro", erro: "A pesquisa falhou no TikTok. Tente repetir.", run_id: null, custo_usd: run.custoUsd ?? 0 });
    return "falhou";
  }
  const res = await apifyFetch(p.tenant_id, `/datasets/${run.datasetId}/items?limit=200&clean=true`);
  const itens = ((res.ok ? await res.json().catch(() => []) : []) as Any[]).filter((i) => i && i.id && !i.error);
  const vistos = new Set<string>();
  const linhas = [];
  let pos = 0;
  for (const i of itens) {
    const vid = String(i.id);
    if (vistos.has(vid)) continue;
    vistos.add(vid);
    const autor = i.authorMeta ?? {};
    const handle = autor.name ? String(autor.name).toLowerCase() : null;
    const fotos = !!(i.isSlideshow || (Array.isArray(i.slideshowImageLinks) && i.slideshowImageLinks.length) || (i.imagePost && Object.keys(i.imagePost).length));
    const dur = Number(i.videoMeta?.duration);
    const capa = i.videoMeta?.coverUrl ? await guardarCapa(p.tenant_id, `pesq-${id}`, vid, i.videoMeta.coverUrl) : null;
    linhas.push({
      tenant_id: p.tenant_id, pesquisa_id: id, profile_id: p.profile_id, tiktok_video_id: vid,
      url: i.webVideoUrl || (handle ? `https://www.tiktok.com/@${handle}/video/${vid}` : `https://www.tiktok.com/video/${vid}`),
      legenda: i.text ? String(i.text).slice(0, 500) : null,
      publicado_em: i.createTimeISO ?? null,
      duracao: fotos || !Number.isFinite(dur) || dur <= 0 ? null : dur,
      capa_path: capa,
      autor_handle: handle, autor_nome: autor.nickName ?? null,
      autor_seguidores: Number.isFinite(Number(autor.fans)) ? Math.round(Number(autor.fans)) : null,
      ...numerosVideo(i),
      hashtags: tagsDe(i),
      anuncio: !!(i.isAd || i.isSponsored),
      fotos,
      tiktok_shop: !!(i.isECommerce || i.commerceUserInfo?.commerceUser || (Array.isArray(i.anchors) && i.anchors.length) || i.productInfo),
      idioma_pt: provavelPortugues(i.text),
      posicao: pos++,
    });
  }
  const idi = await detectarIdiomas(p, linhas.map((l) => l.legenda)).catch((e) => { console.error("[pesquisa] idioma", e); return null; });
  if (idi) linhas.forEach((l, k) => { const c = idi.idiomas[k] ?? "?"; (l as Any).idioma = c; l.idioma_pt = c === "pt" || c === "?"; });
  if (linhas.length) await db.from("pesquisas_tiktok_videos").upsert(linhas as never, { onConflict: "pesquisa_id,tiktok_video_id" });
  if (idi) await salvar(id, { termo_idioma: idi.termo, sugestoes: idi.sugestoes });
  await salvar(id, { status: linhas.length ? "ok" : "erro", erro: linhas.length ? null : "O TikTok não devolveu vídeos para esse termo.", run_id: null, n_videos: linhas.length, custo_usd: run.custoUsd ?? 0 });
  return "ok";
}

/** Rotina de 5 min: pesquisas em andamento + retenção de 90 dias. */
export async function varrerPesquisas(limite = 10) {
  const db = await admin();
  const { data } = await db.from("pesquisas_tiktok").select("id").eq("status", "coletando").order("iniciado_em").limit(limite);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Any[]) {
    try {
      out[r.id] = await processarPesquisa(r.id);
    } catch (e) {
      console.error("[pesquisa] processar", r.id, e);
      out[r.id] = "erro";
    }
  }
  await db.from("pesquisas_tiktok").update({ status: "coletando" } as never).eq("status", "processando").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  return out;
}

export async function limparPesquisasAntigas() {
  const db = await admin();
  const { data } = await db.from("pesquisas_tiktok").select("id").lt("created_at", new Date(Date.now() - RETENCAO_DIAS * 86400_000).toISOString()).limit(100);
  for (const r of (data ?? []) as Any[]) await removerPesquisa(r.id);
  return (data ?? []).length;
}

export async function removerPesquisa(id: string) {
  const db = await admin();
  const { data: r } = await db.from("pesquisas_tiktok").select("id, tenant_id").eq("id", id).maybeSingle();
  const p = r as Any;
  if (!p) return;
  const pasta = `metricas/${p.tenant_id}/pesq-${id}`;
  const { data: arqs } = await db.storage.from("job-media").list(pasta, { limit: 1000 });
  const paths = ((arqs ?? []) as Any[]).map((a) => `${pasta}/${a.name}`);
  if (paths.length) await db.storage.from("job-media").remove(paths);
  await db.from("video_analises").update({ status: "erro", erro: "Pesquisa removida antes da análise." } as never).eq("pesquisa_id", id).eq("status", "na_fila");
  await db.from("pesquisas_tiktok").delete().eq("id", id);
}

/** Cria as análises (na fila) dos vídeos escolhidos, no mesmo fluxo dos Perfis de referência. */
export async function enfileirarAnalisesPesquisa(opts: { pesquisaId: string; userId: string; videos: { url: string; titulo: string; duracao: number | null }[] }) {
  const db = await admin();
  const { data: r } = await db.from("pesquisas_tiktok").select("id, tenant_id, profile_id, termo").eq("id", opts.pesquisaId).maybeSingle();
  const p = r as Any;
  if (!p) throw new Error("Pesquisa não encontrada.");
  const agora = new Date().toISOString();
  const linhas = opts.videos.map((v) => ({
    id: crypto.randomUUID(), tenant_id: p.tenant_id, profile_id: p.profile_id, created_by: opts.userId,
    origem: "tiktok", link_url: v.url, titulo: v.titulo.slice(0, 200) || `Vídeo sobre ${p.termo}`, duracao: v.duracao,
    pesquisa_id: p.id, status: "na_fila", etapa_log: [{ etapa: "na_fila", em: agora }],
  }));
  const { error } = await db.from("video_analises").insert(linhas as never);
  if (error) {
    console.error("[pesquisa] fila", error.message);
    throw new Error("Não foi possível criar as análises.");
  }
  const { promoverFila } = await import("./referencias.server");
  await promoverFila(p.tenant_id);
  return linhas.length;
}

/** "Enviar para o roteirista": salva as recomendações como referência do tema na Identidade do perfil. */
export async function enviarRecomendacoesPesquisa(id: string) {
  const db = await admin();
  const { data: r } = await db.from("pesquisas_tiktok").select("id, tenant_id, profile_id, termo, tipo, insights").eq("id", id).maybeSingle();
  const p = r as Any;
  if (!p) throw new Error("Pesquisa não encontrada.");
  const { lerInsights } = await import("./insights-schema");
  const li = lerInsights(p.insights);
  if (!li || !("v2" in li)) throw new Error("Gere os insights para enviar as recomendações.");
  const rot = p.tipo === "hashtag" ? `#${p.termo}` : `"${p.termo}"`;
  const marca = `Recomendações do tema ${rot}:`;
  const bloco = [marca, ...li.v2.recomendacoes.map((x, i) => `${i + 1}. ${x.titulo}: ${x.explicacao}`)].join("\n");
  const { data: idt } = await db.from("profile_identities").select("style_notes").eq("profile_id", p.profile_id).maybeSingle();
  const atual = String((idt as Any)?.style_notes ?? "");
  const semAntigo = atual.includes(marca) ? atual.split(/\n{2,}/).filter((b) => !b.startsWith(marca)).join("\n\n") : atual;
  const novo = [semAntigo.trim(), bloco].filter(Boolean).join("\n\n");
  if (idt) await db.from("profile_identities").update({ style_notes: novo, updated_at: new Date().toISOString() } as never).eq("profile_id", p.profile_id);
  else await db.from("profile_identities").insert({ profile_id: p.profile_id, tenant_id: p.tenant_id, style_notes: novo } as never);
}

/** Uma chamada barata ao Gemini: idioma de cada legenda (ISO 639-1, "?" sem texto), idioma do termo e sugestões em português. */
async function detectarIdiomas(p: Any, legendas: (string | null)[]) {
  const { resolveApiKey } = await import("./api-keys.server");
  const { recordConsumo } = await import("./consumo.server");
  const { GEMINI_MODEL } = await import("./video-analise.server");
  const key = await resolveApiKey(p.tenant_id, "gemini");
  const lista = legendas.map((t, i) => `${i}: ${(t ?? "").replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
  const prompt = `Para cada legenda de TikTok abaixo, diga o idioma principal (código ISO 639-1 como pt, en, es). Ignore hashtags e emojis ao decidir; use "?" se não houver texto suficiente. Depois diga o idioma do termo pesquisado e, se ele NÃO for português, sugira de 2 a 4 termos equivalentes usados no TikTok do Brasil (${p.tipo === "hashtag" ? "hashtags sem #" : "palavras"}). Se for português, sugestoes vazio.
Termo pesquisado (${p.tipo}): ${p.termo}
Legendas:
${lista}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: {
        type: "OBJECT", required: ["idiomas", "termo_idioma", "sugestoes"],
        properties: { idiomas: { type: "ARRAY", items: { type: "STRING" } }, termo_idioma: { type: "STRING" }, sugestoes: { type: "ARRAY", items: { type: "STRING" } } },
      } },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const body = (await res.json()) as Any;
  const meta = { pesquisa_id: p.id, uso: "idioma_pesquisa" };
  const tin = body.usageMetadata?.promptTokenCount ?? 0, tout = body.usageMetadata?.candidatesTokenCount ?? 0;
  if (tin) await recordConsumo({ profileId: p.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL, unidade: "token_input", quantidade: tin, semDebito: true, metadados: meta });
  if (tout) await recordConsumo({ profileId: p.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL, unidade: "token_output", quantidade: tout, semDebito: true, metadados: meta });
  const txt = (body.candidates?.[0]?.content?.parts ?? []).map((x: Any) => x.text ?? "").join("");
  const j = JSON.parse(txt) as { idiomas: string[]; termo_idioma: string; sugestoes: string[] };
  const norm = (c: string) => (c || "?").toLowerCase().slice(0, 2).replace(/[^a-z?]/g, "") || "?";
  const termo = norm(j.termo_idioma);
  return {
    idiomas: legendas.map((t, i) => (!(t ?? "").replace(/#[\p{L}\d_]+/gu, "").trim() ? "?" : norm(j.idiomas[i] ?? "?"))),
    termo,
    sugestoes: termo === "pt" ? [] : (j.sugestoes ?? []).map((x) => String(x).replace(/^#/, "").trim()).filter(Boolean).slice(0, 4),
  };
}
