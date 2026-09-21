/**
 * Agregações de custo por período usadas na tela "Custos".
 * Só lê os eventos de consumo já gravados e aplica a tarifa vigente
 * (a lógica de tarifa/conversão continua em custo.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeEventoCusto,
  useTarifas,
  type ConsumoEventoRow,
  type EtapaConsumo,
  type TarifaRow,
  type UnidadeTarifa,
} from "./custo";

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

  for (const evento of filtrados) {
    const custo = computeEventoCusto(evento, tarifas, cotacao, evento.job_id ? segundosPorJob.get(evento.job_id) ?? 0 : 0);
    const etapa = etapaVisualDe(evento);
    totalBrl += custo.valorBrl;

    const atual = porEtapa.get(etapa) ?? {
      etapa,
      quantidade: 0,
      eventos: 0,
      valorBrl: 0,
      percentual: 0,
      estimado: false,
      semTarifa: false,
    };
    atual.quantidade += quantidadeBruta(evento, custo.unidadesTarifadas);
    atual.eventos += 1;
    atual.valorBrl += custo.valorBrl;
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
    jobsComCusto: listaJobs.length,
    buscasCount: buscas.length,
    custoMedioPorJob: listaJobs.length ? totalBrl / listaJobs.length : 0,
    porEtapa: etapasOrdenadas,
    porDia: dias,
    jobs: listaJobs,
    buscas,
  };
}

const selectEventos = "id, job_id, profile_id, etapa, modelo, quantidade, unidade, metadados, created_at";

/** Eventos de consumo do intervalo; profileId nulo traz todos os perfis acessíveis. */
export function useEventosPeriodo(desde: string, ate: string, profileIds: string[] | null) {
  const chavePerfis = profileIds ? [...profileIds].sort().join(",") : "todos";
  return useQuery({
    queryKey: ["custo-periodo", desde, ate, chavePerfis],
    staleTime: 30_000,
    queryFn: async () => {
      if (profileIds && profileIds.length === 0) return [] as ConsumoEventoRow[];
      let query = supabase
        .from("consumo_eventos")
        .select(selectEventos)
        .gte("created_at", desde)
        .lte("created_at", ate)
        .order("created_at", { ascending: true });
      if (profileIds && profileIds.length === 1) query = query.eq("profile_id", profileIds[0]!);
      else if (profileIds && profileIds.length > 1) query = query.in("profile_id", profileIds);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConsumoEventoRow[];
    },
  });
}

/** Visão completa de custo do período, já agregada. */
export function useCustoPeriodo(
  desde: string,
  ate: string,
  profileIds: string[] | null,
  etapas: EtapaVisual[],
) {
  const { data: precos } = useTarifas();
  const { data: eventos, isLoading } = useEventosPeriodo(desde, ate, profileIds);
  const chaveEtapas = [...etapas].sort().join(",");
  const pronto = !!precos && !!eventos;
  return {
    isLoading: isLoading || !pronto,
    data: pronto ? agregarPeriodo(eventos!, precos!.tarifas, precos!.cotacao, etapas) : null,
    chaveEtapas,
  };
}

export type { UnidadeTarifa };
