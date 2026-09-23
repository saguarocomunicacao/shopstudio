/**
 * Automação — Parte 2: executor das agendas (cron).
 *
 * Este é o ÚNICO ponto do sistema onde a geração de vídeo roda sem clique
 * humano e gasta dinheiro real (Veo). Por isso:
 *
 *  - IDEMPOTÊNCIA RÍGIDA: antes de qualquer gasto criamos a linha em
 *    `automation_runs` com UNIQUE (schedule_id, dia, horario). Se a mesma
 *    agenda/horário já rodou hoje, o insert falha e a execução é abortada.
 *  - SINGLE-FLIGHT: uma lease em `app_config` impede duas execuções paralelas.
 *  - TRAVA DUPLA DE CUSTO: (1) teto diário/mensal da própria agenda, calculado
 *    a partir do consumo real dos jobs dela; (2) `assertOrcamento` global/perfil.
 *    Antes do Veo ainda estimamos o custo do vídeo e pausamos se estourar.
 *  - TRABALHO LIMITADO: cada execução tem orçamento de tempo; jobs em andamento
 *    continuam nas execuções seguintes.
 *  - ISOLAMENTO POR TENANT: tudo usa o tenant da agenda e as chaves dele.
 */

import type { BillableAction } from "./custo-core";

type Admin = any;

const LOCK_KEY = "automation_cron_lock";
const LOCK_MS = 10 * 60 * 1000;
/** Tolerância: um horário só dispara até 3h depois (evita enxurrada ao reativar). */
const JANELA_MS = 3 * 60 * 60 * 1000;
const DEFAULT_BUDGET_MS = 55_000;

export type TickResult = {
  agendasElegiveis: number;
  disparos: Array<{ scheduleId: string; horario: string; status: string; mensagem: string; jobId?: string }>;
  jobsAvancados: number;
  ignorado?: string;
};

// ---------------------------------------------------------------- utilidades

/** Data e minutos do dia no fuso de Brasília. */
export function brasiliaAgora(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dia = `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
  const hora = Number(parts["hour"]);
  const minuto = Number(parts["minute"]);
  return { dia, minutos: hora * 60 + minuto };
}

const hhmmParaMinutos = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

const erro = (e: unknown) => (e instanceof Error ? e.message : "Falha desconhecida.");

// ------------------------------------------------------------- single-flight

async function acquireLock(admin: Admin, now: Date): Promise<boolean> {
  const until = new Date(now.getTime() + LOCK_MS).toISOString();
  const { data: atual } = await admin.from("app_config").select("value_text").eq("key", LOCK_KEY).maybeSingle();

  if (!atual) {
    const { error } = await admin.from("app_config").insert({ key: LOCK_KEY, value_text: until });
    return !error;
  }
  if (atual.value_text && atual.value_text > now.toISOString()) return false;

  const { data, error } = await admin
    .from("app_config")
    .update({ value_text: until })
    .eq("key", LOCK_KEY)
    .eq("value_text", atual.value_text)
    .select("key");
  return !error && (data ?? []).length > 0;
}

async function releaseLock(admin: Admin) {
  await admin.from("app_config").update({ value_text: null }).eq("key", LOCK_KEY);
}

// ------------------------------------------------------------ custo da agenda

type Tarifas = { tarifas: any[]; taxas: any[]; cotacao: number };

async function carregarTarifas(admin: Admin): Promise<Tarifas> {
  const [tarifasRes, taxasRes, cfgRes] = await Promise.all([
    admin.from("tarifas").select("*"),
    admin.from("credito_taxas").select("*"),
    admin.from("app_config").select("value_num").eq("key", "cotacao_usd").maybeSingle(),
  ]);
  return {
    tarifas: (tarifasRes.data ?? []).map((t: any) => ({ ...t, preco_unitario: Number(t.preco_unitario) })),
    taxas: (taxasRes.data ?? []).map((t: any) => ({ ...t, credito_por_unidade: Number(t.credito_por_unidade) })),
    cotacao: Number(cfgRes.data?.value_num ?? 5.5),
  };
}

/** Gasto real (R$) dos jobs desta agenda, no dia e no mês correntes. */
export async function gastoDaAgenda(admin: Admin, scheduleId: string, diaBrasilia: string) {
  const { data: jobs } = await admin.from("jobs").select("id").eq("automation_schedule_id", scheduleId);
  const ids = (jobs ?? []).map((j: { id: string }) => j.id);
  if (!ids.length) return { dia: 0, mes: 0 };

  const inicioMes = `${diaBrasilia.slice(0, 7)}-01T00:00:00Z`;
  const { data: eventos } = await admin
    .from("consumo_eventos")
    .select("*")
    .in("job_id", ids)
    .gte("created_at", inicioMes);

  const { computeEventoCusto } = await import("./custo-core");
  const { tarifas, taxas, cotacao } = await carregarTarifas(admin);

  let dia = 0;
  let mes = 0;
  for (const ev of (eventos ?? []) as any[]) {
    const custo = computeEventoCusto(ev, tarifas as never, cotacao, 0, taxas as never);
    mes += custo.valorBrl;
    // O evento é do dia quando sua data em Brasília bate com o dia corrente.
    const diaEvento = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(ev.created_at),
    );
    if (diaEvento === diaBrasilia) dia += custo.valorBrl;
  }
  return { dia, mes };
}

/** Estimativa (R$) do próximo vídeo: cenas Gemini + segundos de Veo. */
async function estimarCustoVideo(admin: Admin, cenas: number, duracao: number, profileId: string) {
  const { findTarifa } = await import("./custo-core");
  const { tarifas, cotacao } = await carregarTarifas(admin);
  const { data: settings } = await admin
    .from("profile_video_settings")
    .select("gemini_model, veo_model")
    .eq("profile_id", profileId)
    .maybeSingle();

  const agora = new Date().toISOString();
  const emBrl = (t: any, qtd: number) => (t ? (t.moeda === "USD" ? qtd * t.preco_unitario * cotacao : qtd * t.preco_unitario) : 0);
  const tGemini = findTarifa(tarifas as never, settings?.gemini_model ?? "gemini-3.1-flash-image", "imagem", agora);
  const tVeo = findTarifa(tarifas as never, settings?.veo_model ?? "veo-3.1-fast-generate-preview", "segundo_video", agora);
  return emBrl(tGemini, cenas) + emBrl(tVeo, cenas * duracao);
}

class TetoAtingido extends Error {}

/** Trava dupla: teto da agenda + orçamento global/perfil. */
async function checarCusto(
  admin: Admin,
  schedule: any,
  diaBrasilia: string,
  extraBrl = 0,
): Promise<void> {
  const { dia, mes } = await gastoDaAgenda(admin, schedule.id, diaBrasilia);
  const tetoDia = schedule.teto_diario_cents ? schedule.teto_diario_cents / 100 : null;
  const tetoMes = schedule.teto_mensal_cents ? schedule.teto_mensal_cents / 100 : null;

  if (tetoDia !== null && dia + extraBrl > tetoDia) {
    throw new TetoAtingido(
      `Teto diário da agenda atingido (gasto de R$ ${(dia).toFixed(2)} + estimativa de R$ ${extraBrl.toFixed(2)} acima do limite de R$ ${tetoDia.toFixed(2)}).`,
    );
  }
  if (tetoMes !== null && mes + extraBrl > tetoMes) {
    throw new TetoAtingido(
      `Teto mensal da agenda atingido (gasto de R$ ${(mes).toFixed(2)} + estimativa de R$ ${extraBrl.toFixed(2)} acima do limite de R$ ${tetoMes.toFixed(2)}).`,
    );
  }

  // Segunda trava: orçamento global/por perfil do app.
  const { assertOrcamento } = await import("./orcamento.server");
  await assertOrcamento(schedule.profile_id);
}

async function pausarAgenda(admin: Admin, scheduleId: string, motivo: string) {
  await admin.from("automation_schedules").update({ ativa: false, pausada_motivo: motivo }).eq("id", scheduleId);
}

// --------------------------------------------------------- escolha do produto

/** Monta a busca do Kalodata a partir dos filtros da agenda. */
function queryDaAgenda(schedule: any, categoryId: string | null, page: number) {
  const f = (schedule.filtros ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const precoMin = n(f["preco_min"]);
  const precoMax = n(f["preco_max"]);
  const comissao = n(f["comissao_min"]);
  const receita = n(f["receita_min"]);

  const unitPriceRange =
    precoMin !== null && precoMax !== null
      ? `${precoMin}-${precoMax}`
      : precoMin !== null
        ? `>${precoMin}`
        : precoMax !== null
          ? `<${precoMax}`
          : undefined;

  return {
    dateRange: typeof f["periodo"] === "string" ? (f["periodo"] as string) : "last7Day",
    sortField: (schedule.fonte === "radar" ? "revenue_growth_rate" : "revenue") as any,
    sortType: "DESC" as const,
    page,
    ...(typeof f["palavra_chave"] === "string" && f["palavra_chave"] ? { keyword: f["palavra_chave"] as string } : {}),
    ...(unitPriceRange ? { unitPriceRange } : {}),
    ...(comissao !== null ? { commissionRate: `>${comissao}` } : {}),
    ...(receita !== null ? { revenueRange: `>${receita}` } : {}),
    ...(typeof f["lancamento"] === "string" && f["lancamento"] ? { launchDate: f["lancamento"] as string } : {}),
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
  };
}

/**
 * Próximo produto que atende aos filtros e que ainda NÃO tem job neste perfil.
 * Devolve o id do produto salvo no catálogo, ou null quando não há novidade.
 */
async function escolherProduto(
  admin: Admin,
  schedule: any,
  profile: { id: string; category_id: string | null },
): Promise<{ productId: string; nome: string } | null> {
  const { activeProductSource } = await import("./product-source.server");
  const { withTenantKeys } = await import("./api-keys.server");
  const { recordConsumo, findCredits } = await import("./consumo.server");
  const { ascensionScore, RISING_BADGE_THRESHOLD } = await import("./radar");
  const source = activeProductSource();

  // Produtos já usados por este perfil (inclusive na lixeira): nunca repetimos.
  const { data: jobsDoPerfil } = await admin.from("jobs").select("product_id").eq("profile_id", profile.id);
  const usados = new Set((jobsDoPerfil ?? []).map((j: any) => j.product_id).filter(Boolean));
  const { data: catalogo } = await admin
    .from("products")
    .select("id, external_id, source")
    .eq("profile_id", profile.id);
  const usadosExternos = new Set(
    (catalogo ?? []).filter((p: any) => usados.has(p.id)).map((p: any) => `${p.source}:${p.external_id}`),
  );

  for (let page = 1; page <= 3; page += 1) {
    const query = queryDaAgenda(schedule, profile.category_id, page);
    const result: any = await withTenantKeys(schedule.tenant_id, () => source.search(query as never));
    const itens: any[] = Array.isArray(result?.items) ? result.items : [];

    await recordConsumo({
      jobId: null,
      profileId: profile.id,
      tenantId: schedule.tenant_id,
      etapa: "busca_kalodata",
      acao: "busca_produto" as BillableAction,
      modelo: source.id,
      quantidade: findCredits(result) ?? itens.length,
      unidade: "bloco_linhas_kalodata",
      metadados: { origem: "automacao", agenda: schedule.id, pagina: page, linhas: itens.length },
    } as never);

    const candidatos =
      schedule.fonte === "radar"
        ? itens
            .map((i) => ({ item: i, score: ascensionScore(i.growthRate, i.salesVolume, i.revenue) }))
            .filter((c) => c.score >= RISING_BADGE_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .map((c) => c.item)
        : itens;

    const novo = candidatos.find((i) => !usadosExternos.has(`${i.source}:${i.externalId}`));
    if (!novo) continue;

    await admin.from("products").upsert(
      {
        name: novo.name,
        niche: novo.category,
        category_id: profile.category_id,
        price: novo.price,
        commission: novo.commission,
        url: novo.productUrl,
        hype: novo.hype,
        status: "Ativo",
        image_url: novo.imageUrl,
        seller_name: novo.sellerName,
        sales_volume: novo.salesVolume,
        growth_rate: novo.growthRate,
        revenue: novo.revenue,
        origin: "garimpo",
        source: novo.source,
        external_id: novo.externalId,
        profile_id: profile.id,
        tenant_id: schedule.tenant_id,
      },
      { onConflict: "profile_id,source,external_id", ignoreDuplicates: true },
    );

    const { data: row } = await admin
      .from("products")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("source", novo.source)
      .eq("external_id", novo.externalId)
      .maybeSingle();
    if (row?.id && !usados.has(row.id)) return { productId: row.id, nome: novo.name };
  }
  return null;
}

// -------------------------------------------------------------- execução

/** Cria o job da agenda, já com as configurações dela gravadas. */
async function criarJob(admin: Admin, schedule: any, produto: { productId: string; nome: string }) {
  let avatar: Record<string, unknown> = {};
  if (schedule.avatar_modo === "biblioteca" && schedule.avatar_id) {
    const { data: av } = await admin
      .from("profile_avatars")
      .select("id, reference_urls, description")
      .eq("id", schedule.avatar_id)
      .maybeSingle();
    if (av) {
      avatar = {
        avatar_id: av.id,
        avatar_reference_urls: av.reference_urls ?? [],
        avatar_description: av.description ?? null,
      };
    }
  }

  const { data, error } = await admin
    .from("jobs")
    .insert({
      product_id: produto.productId,
      profile_id: schedule.profile_id,
      tenant_id: schedule.tenant_id,
      status: "produto_escolhido",
      formato: "completo",
      title: produto.nome,
      automation_schedule_id: schedule.id,
      created_by: schedule.created_by ?? null,
      ...(schedule.voice_ref ? { voice_ref: schedule.voice_ref } : {}),
      ...(schedule.cenas_count ? { cenas_count: schedule.cenas_count } : {}),
      ...(schedule.take_duration ? { take_duration: schedule.take_duration } : {}),
      ...avatar,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Empurra o job pelo pipeline enquanto houver tempo. As cenas são aprovadas
 * automaticamente (é uma agenda), mas SEMPRE com nova checagem de custo antes
 * do Veo. Nada aqui reinicia etapas já concluídas.
 */
async function avancarJob(
  admin: Admin,
  schedule: any,
  jobId: string,
  diaBrasilia: string,
  ateMs: number,
): Promise<string> {
  const { advanceJobVideoCore, approveJobScenesCore } = await import("./video.functions");

  while (Date.now() < ateMs) {
    const { data: job } = await admin
      .from("jobs")
      .select("status, render_stage, cenas_count, take_duration")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return "Job removido.";

    if (job.status === "video_pronto" || job.status === "rascunho_enviado" || job.status === "publicado") {
      return "Vídeo pronto, aguardando revisão.";
    }
    if (job.render_stage === "render") return "Montagem em andamento no JSON2Video.";

    if (job.status === "cenas_geradas") {
      // Etapa cara: trava dupla + estimativa antes de acionar o Veo.
      const cenas = job.cenas_count ?? 3;
      const duracao = job.take_duration ?? 8;
      const estimativa = await estimarCustoVideo(admin, cenas, duracao, schedule.profile_id);
      await checarCusto(admin, schedule, diaBrasilia, estimativa);
      await approveJobScenesCore(admin, jobId, true);
      continue;
    }

    const res: any = await advanceJobVideoCore(admin, jobId, true);
    if (res?.done && !res?.stage) return "Etapa concluída.";
  }
  return "Tempo da execução esgotado; continua no próximo ciclo.";
}

/** Processa uma agenda elegível. Devolve o resultado do disparo. */
async function processarAgenda(
  admin: Admin,
  schedule: any,
  horario: string,
  diaBrasilia: string,
  ateMs: number,
) {
  // 1) IDEMPOTÊNCIA: a linha é criada antes de qualquer gasto.
  const { data: run, error: runError } = await admin
    .from("automation_runs")
    .insert({
      tenant_id: schedule.tenant_id,
      schedule_id: schedule.id,
      profile_id: schedule.profile_id,
      dia: diaBrasilia,
      horario,
      status: "gerando",
    })
    .select("id")
    .single();
  if (runError || !run) return null; // já existe um run deste horário: nada a fazer.

  const finalizar = async (status: string, mensagem: string, jobId?: string) => {
    await admin
      .from("automation_runs")
      .update({ status, mensagem, ...(jobId ? { job_id: jobId } : {}) })
      .eq("id", run.id);
    return { scheduleId: schedule.id as string, horario, status, mensagem, ...(jobId ? { jobId } : {}) };
  };

  try {
    // 2) TRAVA DUPLA antes de gastar qualquer coisa.
    await checarCusto(admin, schedule, diaBrasilia);

    // 3) Produto novo que passa pelos filtros.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, category_id")
      .eq("id", schedule.profile_id)
      .maybeSingle();
    if (!profile) return await finalizar("falhou", "Perfil da agenda não encontrado.");

    const produto = await escolherProduto(admin, schedule, profile);
    if (!produto) {
      // Sem novidade NÃO pausa a agenda: apenas avisa.
      return await finalizar("sem_produto", "Nenhum produto novo atendeu aos filtros neste horário.");
    }

    // 4) Geração: job -> roteiro -> cenas -> (aprovação automática) -> Veo -> montagem.
    const jobId = await criarJob(admin, schedule, produto);
    await admin.from("automation_schedules").update({ ultimo_disparo_em: new Date().toISOString() }).eq("id", schedule.id);
    await admin.from("automation_runs").update({ job_id: jobId }).eq("id", run.id);

    const { generateScriptForJob } = await import("./script.functions");
    await generateScriptForJob(admin, jobId, true);

    const { startJobScenes } = await import("./video.functions");
    await startJobScenes(admin, jobId, true);

    const mensagem = await avancarJob(admin, schedule, jobId, diaBrasilia, ateMs);
    return await finalizar("concluido", mensagem, jobId);
  } catch (e) {
    const { data: runRow } = await admin.from("automation_runs").select("job_id").eq("id", run.id).maybeSingle();
    const jobId = runRow?.job_id ?? undefined;
    if (e instanceof TetoAtingido) {
      await pausarAgenda(admin, schedule.id, erro(e));
      return await finalizar("pausado", erro(e), jobId);
    }
    // Falha isolada: a agenda continua ativa, o custo já incorrido fica registrado.
    console.error("[automacao] falha na agenda", schedule.id, erro(e));
    return await finalizar("falhou", erro(e), jobId);
  }
}

// ------------------------------------------------------------------- tick

/** Uma passada do cron: dispara agendas vencidas e continua jobs em andamento. */
export async function runAutomationTick(opts: { now?: Date; budgetMs?: number } = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const ateMs = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

  if (!(await acquireLock(admin, now))) {
    return { agendasElegiveis: 0, disparos: [], jobsAvancados: 0, ignorado: "Outra execução em andamento." };
  }

  const disparos: TickResult["disparos"] = [];
  let jobsAvancados = 0;
  let elegiveis = 0;

  try {
    const { dia, minutos } = brasiliaAgora(now);
    const toleranciaMin = JANELA_MS / 60000;

    const { data: schedules } = await admin
      .from("automation_schedules")
      .select("*")
      .eq("ativa", true);

    for (const schedule of (schedules ?? []) as any[]) {
      if (Date.now() >= ateMs) break;
      const horarios: string[] = Array.isArray(schedule.horarios) ? schedule.horarios : [];
      // Cada horário cadastrado gera um vídeo por dia.
      const vencidos = horarios
        .map((h) => ({ h, m: hhmmParaMinutos(String(h)) }))
        .filter((x) => x.m !== null && x.m <= minutos && minutos - (x.m as number) <= toleranciaMin)
        .sort((a, b) => (a.m as number) - (b.m as number));

      for (const { h } of vencidos) {
        if (Date.now() >= ateMs) break;
        elegiveis += 1;
        const res = await processarAgenda(admin, schedule, String(h), dia, ateMs);
        if (res) disparos.push(res);
      }
    }

    // Jobs de automação que ficaram no meio do caminho continuam aqui.
    if (Date.now() < ateMs) {
      const { data: pendentes } = await admin
        .from("jobs")
        .select("id, automation_schedule_id")
        .not("automation_schedule_id", "is", null)
        .is("deleted_at", null)
        .in("status", ["roteiro_pronto", "cenas_geradas", "gerando_video"])
        .order("updated_at", { ascending: true })
        .limit(5);

      for (const job of (pendentes ?? []) as any[]) {
        if (Date.now() >= ateMs) break;
        if (disparos.some((d) => d.jobId === job.id)) continue;
        const { data: schedule } = await admin
          .from("automation_schedules")
          .select("*")
          .eq("id", job.automation_schedule_id)
          .maybeSingle();
        if (!schedule) continue;
        try {
          await avancarJob(admin, schedule, job.id, dia, ateMs);
          jobsAvancados += 1;
        } catch (e) {
          if (e instanceof TetoAtingido) await pausarAgenda(admin, schedule.id, erro(e));
          console.error("[automacao] falha ao continuar job", job.id, erro(e));
        }
      }
    }
  } finally {
    await releaseLock(admin);
  }

  return { agendasElegiveis: elegiveis, disparos, jobsAvancados };
}
