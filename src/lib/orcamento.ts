/**
 * Guardrails de custo: gasto do mês, teto de orçamento (global e por perfil)
 * e estimativa da etapa cara (Veo + montagem) antes de disparar a geração.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeEventoCusto, findTarifa, useTarifas, type ConsumoEventoRow } from "./custo";

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

const firstDayOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

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

/** Gasto do mês corrente (perfil ativo e geral) confrontado com os tetos. */
export function useGastoMes(profileId: string | null): GastoMes | null {
  const { data: precos } = useTarifas();
  const { data: config } = useAppConfig();

  const { data: eventos } = useQuery({
    queryKey: ["custo-mes"],
    enabled: !!precos,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumo_eventos")
        .select("id, job_id, profile_id, etapa, modelo, quantidade, unidade, metadados, created_at")
        .gte("created_at", firstDayOfMonth());
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConsumoEventoRow[];
    },
  });

  if (!precos || !eventos || !config) return null;

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

  const usos = [
    tetoGlobal ? globalBrl / tetoGlobal : 0,
    tetoPerfil ? perfilBrl / tetoPerfil : 0,
  ];
  const uso = Math.max(...usos);

  return {
    globalBrl,
    perfilBrl,
    tetoGlobal,
    tetoPerfil,
    uso,
    alerta: uso >= 0.8 && uso < 1,
    bloqueado: uso >= 1,
    bloqueiaTudo,
  };
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
