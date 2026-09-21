/**
 * Guarda de orçamento no servidor: impede que novas ações rodem quando o teto
 * mensal configurado já foi atingido. O cálculo usa exatamente a mesma função
 * das telas (custo-core), para tela e bloqueio nunca discordarem.
 */
import {
  computeEventoCusto,
  type ConsumoEventoRow,
  type CreditoTaxaRow,
  type TarifaRow,
} from "./custo-core";

const SELECT_EVENTOS =
  "id, job_id, profile_id, tenant_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, tool_price_cents, credito_consumido, credito_unidade, credito_origem";

const normalizarTarifas = (rows: unknown) =>
  ((rows ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    preco_unitario: Number(t["preco_unitario"]),
  })) as unknown as TarifaRow[];

const normalizarTaxas = (rows: unknown) =>
  ((rows ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    credito_por_unidade: Number(t["credito_por_unidade"]),
  })) as unknown as CreditoTaxaRow[];

/** Segundos de vídeo por job, usados para estimar créditos de montagem. */
function segundosPorJobDe(eventos: ConsumoEventoRow[]) {
  const mapa = new Map<string, number>();
  for (const e of eventos) {
    if (e.etapa !== "animacao_veo" || !e.job_id) continue;
    mapa.set(e.job_id, (mapa.get(e.job_id) ?? 0) + (e.quantidade ?? 0));
  }
  return mapa;
}

function custoEvento(
  evento: ConsumoEventoRow,
  tarifas: TarifaRow[],
  taxas: CreditoTaxaRow[],
  cotacao: number,
  segundos: Map<string, number>,
) {
  return computeEventoCusto(
    evento,
    tarifas,
    cotacao,
    evento.job_id ? segundos.get(evento.job_id) ?? 0 : 0,
    taxas,
  ).valorBrl;
}

export type OrcamentoStatus = {
  globalBrl: number;
  perfilBrl: number;
  tetoGlobal: number | null;
  tetoPerfil: number | null;
  bloqueado: boolean;
  bloqueiaTudo: boolean;
};

/** Situação do orçamento do mês corrente para um perfil. */
export async function getOrcamentoStatus(profileId: string): Promise<OrcamentoStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inicio = new Date();
  const desde = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1)).toISOString();

  const [eventosRes, tarifasRes, taxasRes, configRes] = await Promise.all([
    supabaseAdmin.from("consumo_eventos").select(SELECT_EVENTOS).gte("created_at", desde),
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin
      .from("credito_taxas")
      .select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
    supabaseAdmin.from("app_config").select("key, value_num"),
  ]);

  const eventos = (eventosRes.data ?? []) as unknown as ConsumoEventoRow[];
  const tarifas = normalizarTarifas(tarifasRes.data);
  const taxas = normalizarTaxas(taxasRes.data);
  const segundos = segundosPorJobDe(eventos);
  const config = new Map(
    ((configRes.data ?? []) as { key: string; value_num: number | null }[]).map((r) => [r.key, Number(r.value_num ?? 0)]),
  );
  const cotacao = config.get("cotacao_usd_brl") || 1;

  let globalBrl = 0;
  let perfilBrl = 0;
  for (const evento of eventos) {
    const valor = custoEvento(evento, tarifas, taxas, cotacao, segundos);
    globalBrl += valor;
    if (evento.profile_id === profileId) perfilBrl += valor;
  }

  const pos = (v: number | undefined) => (v && Number.isFinite(v) && v > 0 ? v : null);
  const tetoGlobal = pos(config.get("orcamento_mensal_global"));
  const tetoPerfil = pos(config.get(`orcamento_perfil:${profileId}`));
  const bloqueado =
    (tetoGlobal !== null && globalBrl >= tetoGlobal) || (tetoPerfil !== null && perfilBrl >= tetoPerfil);

  return {
    globalBrl,
    perfilBrl,
    tetoGlobal,
    tetoPerfil,
    bloqueado,
    bloqueiaTudo: config.get("orcamento_bloqueio_total") === 1,
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Bloqueia a ação quando o teto do mês já foi atingido.
 * `apenasEtapaCara` marca ações baratas, que só travam se o admin escolher
 * bloquear tudo ao estourar o orçamento.
 */
export async function assertOrcamento(profileId: string, opts: { barata?: boolean } = {}) {
  const status = await getOrcamentoStatus(profileId);
  if (!status.bloqueado) return status;
  if (opts.barata && !status.bloqueiaTudo) return status;

  const teto = status.tetoPerfil !== null && status.perfilBrl >= status.tetoPerfil ? status.tetoPerfil : status.tetoGlobal;
  throw new Error(
    `O orçamento do mês (${brl(teto ?? 0)}) foi atingido. Um administrador precisa aumentar o teto em Configurações para continuar gerando.`,
  );
}

/**
 * Guarda de saldo do fornecedor pré-pago (Google): aportes lançados menos o
 * consumo já gravado. Só bloqueia quando o admin liga o bloqueio por saldo.
 */
export async function assertSaldoFornecedor(etapa: "animacao_veo") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [eventosRes, tarifasRes, taxasRes, configRes, aportesRes] = await Promise.all([
    supabaseAdmin.from("consumo_eventos").select(SELECT_EVENTOS),
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin
      .from("credito_taxas")
      .select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
    supabaseAdmin.from("app_config").select("key, value_num"),
    supabaseAdmin.from("fornecedor_aportes").select("fornecedor, valor_brl"),
  ]);

  const config = new Map(
    ((configRes.data ?? []) as { key: string; value_num: number | null }[]).map((r) => [r.key, Number(r.value_num ?? 0)]),
  );
  if (config.get("investimento_bloqueio_saldo") !== 1) return;

  const cotacao = config.get("cotacao_usd_brl") || 1;
  const limitePercent = config.get("investimento_alerta_percent") || 20;
  const tarifas = normalizarTarifas(tarifasRes.data);
  const taxas = normalizarTaxas(taxasRes.data);
  const eventos = (eventosRes.data ?? []) as unknown as ConsumoEventoRow[];
  const segundos = segundosPorJobDe(eventos);

  const googleEtapas = new Set(["roteiro_texto", "cena_gemini", "animacao_veo"]);
  let consumo = 0;
  for (const evento of eventos) {
    if (!googleEtapas.has(evento.etapa)) continue;
    consumo += custoEvento(evento, tarifas, taxas, cotacao, segundos);
  }
  const aportado = ((aportesRes.data ?? []) as { fornecedor: string; valor_brl: number | string }[])
    .filter((a) => a.fornecedor === "google")
    .reduce((s, a) => s + Number(a.valor_brl), 0);

  if (aportado <= 0) return;
  const restante = (aportado - consumo) / aportado;
  if (restante * 100 >= limitePercent) return;

  void etapa;
  throw new Error(
    `O saldo do Google está baixo (${brl(aportado - consumo)} restantes). Registre um novo aporte em Investimento para continuar gerando vídeos.`,
  );
}
