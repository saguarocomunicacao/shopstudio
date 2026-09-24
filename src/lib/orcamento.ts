/**
 * Guardrails de custo: gasto do mês, teto de orçamento (global e por perfil)
 * e estimativa da etapa cara (Veo + montagem) antes de disparar a geração.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeEventoCusto, findTarifa, useTarifas, type ConsumoEventoRow } from "./custo";

import { calcularGastoMes, CONFIG_KEYS, intervaloBrasilia, SELECT_EVENTOS_CUSTO, type AppConfigRow, type GastoMes } from "./custo-calculo";
export { CONFIG_KEYS, calcularGastoMes } from "./custo-calculo";
export type { AppConfigRow, GastoMes } from "./custo-calculo";

/** Todas as configurações numéricas do app (orçamento, saldos, cotação). */
export function useAppConfig() {
  return useQuery({
    queryKey: ["app-config-all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_config").select("key, value_num, value_text");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as AppConfigRow[];
      const map = new Map<string, AppConfigRow>();
      for (const row of rows) map.set(row.key, row);
      return map;
    },
  });
}


/** Gasto do mês corrente (perfil ativo e geral) confrontado com os tetos. */
export function useGastoMes(profileId: string | null): GastoMes | null {
  const { data: precos } = useTarifas();
  const { data: config } = useAppConfig();

  const { data: eventos } = useQuery({
    queryKey: ["custo-mes", intervaloBrasilia("mes").desde],
    enabled: !!precos,
    refetchInterval: 60_000,
    queryFn: async () => {
      const mes = intervaloBrasilia("mes");
      const { data, error } = await supabase
        .from("consumo_eventos")
        .select(SELECT_EVENTOS_CUSTO)
        .gte("created_at", mes.desde)
        .lte("created_at", mes.ate);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConsumoEventoRow[];
    },
  });

  if (!precos || !eventos || !config) return null;

  return calcularGastoMes(eventos, precos, config, profileId);
}

export type EstimativaVeo = {
  cenas: number;
  segundos: number;
  veoBrl: number;
  montagemBrl: number;
  totalBrl: number;
  semTarifa: boolean;
};

/** Estimativa de custo antes de disparar o Veo: cenas × duração × tarifa + montagem. */
export function useEstimativaVeo(profileId: string | null, cenas: number) {
  const { data: precos } = useTarifas();

  const { data: settings } = useQuery({
    queryKey: ["video-settings", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_video_settings")
        .select("veo_model, take_duration")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { veo_model: string | null; take_duration: number | null } | null;
    },
  });

  if (!precos || !cenas) return null;

  const hoje = new Date().toISOString();
  const duracao = settings?.take_duration ?? 8;
  const segundos = cenas * duracao;

  const modeloVeo = settings?.veo_model ?? "";
  const tarifaVeo =
    findTarifa(precos.tarifas, modeloVeo, "segundo_video", hoje) ??
    precos.tarifas.find((t) => t.ativo && t.tipo_unidade === "segundo_video") ??
    null;
  const tarifaMontagem =
    findTarifa(precos.tarifas, "json2video", "credito_montagem", hoje) ??
    precos.tarifas.find((t) => t.ativo && t.tipo_unidade === "credito_montagem") ??
    null;

  const emBrl = (valor: number, moeda: "USD" | "BRL") => (moeda === "USD" ? valor * precos.cotacao : valor);
  const veoBrl = tarifaVeo ? emBrl(segundos * Number(tarifaVeo.preco_unitario), tarifaVeo.moeda) : 0;
  // Montagem: ~1 crédito por segundo de vídeo montado.
  const montagemBrl = tarifaMontagem
    ? emBrl(segundos * Number(tarifaMontagem.preco_unitario), tarifaMontagem.moeda)
    : 0;

  return {
    cenas,
    segundos,
    veoBrl,
    montagemBrl,
    totalBrl: veoBrl + montagemBrl,
    semTarifa: !tarifaVeo || !tarifaMontagem,
  } satisfies EstimativaVeo;
}
