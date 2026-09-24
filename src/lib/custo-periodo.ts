/**
 * Agregações de custo por período usadas na tela "Custos".
 * Só lê os eventos de consumo já gravados e aplica a tarifa vigente
 * (a lógica de tarifa/conversão continua em custo.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTarifas, type ConsumoEventoRow, type UnidadeTarifa } from "./custo";

import { agregarPeriodo, SELECT_EVENTOS_CUSTO } from "./custo-calculo";
export {
  agregarPeriodo,
  consumoLabel,
  etapaVisualDe,
  ETAPA_VISUAL_LABELS,
  ETAPA_VISUAL_ORDEM,
} from "./custo-calculo";
export type { CustoPeriodo, EtapaVisual, LinhaBusca, LinhaEtapa, LinhaJob } from "./custo-calculo";
import type { EtapaVisual } from "./custo-calculo";

const selectEventos = SELECT_EVENTOS_CUSTO;

/** Eventos de consumo do intervalo; profileId nulo traz todos os perfis acessíveis. */
export function useEventosPeriodo(
  desde: string,
  ate: string,
  profileIds: string[] | null,
  tenantId?: string | null,
) {
  const chavePerfis = profileIds ? [...profileIds].sort().join(",") : "todos";
  return useQuery({
    queryKey: ["custo-periodo", desde, ate, chavePerfis, tenantId ?? "todos-tenants"],
    staleTime: 30_000,
    queryFn: async () => {
      if (profileIds && profileIds.length === 0) return [] as ConsumoEventoRow[];
      let query = supabase
        .from("consumo_eventos")
        .select(selectEventos)
        .gte("created_at", desde)
        .lte("created_at", ate)
        .order("created_at", { ascending: true });
      if (tenantId) query = query.eq("tenant_id", tenantId);
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
  tenantId?: string | null,
) {
  const precosQuery = useTarifas();
  const eventosQuery = useEventosPeriodo(desde, ate, profileIds, tenantId);
  const precos = precosQuery.data;
  const eventos = eventosQuery.data;
  const chaveEtapas = [...etapas].sort().join(",");
  const pronto = !!precos && !!eventos;
  return {
    isLoading: eventosQuery.isLoading || precosQuery.isLoading,
    isError: eventosQuery.isError || precosQuery.isError,
    data: pronto ? agregarPeriodo(eventos!, precos!.tarifas, precos!.cotacao, etapas, precos!.taxas) : null,
    chaveEtapas,
  };
}

export type { UnidadeTarifa };
