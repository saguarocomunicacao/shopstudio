import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStudio } from "./studio-context";
import { actionError } from "@/lib/api-keys";
import { ACAO_LABELS, type BillableAction } from "@/lib/custo-core";

type Plan = {
  id: string;
  name: string;
  key_source: "shop_studio" | "byok";
  is_active: boolean;
};

type ActionPrice = {
  plan_id: string;
  action_type: BillableAction;
  included_qty: number;
  unit_price_cents: number;
  overage_price_cents: number;
};

type Tenant = { id: string; name: string; plan_id: string | null };

const KEY_SOURCE: { value: Plan["key_source"]; label: string }[] = [
  { value: "shop_studio", label: "Chaves do Shop Studio" },
  { value: "byok", label: "Chaves do próprio cliente" },
];

const ACOES: BillableAction[] = [
  "roteiro",
  "descricao_produto",
  "transcricao",
  "cena",
  "video",
  "montagem",
  "narracao",
  "clonagem_voz",
  "busca_produto",
  "atualizacao_produto",
  "videos_campeoes",
  "atualizacao_categorias",
];

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toCents = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};
const errMessage = (e: unknown) => actionError(e, "Não foi possível salvar.");

/** Campo monetário com máscara de R$ (digita em centavos). */
function MoneyInput({ value, onCommit }: { value: number; onCommit: (cents: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? brl(value);
  return (
    <Input
      value={shown}
      inputMode="numeric"
      onChange={(e) => setDraft(brl(toCents(e.target.value)))}
      onFocus={() => setDraft(brl(value))}
      onBlur={() => {
        const cents = toCents(shown);
        setDraft(null);
        if (cents !== value) onCommit(cents);
      }}
    />
  );
}

function QtyInput({ value, onCommit }: { value: number; onCommit: (qty: number) => void }) {
  return (
    <Input
      type="number"
      min={0}
      defaultValue={value}
      onBlur={(e) => {
        const n = Math.max(0, Math.round(Number(e.target.value) || 0));
        if (n !== value) onCommit(n);
      }}
    />
  );
}

export function PlansCard() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useStudio();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, key_source, is_active")
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as Plan[];
    },
  });

  const { data: prices = [] } = useQuery({
    queryKey: ["plan-action-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_action_prices")
        .select("plan_id, action_type, included_qty, unit_price_cents, overage_price_cents");
      if (error) throw new Error(error.message);
      return (data ?? []) as ActionPrice[];
    },
  });

  const [novoNome, setNovoNome] = useState<string | null>(null);

  const salvarPlano = useMutation({
    mutationFn: async (row: Partial<Plan> & { id?: string }) => {
      if (row.id) {
        const { id, ...patch } = row;
        const { error } = await supabase.from("plans").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
        return;
      }
      const { data, error } = await supabase
        .from("plans")
        .insert(row as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const novo = data as { id: string };
      const { error: priceError } = await supabase.from("plan_action_prices").insert(
        ACOES.map((action_type) => ({
          plan_id: novo.id,
          action_type,
          included_qty: 0,
          unit_price_cents: 0,
          overage_price_cents: 0,
        })) as never,
      );
      if (priceError) throw new Error(priceError.message);
    },
    onSuccess: () => {
      toast.success("Plano salvo.");
      setNovoNome(null);
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plan-action-prices"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const salvarPreco = useMutation({
    mutationFn: async (row: { plan_id: string; action_type: BillableAction } & Partial<ActionPrice>) => {
      const { plan_id, action_type, ...patch } = row;
      const { error } = await supabase
        .from("plan_action_prices")
        .update(patch)
        .eq("plan_id", plan_id)
        .eq("action_type", action_type);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-action-prices"] }),
    onError: (e) => toast.error(errMessage(e)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano removido.");
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  if (!isSuperAdmin) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Só o super administrador gerencia planos.</div>;
  }

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold">Planos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cobrança por item: cada ação tem uma quantidade incluída por mês, um preço unitário e um preço de excedente. Não há mensalidade.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setNovoNome("")}>
          <Plus className="size-4" />Novo plano
        </Button>
      </div>

      {novoNome !== null && (
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl bg-secondary p-4">
          <label className="grid flex-1 gap-1.5 text-xs font-semibold">
            Nome do plano
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do plano" />
          </label>
          <Button
            disabled={!novoNome.trim() || salvarPlano.isPending}
            onClick={() => salvarPlano.mutate({ name: novoNome.trim(), key_source: "shop_studio", is_active: true })}
          >
            {salvarPlano.isPending && <Loader2 className="size-4 animate-spin" />}Criar
          </Button>
          <Button variant="ghost" onClick={() => setNovoNome(null)}>Cancelar</Button>
        </div>
      )}

      {isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
      ) : (
        <div className="mt-5 space-y-6">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-border p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
                <label className="grid gap-1.5 text-xs font-semibold">
                  Nome
                  <Input defaultValue={plan.name} onBlur={(e) => e.target.value !== plan.name && salvarPlano.mutate({ id: plan.id, name: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold">
                  Chaves
                  <Select value={plan.key_source} onValueChange={(v) => salvarPlano.mutate({ id: plan.id, key_source: v as Plan["key_source"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{KEY_SOURCE.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <div className="flex items-center gap-3">
                  <Switch checked={plan.is_active} onCheckedChange={(v) => salvarPlano.mutate({ id: plan.id, is_active: v })} aria-label="Plano ativo" />
                  <Button variant="ghost" size="icon" onClick={() => remover.mutate(plan.id)} aria-label="Remover plano"><Trash2 className="size-4" /></Button>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="pb-2 pr-3">Ação</th>
                      <th className="pb-2 pr-3">Quantidade incluída (por mês)</th>
                      <th className="pb-2 pr-3">Preço unitário</th>
                      <th className="pb-2">Preço excedente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ACOES.map((acao) => {
                      const row = prices.find((p) => p.plan_id === plan.id && p.action_type === acao);
                      const base = row ?? { included_qty: 0, unit_price_cents: 0, overage_price_cents: 0 };
                      return (
                        <tr key={acao}>
                          <td className="py-2 pr-3 font-medium">{ACAO_LABELS[acao]}</td>
                          <td className="py-2 pr-3">
                            <QtyInput value={base.included_qty} onCommit={(included_qty) => salvarPreco.mutate({ plan_id: plan.id, action_type: acao, included_qty })} />
                          </td>
                          <td className="py-2 pr-3">
                            <MoneyInput value={base.unit_price_cents} onCommit={(unit_price_cents) => salvarPreco.mutate({ plan_id: plan.id, action_type: acao, unit_price_cents })} />
                          </td>
                          <td className="py-2">
                            <MoneyInput value={base.overage_price_cents} onCommit={(overage_price_cents) => salvarPreco.mutate({ plan_id: plan.id, action_type: acao, overage_price_cents })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Quantidade incluída 0 cobra o preço unitário desde o primeiro uso. Com quantidade incluída N, os N primeiros usos do mês não custam nada e os seguintes usam o preço de excedente.
              </p>
            </div>
          ))}
          {!plans.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</p>}
        </div>
      )}

      <TenantPlans plans={plans} />
    </section>
  );
}

function TenantPlans({ plans }: { plans: Plan[] }) {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name, plan_id").order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as Tenant[];
    },
  });

  const atribuir = useMutation({
    mutationFn: async ({ id, plan_id }: { id: string; plan_id: string }) => {
      const { error } = await supabase.from("tenants").update({ plan_id }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano atribuído.");
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <div className="mt-8 border-t pt-6">
      <h3 className="font-bold">Clientes e planos</h3>
      <p className="mt-1 text-sm text-muted-foreground">Cada conta de cliente usa um plano. Só o super administrador altera.</p>
      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {tenants.map((t) => (
            <div key={t.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,320px)] sm:items-center">
              <p className="truncate text-sm font-semibold">{t.name}</p>
              <Select {...(t.plan_id ? { value: t.plan_id } : {})} onValueChange={(v) => atribuir.mutate({ id: t.id, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {!tenants.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>}
        </div>
      )}
    </div>
  );
}
