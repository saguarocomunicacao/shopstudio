/**
 * Núcleo puro do cálculo de custo de API (sem React e sem cliente de banco),
 * para poder rodar igual no navegador e nas funções de servidor.
 */

export type EtapaConsumo =
  | "cena_gemini"
  | "animacao_veo"
  | "montagem_json2video"
  | "busca_kalodata"
  | "roteiro_texto"
  | "narracao_elevenlabs"
  | "transcricao_audio"
  | "analise_video";

export type UnidadeTarifa =
  | "imagem"
  | "segundo_video"
  | "credito_montagem"
  | "bloco_linhas_kalodata"
  | "token_input"
  | "token_output"
  | "mil_caracteres"
  | "minuto_audio";

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
  | "atualizacao_categorias"
  | "analise_video";

export const ACAO_LABELS: Record<BillableAction, string> = {
  roteiro: "Roteiro",
  descricao_produto: "Descrição de produto",
  transcricao: "Ditado por voz",
  cena: "Cena (imagem)",
  video: "Animação de vídeo",
  montagem: "Montagem do vídeo",
  narracao: "Narração",
  clonagem_voz: "Clonagem de voz",
  busca_produto: "Busca de produto",
  atualizacao_produto: "Atualização de produto",
  videos_campeoes: "Vídeos campeões",
  atualizacao_categorias: "Atualização de categorias",
  analise_video: "Análise de vídeo",
};

export type ConsumoEventoRow = {
  id: string;
  job_id: string | null;
  profile_id: string | null;
  etapa: EtapaConsumo;
  modelo: string;
  quantidade: number | null;
  unidade: UnidadeTarifa;
  metadados: Record<string, unknown> | null;
  created_at: string;
  tenant_id?: string | null;
  action_type?: BillableAction | null;
  tool_price_cents?: number | null;
  /** Consumo em crédito/ponto nativo do fornecedor (null quando não se aplica). */
  credito_consumido?: number | null;
  credito_unidade?: string | null;
  credito_origem?: "real" | "estimado" | null;
};

export type TarifaRow = {
  tipo_unidade: UnidadeTarifa;
  modelo: string;
  preco_unitario: number;
  moeda: "USD" | "BRL";
  vigente_desde: string;
  ativo: boolean;
};

export type CreditoRegra = "por_chamada" | "por_bloco_100_linhas" | "por_segundo";

export type CreditoTaxaRow = {
  action_type: BillableAction;
  fornecedor: string;
  credito_por_unidade: number;
  regra: CreditoRegra;
  vigente_desde: string;
  ativo: boolean;
};

/** Unidade nativa de crédito por unidade tarifada do evento. */
export const CREDITO_UNIDADE: Partial<Record<UnidadeTarifa, string>> = {
  bloco_linhas_kalodata: "pontos",
  credito_montagem: "créditos",
  mil_caracteres: "mil caracteres",
};

export type CreditoEvento = {
  /** Crédito/ponto consumido do fornecedor; null quando o fornecedor cobra só em dinheiro. */
  credito: number | null;
  unidade: string | null;
  origem: "real" | "estimado" | null;
  /** Não existe taxa cadastrada para a ação: não dá para estimar o crédito. */
  semTaxa: boolean;
};


export type CustoEvento = {
  evento: ConsumoEventoRow;
  /** Quantidade efetivamente tarifada (pontos, no caso da busca). */
  unidadesTarifadas: number;
  /** Consumo na unidade nativa do fornecedor (pontos/créditos), quando existe. */
  credito: CreditoEvento;

  valorOriginal: number;
  moeda: "USD" | "BRL";
  cotacaoUsada: number;
  valorBrl: number;
  semTarifa: boolean;
  estimado: boolean;
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Preço da ferramenta gravado no evento (snapshot), em reais. */
export const precoFerramentaBrl = (evento: ConsumoEventoRow) => (evento.tool_price_cents ?? 0) / 100;

/** Ação cobrável do evento, caindo no mapa da etapa quando o evento é antigo. */
export const acaoDoEvento = (evento: ConsumoEventoRow): BillableAction => {
  if (evento.action_type) return evento.action_type;
  const meta = evento.metadados ?? {};
  if (evento.etapa === "busca_kalodata" && meta["tipo"] === "atualizacao_categorias") return "atualizacao_categorias";
  const mapa: Record<EtapaConsumo, BillableAction> = {
    cena_gemini: "cena",
    animacao_veo: "video",
    montagem_json2video: "montagem",
    busca_kalodata: "busca_produto",
    roteiro_texto: "roteiro",
    narracao_elevenlabs: "narracao",
    transcricao_audio: "transcricao",
    analise_video: "analise_video",
  };
  return mapa[evento.etapa];
};

/** Tarifa vigente: mesmo modelo e unidade, ativa, com a vigência mais recente até a data. */
export function findTarifa(tarifas: TarifaRow[], modelo: string, unidade: UnidadeTarifa, quando: string) {
  const dia = quando.slice(0, 10);
  const candidatas = tarifas
    .filter((t) => t.ativo && t.modelo === modelo && t.tipo_unidade === unidade && t.vigente_desde <= dia)
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1));
  return candidatas[0] ?? null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Taxa de crédito vigente para a ação (tabela credito_taxas, configurável no backoffice). */
export function findCreditoTaxa(taxas: CreditoTaxaRow[], acao: BillableAction, quando: string) {
  const dia = quando.slice(0, 10);
  return (
    taxas
      .filter((t) => t.ativo && t.action_type === acao && t.vigente_desde <= dia)
      .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0] ?? null
  );
}

/**
 * Consumo em crédito/ponto nativo do fornecedor.
 * Quando a API devolve o crédito real, ele é preferido e marcado como "real";
 * caso contrário aplicamos a taxa configurada e marcamos como "estimado".
 * Google (tokens, imagens, segundos) e ditado por voz não têm crédito nativo.
 */
export function computeCreditoEvento(
  evento: ConsumoEventoRow,
  taxas: CreditoTaxaRow[],
  segundosDoJob = 0,
): CreditoEvento {
  const unidadeCredito = CREDITO_UNIDADE[evento.unidade] ?? null;
  if (!unidadeCredito) return { credito: null, unidade: null, origem: null, semTaxa: false };

  // Valor já congelado no evento (gravado na hora do consumo ou pelo backfill).
  if (evento.credito_consumido !== null && evento.credito_consumido !== undefined) {
    return {
      credito: Number(evento.credito_consumido),
      unidade: evento.credito_unidade ?? unidadeCredito,
      origem: evento.credito_origem ?? "estimado",
      semTaxa: false,
    };
  }

  const meta = evento.metadados ?? {};

  // ElevenLabs: medimos os caracteres do nosso lado, é o consumo real.
  if (evento.unidade === "mil_caracteres") {
    return { credito: evento.quantidade ?? 0, unidade: unidadeCredito, origem: "real", semTaxa: false };
  }

  // JSON2Video: crédito real quando a API devolve; senão a taxa por segundo.
  if (evento.unidade === "credito_montagem") {
    if (evento.quantidade !== null && evento.quantidade !== undefined) {
      return { credito: Number(evento.quantidade), unidade: unidadeCredito, origem: "real", semTaxa: false };
    }
    const taxa = findCreditoTaxa(taxas, acaoDoEvento(evento), evento.created_at);
    if (!taxa) return { credito: null, unidade: unidadeCredito, origem: null, semTaxa: true };
    return {
      credito: Number(taxa.credito_por_unidade) * segundosDoJob,
      unidade: unidadeCredito,
      origem: "estimado",
      semTaxa: false,
    };
  }

  // Kalodata: pontos reais quando a API expuser; senão a taxa da ação.
  const creditosApi = num(meta["creditos_api"]);
  if (creditosApi !== null) {
    return { credito: creditosApi, unidade: unidadeCredito, origem: "real", semTaxa: false };
  }
  const taxa = findCreditoTaxa(taxas, acaoDoEvento(evento), evento.created_at);
  if (!taxa) return { credito: null, unidade: unidadeCredito, origem: null, semTaxa: true };
  const porUnidade = Number(taxa.credito_por_unidade);
  if (taxa.regra === "por_chamada") {
    return { credito: porUnidade, unidade: unidadeCredito, origem: "estimado", semTaxa: false };
  }
  if (taxa.regra === "por_segundo") {
    return { credito: porUnidade * segundosDoJob, unidade: unidadeCredito, origem: "estimado", semTaxa: false };
  }
  const linhas = num(meta["linhas"]) ?? evento.quantidade ?? 0;
  return {
    credito: porUnidade * Math.ceil(linhas / 100),
    unidade: unidadeCredito,
    origem: "estimado",
    semTaxa: false,
  };
}

/** Custo de um evento, já convertido para reais. */
export function computeEventoCusto(
  evento: ConsumoEventoRow,
  tarifas: TarifaRow[],
  cotacao: number,
  /** Segundos totais de vídeo do job, usado para estimar créditos de montagem. */
  segundosDoJob = 0,
  /** Taxas de crédito por ação (credito_taxas). */
  taxas: CreditoTaxaRow[] = [],
): CustoEvento {
  const meta = evento.metadados ?? {};
  let estimado = Boolean(meta["duracao_estimada"]);
  let unidades = evento.quantidade ?? 0;

  // Fornecedores que cobram em crédito/ponto são tarifados sobre o crédito consumido.
  const credito = computeCreditoEvento(evento, taxas, segundosDoJob);
  if (evento.unidade === "bloco_linhas_kalodata" || evento.unidade === "credito_montagem") {
    unidades = credito.credito ?? 0;
    if (credito.origem === "estimado") estimado = true;
  }

  const tarifa = findTarifa(tarifas, evento.modelo, evento.unidade, evento.created_at);
  if (!tarifa) {
    return {
      evento,
      unidadesTarifadas: unidades,
      credito,
      valorOriginal: 0,
      moeda: "BRL",
      cotacaoUsada: cotacao,
      valorBrl: 0,
      semTarifa: true,
      estimado,
    };
  }

  const valorOriginal = unidades * Number(tarifa.preco_unitario);
  const valorBrl = tarifa.moeda === "USD" ? valorOriginal * cotacao : valorOriginal;
  return {
    evento,
    unidadesTarifadas: unidades,
    credito,
    valorOriginal,
    moeda: tarifa.moeda,
    cotacaoUsada: cotacao,
    valorBrl,
    semTarifa: false,
    estimado,
  };

}
