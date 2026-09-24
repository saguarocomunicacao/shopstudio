/**
 * Perfis de referência (Inteligência): coleta de um @ do TikTok, fila de análises em lote e insights.
 * A coleta reaproveita iniciarRunPerfil / lerItensPerfil / numeros* de metricas.server
 * (mesmo ator, mesma leitura). Perfis próprios não são coletados aqui: usam a coleta de Métricas.
 */
import { lerRun, abortarRun } from "./apify.server";
import { hojeBr } from "./metricas-calc";
import { guardarCapa, iniciarColeta, iniciarRunPerfil, lerItensPerfil, limparHandle, numerosPerfil, numerosVideo, registrarCusto } from "./metricas.server";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
export const LIMITE_PARALELO = 5;

async function salvar(refId: string, patch: Record<string, unknown>) {
  const db = await admin();
  await db.from("referencia_perfis").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", refId);
}

/** Cria a referência. Se o @ for de um perfil do próprio tenant, marca "meu perfil" e usa a coleta de Métricas. */
export async function adicionarReferencia(opts: { profileId: string; tenantId: string; handle: string; qtd: number; acompanhar: boolean; userId: string }) {
  const db = await admin();
  const handle = limparHandle(opts.handle).toLowerCase();
  if (!handle || !/^[a-z0-9._]{2,30}$/.test(handle)) throw new Error("Informe um @ válido do TikTok.");
  const { data: meus } = await db.from("profiles").select("id, handle").eq("tenant_id", opts.tenantId);
  const meu = ((meus ?? []) as Any[]).find((p) => limparHandle(p.handle).toLowerCase() === handle);
  const { data: existe } = await db.from("referencia_perfis").select("id").eq("profile_id", opts.profileId).eq("handle", handle).maybeSingle();
  if (existe) throw new Error(`@${handle} já está na lista deste perfil.`);
  const { data, error } = await db.from("referencia_perfis").insert({
    tenant_id: opts.tenantId, profile_id: opts.profileId, handle, qtd_videos: opts.qtd, acompanhar: opts.acompanhar,
    meu_perfil_id: meu?.id ?? null, created_by: opts.userId, status: meu ? "ok" : "nunca",
  } as never).select("id").single();
  if (error || !data) {
    console.error("[referencias] insert", error?.message);
    throw new Error("Não foi possível adicionar o @.");
  }
  const id = (data as Any).id as string;
  if (meu) {
    await iniciarColeta(meu.id, false).catch(() => null);
  } else {
    await iniciarColetaRef(id, false);
  }
  return { id, meuPerfil: !!meu };
}

export async function iniciarColetaRef(refId: string, manual: boolean) {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("*").eq("id", refId).maybeSingle();
  if (!r) throw new Error("Referência não encontrada.");
  const ref = r as Any;
  if (ref.meu_perfil_id) {
    await iniciarColeta(ref.meu_perfil_id, manual);
    return;
  }
  if (ref.status === "coletando" && ref.iniciado_em && Date.now() - new Date(ref.iniciado_em).getTime() < 20 * 60_000) {
    if (manual) throw new Error("A coleta desse @ já está em andamento.");
    return;
  }
  if (manual && ref.ultimo_manual_em) {
    const prox = new Date(ref.ultimo_manual_em).getTime() + 60 * 60_000;
    if (Date.now() < prox) {
      const hora = new Date(prox).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      throw new Error(`Esse @ já foi atualizado na última hora. Tente de novo às ${hora}.`);
    }
  }
  try {
    const runId = await iniciarRunPerfil(ref.tenant_id, ref.handle, ref.qtd_videos);
    const agora = new Date().toISOString();
    await salvar(refId, { status: "coletando", run_id: runId, iniciado_em: agora, ultimo_erro: null, ...(manual ? { ultimo_manual_em: agora } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível começar a coleta.";
    await salvar(refId, { status: "erro", ultimo_erro: msg });
    throw new Error(msg);
  }
}

/** Processa a coleta de uma referência. Idempotente pelo run_id. */
export async function processarColetaRef(refId: string): Promise<string> {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("*").eq("id", refId).maybeSingle();
  const ref = r as Any;
  if (!ref || ref.status !== "coletando" || !ref.run_id) return "nada";
  const run = await lerRun(ref.tenant_id, ref.run_id);
  const falhar = (msg: string) => salvar(refId, { status: "erro", ultimo_erro: msg, run_id: null });
  const extra = { referencia_id: refId, handle: ref.handle };
  if (["RUNNING", "READY", "UNKNOWN"].includes(run.status)) {
    if (Date.now() - new Date(ref.iniciado_em ?? Date.now()).getTime() > 20 * 60_000) {
      await abortarRun(ref.tenant_id, ref.run_id);
      await registrarCusto(ref.profile_id, ref.run_id, run.custoUsd, extra);
      await falhar("A coleta demorou demais. Tente atualizar de novo.");
      return "timeout";
    }
    return "aguardando";
  }
  const { data: lock } = await db.from("referencia_perfis").update({ status: "processando", updated_at: new Date().toISOString() } as never)
    .eq("id", refId).eq("run_id", ref.run_id).eq("status", "coletando").select("id");
  if (!lock?.length) return "ja_processado";
  await registrarCusto(ref.profile_id, ref.run_id, run.custoUsd, extra);
  if (run.status !== "SUCCEEDED" || !run.datasetId) {
    await falhar(run.status === "TIMED-OUT" ? "A coleta demorou demais. Tente atualizar de novo." : "A coleta falhou. Tente atualizar de novo.");
    return "falhou";
  }
  const lidos = await lerItensPerfil(ref.tenant_id, run.datasetId, ref.handle, "Confira o @ digitado.", ref.qtd_videos);
  if (lidos.erro) {
    await falhar(lidos.erro);
    return "sem_dados";
  }
  const hoje = hojeBr();
  const a = lidos.autor ?? {};
  const pasta = `ref-${refId}`;
  const foto = !ref.foto_path && a.avatar ? await guardarCapa(ref.tenant_id, pasta, "avatar", a.avatar) : undefined;
  await db.from("referencia_perfil_metricas").upsert({
    tenant_id: ref.tenant_id, referencia_id: refId, profile_id: ref.profile_id, data: hoje, ...numerosPerfil(a),
  } as never, { onConflict: "referencia_id,data" });
  const videos = lidos.videos;
  if (videos.length) {
    await db.from("referencia_video_metricas").upsert(
      videos.map((i) => ({ tenant_id: ref.tenant_id, referencia_id: refId, profile_id: ref.profile_id, tiktok_video_id: String(i.id), data: hoje, ...numerosVideo(i) })) as never,
      { onConflict: "referencia_id,tiktok_video_id,data" },
    );
    const { data: existentes } = await db.from("referencia_videos").select("tiktok_video_id, capa_path").eq("referencia_id", refId);
    const capaAtual = new Map(((existentes ?? []) as Any[]).filter((e) => e.capa_path).map((e) => [e.tiktok_video_id, e.capa_path as string]));
    const linhas = [];
    for (const i of videos) {
      const vid = String(i.id);
      // Sempre manda capa_path: num upsert em lote, campo ausente em uma linha vira NULL em todas.
      const capa = capaAtual.get(vid) ?? (i.videoMeta?.coverUrl ? await guardarCapa(ref.tenant_id, pasta, vid, i.videoMeta.coverUrl) : null);
      linhas.push({
        tenant_id: ref.tenant_id, referencia_id: refId, profile_id: ref.profile_id, tiktok_video_id: vid,
        url: i.webVideoUrl || `https://www.tiktok.com/@${ref.handle}/video/${vid}`,
        legenda: i.text ? String(i.text).slice(0, 500) : null,
        publicado_em: i.createTimeISO ?? null,
        duracao: Number.isFinite(Number(i.videoMeta?.duration)) ? Number(i.videoMeta.duration) : null,
        fixado: !!i.isPinned,
        capa_path: capa,
      });
    }
    await db.from("referencia_videos").upsert(linhas as never, { onConflict: "referencia_id,tiktok_video_id" });
    // Mantém só os N mais recentes desta coleta (tira fixados antigos/vídeos que saíram da janela).
    const atuais = linhas.map((l) => l.tiktok_video_id);
    await db.from("referencia_videos").delete().eq("referencia_id", refId).not("tiktok_video_id", "in", `(${atuais.join(",")})`);
  }
  await salvar(refId, {
    status: "ok", run_id: null, ultima_coleta_em: new Date().toISOString(), ultimo_erro: null,
    nome: a.nickName ?? a.name ?? ref.nome ?? null, ...(foto ? { foto_path: foto } : {}),
  });
  if (ref.acompanhar) {
    const { detectarRadar } = await import("./radar.server");
    await detectarRadar(refId).catch((e) => console.error("[radar]", e instanceof Error ? e.message : e));
  }
  return "ok";
}

/** Rotina diária (06:00, junto com Métricas): só referências de terceiros com acompanhamento ligado. */
export async function iniciarColetasDiariasRef() {
  const db = await admin();
  const { data } = await db.from("referencia_perfis").select("id").eq("acompanhar", true).is("meu_perfil_id", null);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Any[]) {
    try {
      await iniciarColetaRef(r.id, false);
      out[r.id] = "iniciado";
    } catch (e) {
      out[r.id] = e instanceof Error ? e.message : "erro";
    }
  }
  return out;
}

/** Rede de segurança (rotina de 5 min): coletas em andamento + fila de análises em lote. */
export async function varrerReferencias(limite = 10) {
  const db = await admin();
  const { data } = await db.from("referencia_perfis").select("id").eq("status", "coletando").order("iniciado_em").limit(limite);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Any[]) {
    try {
      out[r.id] = await processarColetaRef(r.id);
    } catch (e) {
      console.error("[referencias] processar", r.id, e);
      out[r.id] = "erro";
    }
  }
  await db.from("referencia_perfis").update({ status: "coletando" } as never).eq("status", "processando").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const fila = await promoverFila();
  return { coletas: out, fila };
}

/**
 * Fila das análises em lote: no máximo 5 em paralelo por empresa.
 * Cada item promovido segue o mesmo fluxo da tela Analisar vídeo (comecarDownload → análise).
 */
export async function promoverFila(tenantId?: string) {
  const db = await admin();
  let q = db.from("video_analises").select("id, tenant_id, origem, link_url, youtube_url").eq("status", "na_fila").order("created_at").limit(200);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data: fila } = await q;
  const itens = (fila ?? []) as Any[];
  if (!itens.length) return 0;
  const tenants = [...new Set(itens.map((i) => i.tenant_id as string))];
  let promovidos = 0;
  const { comecarDownload } = await import("./video-analise.server");
  for (const t of tenants) {
    const { count } = await db.from("video_analises").select("id", { count: "exact", head: true })
      .eq("tenant_id", t).or("referencia_id.not.is.null,pesquisa_id.not.is.null").in("status", ["baixando", "analisando"]);
    let vagas = LIMITE_PARALELO - (count ?? 0);
    for (const i of itens.filter((x) => x.tenant_id === t)) {
      if (vagas <= 0) break;
      // Reivindica o item (só um processo passa).
      const { data: ok } = await db.from("video_analises").update({ status: "baixando" } as never).eq("id", i.id).eq("status", "na_fila").select("id");
      if (!ok?.length) continue;
      await comecarDownload(i);
      vagas--;
      promovidos++;
    }
  }
  return promovidos;
}

/** Cria as análises (status na_fila) dos vídeos escolhidos e já promove o que couber. */
export async function enfileirarAnalises(opts: { refId: string; userId: string; videos: { id: string; url: string; titulo: string; duracao: number | null }[] }) {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("id, tenant_id, profile_id, handle").eq("id", opts.refId).maybeSingle();
  const ref = r as Any;
  if (!ref) throw new Error("Referência não encontrada.");
  const agora = new Date().toISOString();
  const linhas = opts.videos.map((v) => ({
    id: crypto.randomUUID(), tenant_id: ref.tenant_id, profile_id: ref.profile_id, created_by: opts.userId,
    origem: "tiktok", link_url: v.url, titulo: v.titulo.slice(0, 200) || `Vídeo de @${ref.handle}`, duracao: v.duracao,
    referencia_id: ref.id, status: "na_fila", etapa_log: [{ etapa: "na_fila", em: agora }],
  }));
  const { error } = await db.from("video_analises").insert(linhas as never);
  if (error) {
    console.error("[referencias] fila", error.message);
    throw new Error("Não foi possível criar as análises.");
  }
  await promoverFila(ref.tenant_id);
  return linhas.length;
}

/** Remove a referência, vídeos, snapshots e capas. As análises já feitas continuam em Analisar vídeo. */
export async function removerReferencia(refId: string) {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("id, tenant_id").eq("id", refId).maybeSingle();
  const ref = r as Any;
  if (!ref) return;
  const pasta = `metricas/${ref.tenant_id}/ref-${refId}`;
  const { data: arqs } = await db.storage.from("job-media").list(pasta, { limit: 1000 });
  const paths = ((arqs ?? []) as Any[]).map((a) => `${pasta}/${a.name}`);
  if (paths.length) await db.storage.from("job-media").remove(paths);
  await db.from("video_analises").update({ status: "erro", erro: "Referência removida antes da análise." } as never).eq("referencia_id", refId).eq("status", "na_fila");
  await db.from("referencia_perfis").delete().eq("id", refId);
}

/** Ganchos dos 10 vídeos mais vistos já analisados das referências marcadas como fonte do roteirista. */
export async function ganchosDeReferencias(profileId: string): Promise<{ title: string; views: number; creator: string }[]> {
  try {
    const db = await admin();
    const { data: refs } = await db.from("referencia_perfis").select("id, handle").eq("profile_id", profileId).eq("fonte_roteirista", true);
    const out: { title: string; views: number; creator: string }[] = [];
    for (const ref of (refs ?? []) as Any[]) {
      const { data: an } = await db.from("video_analises").select("link_url, resultado").eq("referencia_id", ref.id).eq("status", "pronto");
      const { data: snaps } = await db.from("referencia_video_metricas").select("tiktok_video_id, views, data").eq("referencia_id", ref.id).order("data", { ascending: false });
      const views = new Map<string, number>();
      for (const s of (snaps ?? []) as Any[]) if (!views.has(s.tiktok_video_id)) views.set(s.tiktok_video_id, Number(s.views ?? 0));
      const lista = ((an ?? []) as Any[])
        .map((a) => ({ title: String(a.resultado?.gancho?.texto ?? "").trim(), views: views.get(videoIdDe(a.link_url) ?? "") ?? 0, creator: ref.handle }))
        .filter((x) => x.title)
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);
      out.push(...lista);
    }
    return out.sort((a, b) => b.views - a.views);
  } catch {
    return [];
  }
}

export const videoIdDe = (url: string | null | undefined) => (url ?? "").match(/\/(?:video|photo)\/(\d{8,25})/)?.[1] ?? null;

/** Gera os insights (Gemini, texto) a partir das análises prontas + métricas. */
export async function gerarInsights(refId: string, dados: Any[], meuPerfil: { nome: string; nicho: string }) {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("id, tenant_id, profile_id, handle").eq("id", refId).maybeSingle();
  const ref = r as Any;
  if (!ref) throw new Error("Referência não encontrada.");
  const json = await gerarInsightsJson({ tenantId: ref.tenant_id, profileId: ref.profile_id, rotulo: ref.handle, dados, meuPerfil, meta: { tipo: "insights_referencia", referencia_id: refId, handle: ref.handle } });
  await salvar(refId, { insights: json, insights_em: new Date().toISOString() });
  return json;
}

/** Núcleo compartilhado (Perfis de referência e Pesquisar): mesmo prompt, mesmo formato. */
export async function gerarInsightsJson(opts: { tenantId: string; profileId: string; rotulo: string; dados: Any[]; meuPerfil: { nome: string; nicho: string }; meta: Record<string, unknown>; contextoExtra?: string }) {
  const db = await admin();
  const { dados, meuPerfil, meta } = opts;
  const ref = { tenant_id: opts.tenantId, profile_id: opts.profileId, handle: opts.rotulo };
  const views = dados.map((d) => Number(d.metricas?.views ?? 0)).sort((a, b) => a - b);
  const mediana = views.length ? (views.length % 2 ? views[(views.length - 1) / 2]! : Math.round((views[views.length / 2 - 1]! + views[views.length / 2]!) / 2)) : 0;
  const { resolvePrompt, renderPrompt } = await import("./prompts.server");
  const base = await resolvePrompt(db, ref.profile_id, "insights_referencia");
  const regrasJson = `\n\nFORMATO OBRIGATÓRIO DA RESPOSTA: devolva somente um JSON (sem Markdown) com os campos:
- resumo: exatamente 3 frases curtas com o essencial.
- padroes: 5 itens, um para cada chave (gancho, formato, duracao, ritmo, produto_2s), com "achado" em 1 a 2 frases e "posicao" = "acima" se o padrão aparece nos vídeos acima da mediana de views, "abaixo" se aparece nos abaixo, "neutro" se não há diferença.
- ganchos: os até 5 ganchos que mais funcionaram, com "video_id" copiado exatamente do campo "video" dos dados, "gancho" transcrito e "por_que" em 1 frase.
- recomendacoes: 3 a 5 ações em sequência para o meu perfil, cada uma com "titulo" curto e "explicacao" em 1 frase.
- comparativo: 4 a 6 linhas com "aspecto", "melhores" (o que os 5 mais vistos fazem) e "piores" (o que os 5 menos vistos fazem).
Sempre que citar um vídeo no texto, use o título (legenda) e nunca o número do vídeo. Escreva em português do Brasil, sem travessão. Nunca invente números.`;
  const prompt = renderPrompt(base, {
    handle: ref.handle, mediana_views: mediana.toLocaleString("pt-BR"), meu_perfil: meuPerfil.nome, nicho: meuPerfil.nicho || "geral",
    dados: JSON.stringify(dados),
  }) + (opts.contextoExtra ?? "") + regrasJson;
  const { resolveApiKey } = await import("./api-keys.server");
  const key = await resolveApiKey(ref.tenant_id, "gemini");
  const { GEMINI_MODEL } = await import("./video-analise.server");
  const { insightsSchema, insightsGeminiSchema, semTravessao } = await import("./insights-schema");
  const { recordConsumo } = await import("./consumo.server");
  const ids = new Set(dados.map((d) => String(d.video)));

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: insightsGeminiSchema },
      }),
    });
    if (!res.ok) {
      console.error("[referencias] insights", res.status, (await res.text().catch(() => "")).slice(0, 300));
      throw new Error(res.status === 429 ? "O serviço de IA está ocupado. Tente de novo em instantes." : "Não foi possível gerar os insights agora.");
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const texto = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    const tin = body.usageMetadata?.promptTokenCount ?? 0;
    const tout = body.usageMetadata?.candidatesTokenCount ?? 0;
    if (tin) await recordConsumo({ profileId: ref.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL, unidade: "token_input", quantidade: tin, semDebito: true, metadados: meta });
    if (tout) await recordConsumo({ profileId: ref.profile_id, etapa: "analise_video", acao: "analise_video", modelo: GEMINI_MODEL, unidade: "token_output", quantidade: tout, semDebito: true, metadados: meta });
    let parsed;
    try {
      parsed = insightsSchema.safeParse(JSON.parse(texto.replace(/^```(?:json)?|```$/g, "").trim()));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) {
      console.error("[referencias] insights json inválido", tentativa, texto.slice(0, 200));
      continue;
    }
    const v = parsed.data;
    const limpo = {
      versao: 2 as const, n_videos: dados.length,
      resumo: v.resumo.slice(0, 3).map(semTravessao),
      padroes: v.padroes.map((p) => ({ ...p, achado: semTravessao(p.achado) })),
      ganchos: v.ganchos.filter((g) => ids.has(g.video_id)).slice(0, 5).map((g) => ({ ...g, gancho: semTravessao(g.gancho), por_que: semTravessao(g.por_que ?? "") })),
      recomendacoes: v.recomendacoes.map((r) => ({ titulo: semTravessao(r.titulo), explicacao: semTravessao(r.explicacao) })),
      comparativo: v.comparativo.map((c) => ({ aspecto: semTravessao(c.aspecto), melhores: semTravessao(c.melhores), piores: semTravessao(c.piores) })),
    };
    return JSON.stringify(limpo);
  }
  throw new Error("A IA não devolveu os insights no formato esperado. Tente novamente.");
}

/** "Enviar para o roteirista": acrescenta as recomendações nas observações de estilo do perfil. */
export async function enviarRecomendacoes(refId: string) {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("id, tenant_id, profile_id, handle, insights").eq("id", refId).maybeSingle();
  const ref = r as Any;
  if (!ref) throw new Error("Referência não encontrada.");
  const { lerInsights, recomendacoesComoTexto } = await import("./insights-schema");
  const li = lerInsights(ref.insights);
  if (!li || !("v2" in li)) throw new Error("Gere os insights de novo para enviar as recomendações.");
  const bloco = recomendacoesComoTexto(li.v2, ref.handle);
  const { data: idt } = await db.from("profile_identities").select("style_notes").eq("profile_id", ref.profile_id).maybeSingle();
  const atual = String((idt as Any)?.style_notes ?? "");
  const marca = `Recomendações a partir de @${ref.handle}:`;
  // Substitui o bloco anterior do mesmo @ (não duplica).
  const semAntigo = atual.includes(marca) ? atual.split(/\n{2,}/).filter((b) => !b.startsWith(marca)).join("\n\n") : atual;
  const novo = [semAntigo.trim(), bloco].filter(Boolean).join("\n\n");
  if (idt) await db.from("profile_identities").update({ style_notes: novo, updated_at: new Date().toISOString() } as never).eq("profile_id", ref.profile_id);
  else await db.from("profile_identities").insert({ profile_id: ref.profile_id, tenant_id: ref.tenant_id, style_notes: novo } as never);
}
