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
  | "transcricao_audio";

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
  | "atualizacao_categorias";

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
};

export type TarifaRow = {
  tipo_unidade: UnidadeTarifa;
  modelo: string;
  preco_unitario: number;
  moeda: "USD" | "BRL";
  vigente_desde: string;
  ativo: boolean;
};

export type CustoEvento = {
  evento: ConsumoEventoRow;
  /** Quantidade efetivamente tarifada (pontos, no caso da busca). */
  unidadesTarifadas: number;
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

/** Custo de um evento, já convertido para reais. */
export function computeEventoCusto(
  evento: ConsumoEventoRow,
  tarifas: TarifaRow[],
  cotacao: number,
  /** Segundos totais de vídeo do job, usado para estimar créditos de montagem. */
  segundosDoJob = 0,
): CustoEvento {
  const meta = evento.metadados ?? {};
  let estimado = Boolean(meta["duracao_estimada"]);
  let unidades = evento.quantidade ?? 0;

  if (evento.etapa === "busca_kalodata") {
    const linhas = num(meta["linhas"]) ?? evento.quantidade ?? 0;
    unidades = 0.1 * Math.ceil(linhas / 100);
  }

  if (evento.etapa === "montagem_json2video" && evento.quantidade === null) {
    // Créditos não retornados: ~1 crédito por segundo de vídeo montado.
    unidades = segundosDoJob;
    estimado = true;
  }

  const tarifa = findTarifa(tarifas, evento.modelo, evento.unidade, evento.created_at);
  if (!tarifa) {
    return {
      evento,
      unidadesTarifadas: unidades,
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
    valorOriginal,
    moeda: tarifa.moeda,
    cotacaoUsada: cotacao,
    valorBrl,
    semTarifa: false,
    estimado,
  };
}
