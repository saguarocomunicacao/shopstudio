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

type Plan = {
  id: string;
  name: string;
  key_source: "shop_studio" | "byok";
  billing_model: "gratuito" | "por_video" | "mensal";
  price_cents: number;
  fallback_cap_cents: number;
  is_active: boolean;
};

type Tenant = { id: string; name: string; plan_id: string | null };

const KEY_SOURCE: { value: Plan["key_source"]; label: string }[] = [
  { value: "shop_studio", label: "Chaves do Shop Studio" },
  { value: "byok", label: "Chaves do próprio cliente" },
];
const BILLING: { value: Plan["billing_model"]; label: string }[] = [
  { value: "gratuito", label: "Sem cobrança" },
  { value: "por_video", label: "Por vídeo" },
  { value: "mensal", label: "Mensalidade" },
];

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toCents = (v: string) => Math.max(0, Math.round(Number(v.replace(",", ".")) * 100) || 0);
const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível salvar.");

function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, key_source, billing_model, price_cents, fallback_cap_cents, is_active")
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as Plan[];
    },
  });
}

export function PlansCard() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useStudio();
  const { data: plans = [], isLoading } = usePlans();
  const [novo, setNovo] = useState<{ name: string; key_source: Plan["key_source"]; billing_model: Plan["billing_model"]; price: string; cap: string } | null>(null);

  const salvar = useMutation({
    mutationFn: async (row: Partial<Plan> & { id?: string }) => {
      if (row.id) {
        const { id, ...patch } = row;
        const { error } = await supabase.from("plans").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("plans").insert(row as never);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Plano salvo.");
      setNovo(null);
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
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
          <p className="mt-1 text-sm text-muted-foreground">Condições comerciais oferecidas aos clientes. Nesta fase não há cobrança real.</p>
        </div>
        <Button variant="secondary" onClick={() => setNovo({ name: "", key_source: "shop_studio", billing_model: "gratuito", price: "0", cap: "0" })}>
          <Plus className="size-4" />Novo plano
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
      ) : (
        <div className="mt-5 divide-y divide-border">
          {plans.map((plan) => (
            <div key={plan.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] md:items-end">
              <label className="grid gap-1.5 text-xs font-semibold">
                Nome
                <Input defaultValue={plan.name} onBlur={(e) => e.target.value !== plan.name && salvar.mutate({ id: plan.id, name: e.target.value })} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">
                Chaves
                <Select value={plan.key_source} onValueChange={(v) => salvar.mutate({ id: plan.id, key_source: v as Plan["key_source"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KEY_SOURCE.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">
                Cobrança
                <Select value={plan.billing_model} onValueChange={(v) => salvar.mutate({ id: plan.id, billing_model: v as Plan["billing_model"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BILLING.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">
                Preço (R$)
                <Input defaultValue={(plan.price_cents / 100).toString()} onBlur={(e) => toCents(e.target.value) !== plan.price_cents && salvar.mutate({ id: plan.id, price_cents: toCents(e.target.value) })} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">
                Teto de apoio (R$)
                <Input defaultValue={(plan.fallback_cap_cents / 100).toString()} onBlur={(e) => toCents(e.target.value) !== plan.fallback_cap_cents && salvar.mutate({ id: plan.id, fallback_cap_cents: toCents(e.target.value) })} />
              </label>
              <div className="flex items-center gap-3">
                <Switch checked={plan.is_active} onCheckedChange={(v) => salvar.mutate({ id: plan.id, is_active: v })} aria-label="Plano ativo" />
                <Button variant="ghost" size="icon" onClick={() => remover.mutate(plan.id)} aria-label="Remover plano"><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
          {!plans.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</p>}
        </div>
      )}

      {novo && (
        <div className="mt-5 grid gap-3 rounded-xl bg-secondary p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-semibold">Nome<Input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} placeholder="Nome do plano" /></label>
          <label className="grid gap-1.5 text-xs font-semibold">Chaves
            <Select value={novo.key_source} onValueChange={(v) => setNovo({ ...novo, key_source: v as Plan["key_source"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KEY_SOURCE.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">Cobrança
            <Select value={novo.billing_model} onValueChange={(v) => setNovo({ ...novo, billing_model: v as Plan["billing_model"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BILLING.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">Preço (R$)<Input value={novo.price} onChange={(e) => setNovo({ ...novo, price: e.target.value })} /></label>
          <label className="grid gap-1.5 text-xs font-semibold">Teto de apoio (R$)<Input value={novo.cap} onChange={(e) => setNovo({ ...novo, cap: e.target.value })} /></label>
          <div className="flex gap-2">
            <Button
              disabled={!novo.name.trim() || salvar.isPending}
              onClick={() => salvar.mutate({ name: novo.name.trim(), key_source: novo.key_source, billing_model: novo.billing_model, price_cents: toCents(novo.price), fallback_cap_cents: toCents(novo.cap), is_active: true })}
            >
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />}Criar
            </Button>
            <Button variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
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
                    <SelectItem key={p.id} value={p.id}>{p.name} · {p.billing_model === "gratuito" ? "sem cobrança" : brl(p.price_cents)}</SelectItem>
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
