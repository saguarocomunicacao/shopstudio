/**
 * Cálculo de custo real: cruza os eventos de consumo (append-only) com a
 * tarifa vigente na data de cada evento e converte tudo para reais.
 * O módulo é puro (sem dependência de servidor) para poder ser reaproveitado
 * em qualquer tela ou rotina de backend.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export const ETAPA_LABELS: Record<EtapaConsumo, string> = {
  cena_gemini: "Cenas (imagens)",
  animacao_veo: "Animação",
  montagem_json2video: "Montagem",
  busca_kalodata: "Busca de produto",
  roteiro_texto: "Roteiro",
  narracao_elevenlabs: "Narração (ElevenLabs)",
  transcricao_audio: "Ditado por voz",
};

export const UNIDADE_LABELS: Record<UnidadeTarifa, (q: number) => string> = {
  imagem: (q) => `${q} ${q === 1 ? "imagem" : "imagens"}`,
  segundo_video: (q) => `${Math.round(q)} seg`,
  credito_montagem: (q) => `${Number(q.toFixed(2))} ${q === 1 ? "crédito" : "créditos"}`,
  bloco_linhas_kalodata: (q) => `${Number(q.toFixed(2))} pontos`,
  token_input: (q) => `${Math.round(q)} tokens`,
  token_output: (q) => `${Math.round(q)} tokens`,
  mil_caracteres: (q) => `${Number(q.toFixed(2))} mil caracteres`,
  minuto_audio: (q) => `${Number(q.toFixed(2))} min de áudio`,
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

/** Resumo de custo de um job, quebrado por etapa. */
export function computeJobCusto(eventos: ConsumoEventoRow[], tarifas: TarifaRow[], cotacao: number): CustoJob {
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

    const custo = computeEventoCusto(evento, tarifas, cotacao, segundosDoJob);
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

/** Tarifas ativas + cotação do dólar configurada. */
export function useTarifas() {
  return useQuery({
    queryKey: ["custo-tarifas"],
    staleTime: 60_000,
    queryFn: async () => {
      const [tarifasRes, cotacaoRes] = await Promise.all([
        supabase.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
        supabase.from("app_config").select("value_num").eq("key", "cotacao_usd_brl").maybeSingle(),
      ]);
      if (tarifasRes.error) throw new Error(tarifasRes.error.message);
      const tarifas = (tarifasRes.data ?? []).map((t) => ({
        ...t,
        preco_unitario: Number(t.preco_unitario),
      })) as TarifaRow[];
      return { tarifas, cotacao: Number(cotacaoRes.data?.value_num ?? 1) };
    },
  });
}

const selectEventos = "id, job_id, profile_id, etapa, modelo, quantidade, unidade, metadados, created_at";

/** Custo de todos os jobs do perfil ativo, indexado por job. */
export function useJobCustos(profileId: string | null) {
  const { data: precos } = useTarifas();
  return useQuery({
    queryKey: ["custo-jobs", profileId, precos?.cotacao],
    enabled: !!profileId && !!precos,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumo_eventos")
        .select(selectEventos)
        .eq("profile_id", profileId!)
        .not("job_id", "is", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const eventos = (data ?? []) as unknown as ConsumoEventoRow[];
      const porJob = new Map<string, ConsumoEventoRow[]>();
      for (const e of eventos) {
        const list = porJob.get(e.job_id!) ?? [];
        list.push(e);
        porJob.set(e.job_id!, list);
      }
      const result = new Map<string, CustoJob>();
      for (const [jobId, list] of porJob) {
        result.set(jobId, computeJobCusto(list, precos!.tarifas, precos!.cotacao));
      }
      return result;
    },
  });
}

export type BuscaCusto = {
  id: string;
  termo: string;
  linhas: number;
  created_at: string;
  valorBrl: number;
  semTarifa: boolean;
};

/** Buscas recentes do perfil, com o custo de cada chamada. */
export function useBuscaCustos(profileId: string | null, limit = 12) {
  const { data: precos } = useTarifas();
  return useQuery({
    queryKey: ["custo-buscas", profileId, limit, precos?.cotacao],
    enabled: !!profileId && !!precos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumo_eventos")
        .select(selectEventos)
        .eq("profile_id", profileId!)
        .eq("etapa", "busca_kalodata")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const eventos = (data ?? []) as unknown as ConsumoEventoRow[];
      return eventos.map((evento) => {
        const custo = computeEventoCusto(evento, precos!.tarifas, precos!.cotacao);
        const meta = evento.metadados ?? {};
        return {
          id: evento.id,
          termo: typeof meta["termo"] === "string" && meta["termo"] ? (meta["termo"] as string) : "sem termo",
          linhas: num(meta["linhas"]) ?? evento.quantidade ?? 0,
          created_at: evento.created_at,
          valorBrl: custo.valorBrl,
          semTarifa: custo.semTarifa,
        } satisfies BuscaCusto;
      });
    },
  });
}
