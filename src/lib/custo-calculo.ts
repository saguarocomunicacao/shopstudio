/**
 * Cálculos puros de custo (sem banco, sem React). Usados pelas telas
 * Custos/Pipeline/Orçamento no navegador E pelo assistente no servidor,
 * para que os números sejam sempre os mesmos.
 */
import {
  computeEventoCusto,
  precoFerramentaBrl,
  type ConsumoEventoRow,
  type CreditoTaxaRow,
  type EtapaConsumo,
  type TarifaRow,
} from "./custo-core";

export type CustoEtapa = {
  etapa: EtapaConsumo;
  quantidade: number;
  eventos: number;
  valorBrl: number;
  semTarifa: boolean;
  estimado: boolean;
};

export type CustoJob = {
  etapas: CustoEtapa[];
  totalBrl: number;
  regeneracoes: number;
  takesDescartados: number;
  semTarifa: boolean;
  estimado: boolean;
};

const numJ = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Resumo de custo de um job, quebrado por etapa. */
export function computeJobCusto(
  eventos: ConsumoEventoRow[],
  tarifas: TarifaRow[],
  cotacao: number,
  taxas: CreditoTaxaRow[] = [],
): CustoJob {
  const segundosDoJob = eventos
    .filter((e) => e.etapa === "animacao_veo")
    .reduce((acc, e) => acc + (e.quantidade ?? 0), 0);

  const porEtapa = new Map<EtapaConsumo, CustoEtapa>();
  let total = 0;
  let regeneracoes = 0;
  let takesDescartados = 0;

  for (const evento of eventos) {
    const meta = evento.metadados ?? {};
    if (meta["origem"] === "regeneracao") regeneracoes += 1;
    if (meta["descartado"] === true) takesDescartados += 1;

    const custo = computeEventoCusto(evento, tarifas, cotacao, segundosDoJob, taxas);
    total += custo.valorBrl;

    const atual = porEtapa.get(evento.etapa) ?? {
      etapa: evento.etapa,
      quantidade: 0,
      eventos: 0,
      valorBrl: 0,
      semTarifa: false,
      estimado: false,
    };
    atual.quantidade += custo.unidadesTarifadas;
    atual.eventos += 1;
    atual.valorBrl += custo.valorBrl;
    atual.semTarifa = atual.semTarifa || custo.semTarifa;
    atual.estimado = atual.estimado || custo.estimado;
    porEtapa.set(evento.etapa, atual);
  }

  const ordem: EtapaConsumo[] = [
    "roteiro_texto",
    "transcricao_audio",
    "cena_gemini",
    "animacao_veo",
    "montagem_json2video",
    "narracao_elevenlabs",
    "busca_kalodata",
  ];
  const etapas = ordem.map((e) => porEtapa.get(e)).filter((e): e is CustoEtapa => !!e);

  return {
    etapas,
    totalBrl: total,
    regeneracoes,
    takesDescartados,
    semTarifa: etapas.some((e) => e.semTarifa),
    estimado: etapas.some((e) => e.estimado),
  };
}


/** Etapas como aparecem na tela (categorias é uma variação da busca Kalodata). */
export type EtapaVisual = EtapaConsumo | "categorias_kalodata";

export const ETAPA_VISUAL_LABELS: Record<EtapaVisual, string> = {
  roteiro_texto: "Roteiro",
  cena_gemini: "Cenas (Gemini)",
  animacao_veo: "Animação (Veo)",
  montagem_json2video: "Montagem (JSON2Video)",
  narracao_elevenlabs: "Narração (ElevenLabs)",
  transcricao_audio: "Ditado por voz",
  busca_kalodata: "Buscas (Kalodata)",
  categorias_kalodata: "Categorias (Kalodata)",
};

export const ETAPA_VISUAL_ORDEM: EtapaVisual[] = [
  "roteiro_texto",
  "transcricao_audio",
  "cena_gemini",
  "animacao_veo",
  "montagem_json2video",
  "narracao_elevenlabs",
  "busca_kalodata",
  "categorias_kalodata",
];

const CONSUMO_LABEL: Record<EtapaVisual, (q: number, eventos: number) => string> = {
  roteiro_texto: (q) => `${Math.round(q)} tokens`,
  cena_gemini: (q) => `${Math.round(q)} ${Math.round(q) === 1 ? "imagem" : "imagens"}`,
  animacao_veo: (q) => `${Math.round(q)} seg`,
  montagem_json2video: (q) => `${Number(q.toFixed(2))} créditos`,
  narracao_elevenlabs: (q) => `${Number(q.toFixed(2))} mil caracteres`,
  transcricao_audio: (q) => `${Number(q.toFixed(2))} min de áudio`,
  busca_kalodata: (_q, eventos) => `${eventos} ${eventos === 1 ? "chamada" : "chamadas"}`,
  categorias_kalodata: (_q, eventos) => `${eventos} ${eventos === 1 ? "chamada" : "chamadas"}`,
};

export const consumoLabel = (etapa: EtapaVisual, quantidade: number, eventos: number) =>
  CONSUMO_LABEL[etapa](quantidade, eventos);

/** Quantidade "bruta" exibida por etapa (tokens, imagens, segundos, créditos). */
const quantidadeBruta = (evento: ConsumoEventoRow, unidadesTarifadas: number) =>
  evento.etapa === "busca_kalodata" ? unidadesTarifadas : evento.quantidade ?? 0;

export const etapaVisualDe = (evento: ConsumoEventoRow): EtapaVisual => {
  const meta = evento.metadados ?? {};
  if (evento.etapa === "busca_kalodata" && meta["tipo"] === "atualizacao_categorias") return "categorias_kalodata";
  return evento.etapa;
};

export type LinhaEtapa = {
  etapa: EtapaVisual;
  quantidade: number;
  eventos: number;
  valorBrl: number;
  /** Preço cobrado do cliente (snapshot do plano) nos eventos desta etapa. */
  precoClienteBrl: number;
  percentual: number;
  estimado: boolean;
  semTarifa: boolean;
};

export type LinhaJob = {
  jobId: string;
  profileId: string | null;
  data: string;
  porEtapa: Partial<Record<EtapaVisual, number>>;
  totalBrl: number;
  regeneracoes: number;
};

export type LinhaBusca = {
  id: string;
  tipo: "busca" | "categorias";
  profileId: string | null;
  termo: string;
  linhas: number;
  created_at: string;
  valorBrl: number;
  semTarifa: boolean;
};

export type CustoPeriodo = {
  totalBrl: number;
  /** Soma do preço cobrado do cliente (snapshot) no período. */
  totalPrecoClienteBrl: number;
  jobsComCusto: number;
  buscasCount: number;
  custoMedioPorJob: number;
  porEtapa: LinhaEtapa[];
  porDia: { dia: string; valorBrl: number; acumulado: number }[];
  jobs: LinhaJob[];
  buscas: LinhaBusca[];
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Cruza eventos × tarifas e monta todas as visões da tela. */
export function agregarPeriodo(
  eventos: ConsumoEventoRow[],
  tarifas: TarifaRow[],
  cotacao: number,
  filtroEtapas: EtapaVisual[] = [],
  taxas: CreditoTaxaRow[] = [],
): CustoPeriodo {
  const filtrados = filtroEtapas.length
    ? eventos.filter((e) => filtroEtapas.includes(etapaVisualDe(e)))
    : eventos;

  // Segundos por job, para estimar créditos de montagem quando não vêm do fornecedor.
  const segundosPorJob = new Map<string, number>();
  for (const e of eventos) {
    if (e.etapa !== "animacao_veo" || !e.job_id) continue;
    segundosPorJob.set(e.job_id, (segundosPorJob.get(e.job_id) ?? 0) + (e.quantidade ?? 0));
  }

  const porEtapa = new Map<EtapaVisual, LinhaEtapa>();
  const porDia = new Map<string, number>();
  const jobs = new Map<string, LinhaJob>();
  const buscas: LinhaBusca[] = [];
  let totalBrl = 0;
  let totalPrecoClienteBrl = 0;

  for (const evento of filtrados) {
    const custo = computeEventoCusto(
      evento,
      tarifas,
      cotacao,
      evento.job_id ? segundosPorJob.get(evento.job_id) ?? 0 : 0,
      taxas,
    );
    const etapa = etapaVisualDe(evento);
    const precoCliente = precoFerramentaBrl(evento);
    totalBrl += custo.valorBrl;
    totalPrecoClienteBrl += precoCliente;

    const atual = porEtapa.get(etapa) ?? {
      etapa,
      quantidade: 0,
      eventos: 0,
      valorBrl: 0,
      precoClienteBrl: 0,
      percentual: 0,
      estimado: false,
      semTarifa: false,
    };
    atual.quantidade += quantidadeBruta(evento, custo.unidadesTarifadas);
    atual.eventos += 1;
    atual.valorBrl += custo.valorBrl;
    atual.precoClienteBrl += precoCliente;
    atual.estimado = atual.estimado || custo.estimado;
    atual.semTarifa = atual.semTarifa || custo.semTarifa;
    porEtapa.set(etapa, atual);

    const dia = evento.created_at.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + custo.valorBrl);

    if (evento.job_id) {
      const linha = jobs.get(evento.job_id) ?? {
        jobId: evento.job_id,
        profileId: evento.profile_id,
        data: evento.created_at,
        porEtapa: {},
        totalBrl: 0,
        regeneracoes: 0,
      };
      linha.porEtapa[etapa] = (linha.porEtapa[etapa] ?? 0) + custo.valorBrl;
      linha.totalBrl += custo.valorBrl;
      if ((evento.metadados ?? {})["origem"] === "regeneracao") linha.regeneracoes += 1;
      if (evento.created_at < linha.data) linha.data = evento.created_at;
      jobs.set(evento.job_id, linha);
    }

    if (etapa === "busca_kalodata" || etapa === "categorias_kalodata") {
      const meta = evento.metadados ?? {};
      buscas.push({
        id: evento.id,
        tipo: etapa === "categorias_kalodata" ? "categorias" : "busca",
        profileId: evento.profile_id,
        termo:
          etapa === "categorias_kalodata"
            ? "Atualização de categorias"
            : typeof meta["termo"] === "string" && meta["termo"]
              ? (meta["termo"] as string)
              : "sem termo",
        linhas: num(meta["linhas"]) ?? evento.quantidade ?? 0,
        created_at: evento.created_at,
        valorBrl: custo.valorBrl,
        semTarifa: custo.semTarifa,
      });
    }
  }

  const etapasOrdenadas = ETAPA_VISUAL_ORDEM.map((e) => porEtapa.get(e)).filter((e): e is LinhaEtapa => !!e);
  for (const linha of etapasOrdenadas) linha.percentual = totalBrl > 0 ? (linha.valorBrl / totalBrl) * 100 : 0;

  let acumulado = 0;
  const dias = [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dia, valorBrl]) => {
      acumulado += valorBrl;
      return { dia, valorBrl, acumulado };
    });

  const listaJobs = [...jobs.values()].sort((a, b) => b.totalBrl - a.totalBrl);
  buscas.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    totalBrl,
    totalPrecoClienteBrl,
    jobsComCusto: listaJobs.length,
    buscasCount: buscas.length,
    custoMedioPorJob: listaJobs.length ? totalBrl / listaJobs.length : 0,
    porEtapa: etapasOrdenadas,
    porDia: dias,
    jobs: listaJobs,
    buscas,
  };
}


export const CONFIG_KEYS = {
  tetoGlobal: "orcamento_mensal_global",
  bloqueioTotal: "orcamento_bloqueio_total",
  perfil: (id: string) => `orcamento_perfil:${id}`,
  saldoJson2video: "saldo_json2video",
  saldoJson2videoMin: "saldo_json2video_min",
  saldoKalodata: "saldo_kalodata",
  saldoKalodataMin: "saldo_kalodata_min",
} as const;

export type AppConfigRow = { key: string; value_num: number | null; value_text: string | null };

export type GastoMes = {
  globalBrl: number;
  perfilBrl: number;
  tetoGlobal: number | null;
  tetoPerfil: number | null;
  /** Fração do teto mais restritivo já consumida (0 a 1+). */
  uso: number;
  alerta: boolean;
  bloqueado: boolean;
  bloqueiaTudo: boolean;
};

/** Gasto do mês (perfil e geral) confrontado com os tetos — mesma conta da barra de orçamento. */
export function calcularGastoMes(
  eventos: ConsumoEventoRow[],
  precos: { tarifas: TarifaRow[]; cotacao: number; taxas: CreditoTaxaRow[] },
  config: Map<string, AppConfigRow>,
  profileId: string | null,
): GastoMes {
  let globalBrl = 0;
  let perfilBrl = 0;
  for (const evento of eventos) {
    const custo = computeEventoCusto(evento, precos.tarifas, precos.cotacao, 0, precos.taxas);
    globalBrl += custo.valorBrl;
    if (profileId && evento.profile_id === profileId) perfilBrl += custo.valorBrl;
  }
  const numOf = (key: string) => {
    const v = config.get(key)?.value_num;
    const n = v === null || v === undefined ? null : Number(v);
    return n !== null && Number.isFinite(n) && n > 0 ? n : null;
  };
  const tetoGlobal = numOf(CONFIG_KEYS.tetoGlobal);
  const tetoPerfil = profileId ? numOf(CONFIG_KEYS.perfil(profileId)) : null;
  const bloqueiaTudo = Number(config.get(CONFIG_KEYS.bloqueioTotal)?.value_num ?? 0) === 1;
  const uso = Math.max(tetoGlobal ? globalBrl / tetoGlobal : 0, tetoPerfil ? perfilBrl / tetoPerfil : 0);
  return { globalBrl, perfilBrl, tetoGlobal, tetoPerfil, uso, alerta: uso >= 0.8 && uso < 1, bloqueado: uso >= 1, bloqueiaTudo };
}

export const SELECT_EVENTOS_CUSTO =
  "id, job_id, profile_id, tenant_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, tool_price_cents, credito_consumido, credito_unidade, credito_origem";
