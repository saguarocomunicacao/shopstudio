/**
 * Log append-only de consumo real (imagens, segundos de vídeo, créditos de
 * montagem e buscas de produto). Nunca apaga nada: reinício de job não zera
 * o histórico, porque o que já foi gerado já foi cobrado pelo fornecedor.
 */

/** Ações cobráveis da ferramenta (catálogo billable_actions). */
export type BillableAction =
  | "roteiro"
  | "descricao_produto"
  | "transcricao"
  | "cena"
  | "video"
  | "montagem"
  | "narracao"
  | "clonagem_voz"
  | "busca_produto"
  | "atualizacao_produto"
  | "videos_campeoes"
  | "atualizacao_categorias";

export type ConsumoEvento = {
  jobId?: string | null;
  /** Força o cliente (tenant) dono do consumo quando não há job nem perfil. */
  tenantId?: string | null;
  /** Nulo em consumo global, como a atualização de categorias oficiais. */
  profileId: string | null;
  etapa:
    | "cena_gemini"
    | "animacao_veo"
    | "montagem_json2video"
    | "busca_kalodata"
    | "roteiro_texto"
    | "narracao_elevenlabs"
    | "transcricao_audio";
  /** Ação cobrável correspondente; sem ela caímos no mapa padrão da etapa. */
  acao?: BillableAction;
  modelo: string;
  quantidade: number | null;
  unidade:
    | "imagem"
    | "segundo_video"
    | "credito_montagem"
    | "bloco_linhas_kalodata"
    | "token_input"
    | "token_output"
    | "mil_caracteres"
    | "minuto_audio";
  metadados?: Record<string, unknown>;
};

/** Ação padrão quando o ponto de consumo não informa uma explicitamente. */
const ACAO_POR_ETAPA: Record<ConsumoEvento["etapa"], BillableAction> = {
  cena_gemini: "cena",
  animacao_veo: "video",
  montagem_json2video: "montagem",
  busca_kalodata: "busca_produto",
  roteiro_texto: "roteiro",
  narracao_elevenlabs: "narracao",
  transcricao_audio: "transcricao",
};

/** Tenant da plataforma, usado apenas em consumo global (sem job e sem perfil). */
const PLATFORM_TENANT_ID = "f7192d96-160f-4157-8599-eced5990bf8b";

/**
 * Preço de UMA unidade da ação, derivado do pacote vigente do plano do cliente
 * (quantidade do pacote / preço do pacote). Gravado como snapshot no evento.
 */
async function toolPriceCents(tenantId: string, acao: BillableAction): Promise<{ price: number; mode: "unitario" }> {
  try {
    const { planPricing } = await import("./saldo.server");
    const pacote = (await planPricing(tenantId)).get(acao);
    if (!pacote || pacote.priceCents <= 0) return { price: 0, mode: "unitario" };
    return { price: Math.round(pacote.priceCents / Math.max(1, pacote.qty)), mode: "unitario" };
  } catch (e) {
    console.error("[consumo] falha ao resolver preço da ação", e);
    return { price: 0, mode: "unitario" };
  }
}


/**
 * Tarifa vigente e taxa de crédito da ação, lidas do banco (nada fixo no código).
 * Devolve também o crédito/ponto nativo consumido do fornecedor.
 */
async function resolverCreditoETarifa(
  supabaseAdmin: { from: (t: string) => any },
  evento: ConsumoEvento,
  acao: BillableAction,
  agora: string,
) {
  const { computeCreditoEvento, findTarifa, CREDITO_UNIDADE } = await import("./custo-core");

  // Segundos do job, só necessários para estimar créditos de montagem.
  let segundosDoJob = 0;
  if (evento.unidade === "credito_montagem" && evento.quantidade === null && evento.jobId) {
    const { data } = await supabaseAdmin
      .from("consumo_eventos")
      .select("quantidade")
      .eq("job_id", evento.jobId)
      .eq("etapa", "animacao_veo");
    segundosDoJob = ((data ?? []) as { quantidade: number | null }[]).reduce(
      (soma, row) => soma + Number(row.quantidade ?? 0),
      0,
    );
  }

  const [tarifasRes, taxasRes] = await Promise.all([
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin
      .from("credito_taxas")
      .select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
  ]);
  const tarifas = ((tarifasRes.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    preco_unitario: Number(t["preco_unitario"]),
  })) as never[];
  const taxas = ((taxasRes.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    credito_por_unidade: Number(t["credito_por_unidade"]),
  })) as never[];

  const linha = {
    id: "",
    job_id: evento.jobId ?? null,
    profile_id: evento.profileId,
    etapa: evento.etapa,
    modelo: evento.modelo,
    quantidade: evento.quantidade,
    unidade: evento.unidade,
    metadados: evento.metadados ?? {},
    created_at: agora,
    action_type: acao,
  } as never;

  const credito = computeCreditoEvento(linha, taxas, segundosDoJob);
  const tarifa = findTarifa(tarifas, evento.modelo, evento.unidade as never, agora);
  return {
    credito,
    semTarifa: !tarifa,
    unidadeCredito: (CREDITO_UNIDADE as Record<string, string | undefined>)[evento.unidade] ?? null,
  };
}

/** Grava um evento de consumo. Nunca derruba a geração se o log falhar. */
export async function recordConsumo(evento: ConsumoEvento): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // O insert roda com supabaseAdmin (sem sessão), então o tenant vem sempre da
    // entidade-pai: tenant informado -> job -> perfil -> tenant da plataforma.
    let tenantId: string | null = evento.tenantId ?? null;
    if (!tenantId && evento.jobId) {
      const { data } = await supabaseAdmin.from("jobs").select("tenant_id").eq("id", evento.jobId).maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }
    if (!tenantId && evento.profileId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("id", evento.profileId)
        .maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }
    if (!tenantId) {
      console.error("[consumo] evento sem tenant identificado; usando o tenant da plataforma", {
        etapa: evento.etapa,
        modelo: evento.modelo,
      });
      tenantId = PLATFORM_TENANT_ID;
    }

    const acao = evento.acao ?? ACAO_POR_ETAPA[evento.etapa];
    const agora = new Date().toISOString();
    const toolPrice = await toolPriceCents(tenantId, acao);

    // Débito atômico de 1 unidade da carteira (nulo quando o pacote é gratuito).
    const { debitAction } = await import("./saldo.server");
    const walletMovementId = await debitAction(tenantId, acao, evento.jobId ?? null);
    const { credito, semTarifa } = await resolverCreditoETarifa(supabaseAdmin as never, evento, acao, agora);

    if (semTarifa) {
      console.error("[consumo] evento sem tarifa cadastrada (custo ficaria zerado)", {
        modelo: evento.modelo,
        unidade: evento.unidade,
        acao,
      });
    }
    if (credito.semTaxa) {
      console.error("[consumo] evento sem taxa de crédito cadastrada", { acao, unidade: evento.unidade });
    }

    const metadados: Record<string, unknown> = { ...(evento.metadados ?? {}) };
    if (semTarifa) metadados["sem_tarifa"] = true;
    if (credito.semTaxa) metadados["sem_taxa_credito"] = true;

    const { data: inserido, error } = await supabaseAdmin.from("consumo_eventos").insert({
      tenant_id: tenantId,
      job_id: evento.jobId ?? null,
      profile_id: evento.profileId ?? null,
      etapa: evento.etapa as never,
      action_type: acao,
      tool_price_cents: toolPrice.price,
      billing_mode: toolPrice.mode,
      wallet_movement_id: walletMovementId,
      modelo: evento.modelo,
      quantidade: evento.quantidade,
      unidade: evento.unidade as never,
      credito_consumido: credito.credito,
      credito_unidade: credito.unidade,
      credito_origem: credito.origem,
      metadados: metadados as never,
    }).select("id").maybeSingle();
    if (error) console.error("[consumo] falha ao registrar evento", error.message);
    return (inserido as { id?: string } | null)?.id ?? null;
  } catch (e) {
    console.error("[consumo] falha ao registrar evento", e);
    return null;
  }
}

/** Procura a quantidade de créditos em uma resposta do JSON2Video. */
export function findCredits(node: unknown, depth = 0): number | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCredits(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if ((k === "credits" || k.includes("credits_used") || k.includes("creditsused") || k.includes("credit_cost")) ) {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
      if (Number.isFinite(n)) return n;
    }
    const found = findCredits(value, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
