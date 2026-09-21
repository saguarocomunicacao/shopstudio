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
 * Preço da ferramenta para esta ação no plano vigente do cliente.
 * É gravado como snapshot no evento e nunca recalculado depois.
 */
async function toolPriceCents(
  supabaseAdmin: { from: (t: string) => any },
  tenantId: string,
  acao: BillableAction,
): Promise<number> {
  try {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("plan_id")
      .eq("id", tenantId)
      .maybeSingle();
    const planId = tenant?.plan_id ?? null;
    if (!planId) return 0;
    const { data: price } = await supabaseAdmin
      .from("plan_action_prices")
      .select("price_cents")
      .eq("plan_id", planId)
      .eq("action_type", acao)
      .maybeSingle();
    return Number(price?.price_cents ?? 0) || 0;
  } catch (e) {
    console.error("[consumo] falha ao resolver preço da ação", e);
    return 0;
  }
}


/** Grava um evento de consumo. Nunca derruba a geração se o log falhar. */
export async function recordConsumo(evento: ConsumoEvento): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // O insert roda com supabaseAdmin (sem sessão), então o tenant vem sempre da
    // entidade-pai: job -> perfil -> tenant da plataforma (consumo global).
    let tenantId: string | null = null;
    if (evento.jobId) {
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
    if (!tenantId) tenantId = PLATFORM_TENANT_ID;

    const acao = evento.acao ?? ACAO_POR_ETAPA[evento.etapa];
    const toolPrice = await toolPriceCents(supabaseAdmin as never, tenantId, acao);

    const { error } = await supabaseAdmin.from("consumo_eventos").insert({
      tenant_id: tenantId,
      job_id: evento.jobId ?? null,
      profile_id: evento.profileId ?? null,
      etapa: evento.etapa as never,
      action_type: acao,
      tool_price_cents: toolPrice,
      modelo: evento.modelo,
      quantidade: evento.quantidade,
      unidade: evento.unidade as never,
      metadados: (evento.metadados ?? {}) as never,
    });
    if (error) console.error("[consumo] falha ao registrar evento", error.message);
  } catch (e) {
    console.error("[consumo] falha ao registrar evento", e);
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
