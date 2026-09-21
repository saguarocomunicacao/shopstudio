import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { actionError } from "@/lib/api-keys";
import { ACAO_LABELS, type BillableAction } from "@/lib/custo-core";
import { useStudio } from "./studio-context";

type Plan = { id: string; name: string; key_source: "shop_studio" | "byok"; is_active: boolean };
type ActionPrice = { plan_id: string; action_type: BillableAction; included_qty: number; unit_price_cents: number; overage_price_cents: number };
type Tenant = { id: string; plan_id: string | null };

export const PLAN_ACTIONS: BillableAction[] = [
  "roteiro", "descricao_produto", "transcricao", "cena", "video", "montagem",
  "narracao", "clonagem_voz", "busca_produto", "atualizacao_produto", "videos_campeoes", "atualizacao_categorias",
];

const KEY_SOURCE = [
  { value: "shop_studio", label: "Chaves do Shop Studio" },
  { value: "byok", label: "Chaves do próprio cliente" },
] as const;

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toCents = (value: string) => Number(value.replace(/\D/g, "")) || 0;
const errMessage = (error: unknown) => actionError(error, "Não foi possível salvar.");

function BackofficeOnly({ children }: { children: React.ReactNode }) {
  const { isBackoffice } = useStudio();
  if (!isBackoffice) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Você não tem acesso ao catálogo de planos.</div>;
  return children;
}

function usePlansData() {
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id, name, key_source, is_active").order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as Plan[];
    },
  });
  const prices = useQuery({
    queryKey: ["plan-action-prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_action_prices").select("plan_id, action_type, included_qty, unit_price_cents, overage_price_cents");
      if (error) throw new Error(error.message);
      return (data ?? []) as ActionPrice[];
    },
  });
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, plan_id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Tenant[];
    },
  });
  return { plans, prices, tenants };
}

export function PlansPage() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useStudio();
  const { plans, prices, tenants } = usePlansData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const updatePlan = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("plans").update({ is_active }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Plano atualizado."); qc.invalidateQueries({ queryKey: ["plans"] }); },
    onError: (error) => toast.error(errMessage(error)),
  });
  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setRemoveId(null); toast.success("Plano removido."); qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["tenants"] }); },
    onError: (error) => toast.error(errMessage(error)),
  });

  const loading = plans.isLoading || prices.isLoading || tenants.isLoading;
  return <BackofficeOnly><div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold uppercase text-primary">Backoffice</p><h1 className="text-2xl font-black sm:text-3xl">Planos</h1><p className="mt-2 text-sm text-muted-foreground">Catálogo de franquias e preços por ação. Não há mensalidade.</p></div>
      {isSuperAdmin && <Button asChild><Link to="/app/planos/$planId" params={{ planId: "novo" }}><Plus />Novo plano</Link></Button>}
    </div>
    <section className="panel overflow-hidden p-0">
      {loading ? <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando planos...</p> : <Table>
        <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"/><TableHead>Plano</TableHead><TableHead>Fonte de chave</TableHead><TableHead>Status</TableHead><TableHead>Empresas</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>{(plans.data ?? []).map((plan) => {
          const open = expanded === plan.id;
          const rows = (prices.data ?? []).filter((row) => row.plan_id === plan.id);
          const companies = (tenants.data ?? []).filter((tenant) => tenant.plan_id === plan.id).length;
          return <PlanRows key={plan.id} plan={plan} rows={rows} companies={companies} open={open} canEdit={isSuperAdmin} onToggle={() => setExpanded(open ? null : plan.id)} onActive={(is_active) => updatePlan.mutate({ id: plan.id, is_active })} onRemove={() => setRemoveId(plan.id)} />;
        })}</TableBody>
      </Table>}
      {!loading && !(plans.data ?? []).length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</p>}
    </section>
    <AlertDialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover este plano?</AlertDialogTitle><AlertDialogDescription>As empresas vinculadas ficarão sem plano. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removeId && removePlan.mutate(removeId)}>Remover plano</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></BackofficeOnly>;
}

function PlanRows({ plan, rows, companies, open, canEdit, onToggle, onActive, onRemove }: { plan: Plan; rows: ActionPrice[]; companies: number; open: boolean; canEdit: boolean; onToggle: () => void; onActive: (value: boolean) => void; onRemove: () => void }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <>
    <TableRow className="cursor-pointer" onClick={onToggle}>
      <TableCell><Icon className="size-4 text-muted-foreground" /></TableCell>
      <TableCell className="font-semibold">{plan.name}</TableCell>
      <TableCell>{plan.key_source === "byok" ? "Próprio cliente" : "Shop Studio"}</TableCell>
      <TableCell><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${plan.is_active ? "status-lime" : "status-neutral"}`}>{plan.is_active ? "Ativo" : "Inativo"}</span></TableCell>
      <TableCell>{companies}</TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1">
        {canEdit && <><Button asChild variant="ghost" size="sm"><Link to="/app/planos/$planId" params={{ planId: plan.id }}><Pencil />Editar</Link></Button><Button variant="ghost" size="icon" aria-label={plan.is_active ? "Desativar plano" : "Ativar plano"} onClick={() => onActive(!plan.is_active)}><Power /></Button><Button variant="ghost" size="icon" aria-label="Remover plano" onClick={onRemove}><Trash2 /></Button></>}
      </div></TableCell>
    </TableRow>
    {open && <TableRow className="bg-secondary/40 hover:bg-secondary/40"><TableCell/><TableCell colSpan={5}><div className="grid gap-3 py-3 sm:grid-cols-3"><Summary label="Ações configuradas" value={`${rows.filter((row) => row.included_qty || row.unit_price_cents || row.overage_price_cents).length} de 12`} /><Summary label="Franquia mensal" value={`${rows.reduce((sum, row) => sum + row.included_qty, 0)} itens`} /><Summary label="Preço unitário máximo" value={brl(Math.max(0, ...rows.map((row) => row.unit_price_cents)))} /></div></TableCell></TableRow>}
  </>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }

export function PlanDetailPage({ planId }: { planId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isBackoffice, isSuperAdmin } = useStudio();
  const editing = !!planId;
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ["plan-detail", planId], enabled: editing,
    queryFn: async () => { const { data, error } = await supabase.from("plans").select("id, name, key_source, is_active").eq("id", planId ?? "").single(); if (error) throw new Error(error.message); return data as Plan; },
  });
  const { data: savedPrices = [], isLoading: priceLoading } = useQuery({
    queryKey: ["plan-action-prices", planId], enabled: editing,
    queryFn: async () => { const { data, error } = await supabase.from("plan_action_prices").select("plan_id, action_type, included_qty, unit_price_cents, overage_price_cents").eq("plan_id", planId ?? ""); if (error) throw new Error(error.message); return (data ?? []) as ActionPrice[]; },
  });
  const [name, setName] = useState("");
  const [keySource, setKeySource] = useState<Plan["key_source"]>("shop_studio");
  const [active, setActive] = useState(true);
  const [draft, setDraft] = useState<Record<BillableAction, Omit<ActionPrice, "plan_id" | "action_type">>>(() => emptyPrices());
  const hydrated = useMemo(() => plan ? `${plan.id}:${savedPrices.length}` : "", [plan, savedPrices.length]);
  const [lastHydrated, setLastHydrated] = useState("");
  if (plan && hydrated !== lastHydrated) {
    setLastHydrated(hydrated); setName(plan.name); setKeySource(plan.key_source); setActive(plan.is_active);
    setDraft(Object.fromEntries(PLAN_ACTIONS.map((action) => { const row = savedPrices.find((price) => price.action_type === action); return [action, { included_qty: row?.included_qty ?? 0, unit_price_cents: row?.unit_price_cents ?? 0, overage_price_cents: row?.overage_price_cents ?? 0 }]; })) as Record<BillableAction, Omit<ActionPrice, "plan_id" | "action_type">>);
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do plano.");
      let id = planId;
      if (id) { const { error } = await supabase.from("plans").update({ name: name.trim(), key_source: keySource, is_active: active }).eq("id", id); if (error) throw new Error(error.message); }
      else { const { data, error } = await supabase.from("plans").insert({ name: name.trim(), key_source: keySource, is_active: active } as never).select("id").single(); if (error) throw new Error(error.message); id = (data as { id: string }).id; }
      const rows = PLAN_ACTIONS.map((action_type) => ({ plan_id: id as string, action_type, ...draft[action_type] }));
      const { error } = await supabase.from("plan_action_prices").upsert(rows as never, { onConflict: "plan_id,action_type" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(editing ? "Plano atualizado." : "Plano criado."); qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["plan-action-prices"] }); navigate({ to: "/app/planos" }); },
    onError: (error) => toast.error(errMessage(error)),
  });
  if (!isBackoffice) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Você não tem acesso a esta página.</div>;
  if (!isSuperAdmin) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Só o super administrador altera planos.</div>;
  if (editing && (planLoading || priceLoading)) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando plano...</p>;
  return <div className="mx-auto max-w-6xl">
    <div className="mb-6"><p className="mb-1 text-xs font-bold uppercase text-primary">Planos</p><h1 className="text-2xl font-black sm:text-3xl">{editing ? "Editar plano" : "Novo plano"}</h1></div>
    <section className="panel"><div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)_auto] md:items-end">
      <label className="grid gap-1.5 text-xs font-semibold">Nome do plano<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Fonte de chave<Select value={keySource} onValueChange={(value) => setKeySource(value as Plan["key_source"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KEY_SOURCE.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
      <label className="flex h-10 items-center gap-2 text-sm font-semibold"><Switch checked={active} onCheckedChange={setActive} />Ativo</label>
    </div></section>
    <section className="panel mt-5"><div className="mb-5"><h2 className="font-bold">Preços por ação</h2><p className="mt-1 text-sm text-muted-foreground">A quantidade incluída é renovada a cada mês. Zero cobra o preço unitário desde o primeiro uso.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Ação</th><th className="p-2">Quantidade incluída por mês</th><th className="p-2">Preço unitário</th><th className="p-2">Preço excedente</th></tr></thead><tbody className="divide-y">{PLAN_ACTIONS.map((action) => <tr key={action}><td className="p-2 font-medium">{ACAO_LABELS[action]}</td><td className="p-2"><Input type="number" min={0} value={draft[action].included_qty} onChange={(event) => setDraftValue(setDraft, draft, action, "included_qty", Math.max(0, Math.round(Number(event.target.value) || 0)))} /></td><td className="p-2"><MoneyInput value={draft[action].unit_price_cents} onChange={(value) => setDraftValue(setDraft, draft, action, "unit_price_cents", value)} /></td><td className="p-2"><MoneyInput value={draft[action].overage_price_cents} onChange={(value) => setDraftValue(setDraft, draft, action, "overage_price_cents", value)} /></td></tr>)}</tbody></table></div>
    </section>
    <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => navigate({ to: "/app/planos" })}>Cancelar</Button><Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="size-4 animate-spin" />}Salvar plano</Button></div>
  </div>;
}

function emptyPrices() { return Object.fromEntries(PLAN_ACTIONS.map((action) => [action, { included_qty: 0, unit_price_cents: 0, overage_price_cents: 0 }])) as Record<BillableAction, Omit<ActionPrice, "plan_id" | "action_type">>; }
function setDraftValue(setter: React.Dispatch<React.SetStateAction<Record<BillableAction, Omit<ActionPrice, "plan_id" | "action_type">>>>, current: Record<BillableAction, Omit<ActionPrice, "plan_id" | "action_type">>, action: BillableAction, key: "included_qty" | "unit_price_cents" | "overage_price_cents", value: number) { setter({ ...current, [action]: { ...current[action], [key]: value } }); }
function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <Input inputMode="numeric" value={brl(value)} onChange={(event) => onChange(toCents(event.target.value))} />; }

/** Compatibilidade temporária para imports antigos. */
export const PlansCard = PlansPage;