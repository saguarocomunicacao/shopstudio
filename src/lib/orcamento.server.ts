/**
 * Guarda de orçamento no servidor: impede que a etapa cara (Veo) rode quando
 * o teto mensal configurado já foi atingido. O cálculo repete a mesma regra
 * do cliente (evento × tarifa vigente × cotação), sem depender da UI.
 */

type Evento = {
  profile_id: string | null;
  modelo: string;
  quantidade: number | null;
  unidade: string;
  etapa: string;
  metadados: Record<string, unknown> | null;
  created_at: string;
};

type Tarifa = {
  tipo_unidade: string;
  modelo: string;
  preco_unitario: number | string;
  moeda: "USD" | "BRL";
  vigente_desde: string;
  ativo: boolean;
};

function custoEvento(evento: Evento, tarifas: Tarifa[], cotacao: number) {
  let unidades = Number(evento.quantidade ?? 0);
  if (evento.etapa === "busca_kalodata") {
    const linhas = Number((evento.metadados ?? {})["linhas"] ?? evento.quantidade ?? 0);
    unidades = 0.1 * Math.ceil(linhas / 100);
  }
  const dia = evento.created_at.slice(0, 10);
  const tarifa = tarifas
    .filter((t) => t.ativo && t.modelo === evento.modelo && t.tipo_unidade === evento.unidade && t.vigente_desde <= dia)
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0];
  if (!tarifa) return 0;
  const valor = unidades * Number(tarifa.preco_unitario);
  return tarifa.moeda === "USD" ? valor * cotacao : valor;
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

  const [eventosRes, tarifasRes, configRes] = await Promise.all([
    supabaseAdmin
      .from("consumo_eventos")
      .select("profile_id, modelo, quantidade, unidade, etapa, metadados, created_at")
      .gte("created_at", desde),
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin.from("app_config").select("key, value_num"),
  ]);

  const eventos = (eventosRes.data ?? []) as unknown as Evento[];
  const tarifas = (tarifasRes.data ?? []) as unknown as Tarifa[];
  const config = new Map(
    ((configRes.data ?? []) as { key: string; value_num: number | null }[]).map((r) => [r.key, Number(r.value_num ?? 0)]),
  );
  const cotacao = config.get("cotacao_usd_brl") || 1;

  let globalBrl = 0;
  let perfilBrl = 0;
  for (const evento of eventos) {
    const valor = custoEvento(evento, tarifas, cotacao);
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
  const [eventosRes, tarifasRes, configRes, aportesRes] = await Promise.all([
    supabaseAdmin.from("consumo_eventos").select("profile_id, modelo, quantidade, unidade, etapa, metadados, created_at"),
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin.from("app_config").select("key, value_num"),
    supabaseAdmin.from("fornecedor_aportes").select("fornecedor, valor_brl"),
  ]);

  const config = new Map(
    ((configRes.data ?? []) as { key: string; value_num: number | null }[]).map((r) => [r.key, Number(r.value_num ?? 0)]),
  );
  if (config.get("investimento_bloqueio_saldo") !== 1) return;

  const cotacao = config.get("cotacao_usd_brl") || 1;
  const limitePercent = config.get("investimento_alerta_percent") || 20;
  const tarifas = (tarifasRes.data ?? []) as unknown as Tarifa[];
  const eventos = (eventosRes.data ?? []) as unknown as Evento[];

  const googleEtapas = new Set(["roteiro_texto", "cena_gemini", "animacao_veo"]);
  let consumo = 0;
  for (const evento of eventos) {
    if (!googleEtapas.has(evento.etapa)) continue;
    consumo += custoEvento(evento, tarifas, cotacao);
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
