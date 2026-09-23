/**
 * Leitura da carteira de saldo (quantidades por ação) no navegador.
 * A RLS garante que cada cliente só enxerga a própria carteira.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BillableAction } from "./custo-core";

export type SaldoRow = { action_type: BillableAction; saldo: number };
export type MovimentoRow = {
  id: string;
  action_type: BillableAction;
  tipo: "credito" | "debito";
  quantidade: number;
  saldo_apos: number;
  price_cents: number;
  descricao: string | null;
  created_at: string;
};
export type PacoteRow = { action_type: BillableAction; package_qty: number; package_price_cents: number };

/** Saldo atual por ação do cliente. */
export function useSaldos(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["saldos", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_action_balances")
        .select("action_type, saldo")
        .eq("tenant_id", tenantId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as SaldoRow[];
    },
  });
}

/** Histórico de compras e consumos. */
export function useMovimentos(tenantId: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: ["saldo-movimentos", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_movements")
        .select("id, action_type, tipo, quantidade, saldo_apos, price_cents, descricao, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as MovimentoRow[];
    },
  });
}

/** Pacotes do plano vigente, para saber o que é ilimitado (preço zero). */
export function usePacotesDoPlano(planId: string | null | undefined) {
  return useQuery({
    queryKey: ["plan-packages", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_action_prices")
        .select("action_type, package_qty, package_price_cents")
        .eq("plan_id", planId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as PacoteRow[];
    },
  });
}

/** Ação gratuita no plano (ou sem pacote) = uso ilimitado. */
export const ehIlimitado = (pacotes: PacoteRow[] | undefined, action: BillableAction) => {
  const pacote = (pacotes ?? []).find((p) => p.action_type === action);
  return !pacote || pacote.package_price_cents <= 0;
};
