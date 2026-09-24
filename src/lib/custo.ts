/**
 * Cálculo de custo real: cruza os eventos de consumo (append-only) com a
 * tarifa vigente na data de cada evento e converte tudo para reais.
 * O módulo é puro (sem dependência de servidor) para poder ser reaproveitado
 * em qualquer tela ou rotina de backend.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeEventoCusto,
  type ConsumoEventoRow,
  type CreditoTaxaRow,
  type EtapaConsumo,
  type TarifaRow,
  type UnidadeTarifa,
} from "./custo-core";

export {
  ACAO_LABELS,
  acaoDoEvento,
  brl,
  computeEventoCusto,
  computeCreditoEvento,
  findCreditoTaxa,
  findTarifa,
  precoFerramentaBrl,
  CREDITO_UNIDADE,
} from "./custo-core";
export type {
  BillableAction,
  CreditoEvento,
  CreditoTaxaRow,
  ConsumoEventoRow,
  CustoEvento,
  EtapaConsumo,
  TarifaRow,
  UnidadeTarifa,
} from "./custo-core";

export const ETAPA_LABELS: Record<EtapaConsumo, string> = {
  cena_gemini: "Cenas (imagens)",
  animacao_veo: "Animação",
  montagem_json2video: "Montagem",
  busca_kalodata: "Busca de produto",
  roteiro_texto: "Roteiro",
  narracao_elevenlabs: "Narração (ElevenLabs)",
  transcricao_audio: "Ditado por voz",
  analise_video: "Análise de vídeo",
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

export { computeJobCusto } from "./custo-calculo";
export type { CustoEtapa, CustoJob } from "./custo-calculo";
import { computeJobCusto, type CustoJob } from "./custo-calculo";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Tarifas ativas + cotação do dólar configurada. */
export function useTarifas() {
  return useQuery({
    queryKey: ["custo-tarifas"],
    staleTime: 60_000,
    queryFn: async () => {
      const [tarifasRes, taxasRes, cotacaoRes] = await Promise.all([
        supabase.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
        supabase
          .from("credito_taxas")
          .select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
        supabase.from("app_config").select("value_num").eq("key", "cotacao_usd_brl").maybeSingle(),
      ]);
      if (tarifasRes.error) throw new Error(tarifasRes.error.message);
      const tarifas = (tarifasRes.data ?? []).map((t) => ({
        ...t,
        preco_unitario: Number(t.preco_unitario),
      })) as TarifaRow[];
      const taxas = ((taxasRes.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
        ...t,
        credito_por_unidade: Number(t["credito_por_unidade"]),
      })) as unknown as CreditoTaxaRow[];
      return { tarifas, taxas, cotacao: Number(cotacaoRes.data?.value_num ?? 1) };
    },
  });
}

const selectEventos =
  "id, job_id, profile_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, credito_consumido, credito_unidade, credito_origem";

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
        result.set(jobId, computeJobCusto(list, precos!.tarifas, precos!.cotacao, precos!.taxas));
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
        const custo = computeEventoCusto(evento, precos!.tarifas, precos!.cotacao, 0, precos!.taxas);
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
