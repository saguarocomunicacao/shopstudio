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
type ActionPrice = { plan_id: string; action_type: BillableAction; package_qty: number; package_price_cents: number };
type Pacote = { qty: number; price: number };
type Tenant = { id: string; name: string; plan_id: string | null };

export const PLAN_ACTIONS: BillableAction[] = [
  "roteiro", "descricao_produto", "transcricao", "cena", "video", "montagem",
  "narracao", "clonagem_voz", "busca_produto", "atualizacao_produto", "videos_campeoes", "atualizacao_categorias", "analise_video",
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
      const { data, error } = await supabase.from("plan_action_prices").select("plan_id, action_type, package_qty, package_price_cents");
      if (error) throw new Error(error.message);
      return (data ?? []) as ActionPrice[];
    },
  });
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name, plan_id").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Tenant[];
    },
  });
  return { plans, prices, tenants };
}

export function PlansPage() {
  const qc = useQueryClient();
  const { isBackoffice } = useStudio();
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
  const failed = plans.isError || prices.isError || tenants.isError;
  return <BackofficeOnly><div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="page-title">Planos</h1><p className="mt-2 text-sm text-muted-foreground">Cada ação é vendida em pacote: uma quantidade por um preço. As quantidades compradas não expiram. Pacote com preço zero significa uso ilimitado.</p></div>
      {isBackoffice && <Button asChild><Link to="/app/planos/$planId" params={{ planId: "novo" }}><Plus />Novo plano</Link></Button>}
    </div>
    <section className="panel overflow-hidden p-0">
      {loading ? <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando planos...</p> : failed ? <p className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar os planos. Tente novamente.</p> : <Table>
        <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"/><TableHead>Plano</TableHead><TableHead>Fonte de chave</TableHead><TableHead>Status</TableHead><TableHead>Empresas</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>{(plans.data ?? []).map((plan) => {
          const open = expanded === plan.id;
          const rows = (prices.data ?? []).filter((row) => row.plan_id === plan.id);
          const companies = (tenants.data ?? []).filter((tenant) => tenant.plan_id === plan.id).length;
          return <PlanRows key={plan.id} plan={plan} rows={rows} companies={companies} open={open} canEdit={isBackoffice} onToggle={() => setExpanded(open ? null : plan.id)} onActive={(is_active) => updatePlan.mutate({ id: plan.id, is_active })} onRemove={() => setRemoveId(plan.id)} />;
        })}</TableBody>
      </Table>}
      {!loading && !failed && !(plans.data ?? []).length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</p>}
    </section>
    <CreditPackageCard tenants={tenants.data ?? []} />
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
      <TableCell><span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${plan.is_active ? "status-lime" : "status-neutral"}`}>{plan.is_active ? "Ativo" : "Inativo"}</span></TableCell>
      <TableCell>{companies}</TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1">
        {canEdit && <><Button asChild variant="ghost" size="sm"><Link to="/app/planos/$planId" params={{ planId: plan.id }}><Pencil />Editar</Link></Button><Button variant="ghost" size="icon" aria-label={plan.is_active ? "Desativar plano" : "Ativar plano"} onClick={() => onActive(!plan.is_active)}><Power /></Button><Button variant="ghost" size="icon" aria-label="Remover plano" onClick={onRemove}><Trash2 /></Button></>}
      </div></TableCell>
    </TableRow>
    {open && <TableRow className="bg-secondary/40 hover:bg-secondary/40"><TableCell/><TableCell colSpan={5}><div className="grid gap-3 py-3 sm:grid-cols-2"><Summary label="Ações com pacote pago" value={`${rows.filter((row) => row.package_price_cents > 0).length} de 12`} /><Summary label="Ações ilimitadas" value={`${12 - rows.filter((row) => row.package_price_cents > 0).length} de 12`} /></div></TableCell></TableRow>}
  </>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }

export function PlanDetailPage({ planId }: { planId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isBackoffice } = useStudio();
  const editing = !!planId;
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ["plan-detail", planId], enabled: editing,
    queryFn: async () => { const { data, error } = await supabase.from("plans").select("id, name, key_source, is_active").eq("id", planId ?? "").single(); if (error) throw new Error(error.message); return data as Plan; },
  });
  const { data: savedPrices = [], isLoading: priceLoading } = useQuery({
    queryKey: ["plan-action-prices", planId], enabled: editing,
    queryFn: async () => { const { data, error } = await supabase.from("plan_action_prices").select("plan_id, action_type, package_qty, package_price_cents").eq("plan_id", planId ?? ""); if (error) throw new Error(error.message); return (data ?? []) as ActionPrice[]; },
  });
  const [name, setName] = useState("");
  const [keySource, setKeySource] = useState<Plan["key_source"]>("shop_studio");
  const [active, setActive] = useState(true);
  const [draft, setDraft] = useState<Record<BillableAction, Pacote>>(() => emptyPrices());
  const hydrated = useMemo(() => plan ? `${plan.id}:${savedPrices.length}` : "", [plan, savedPrices.length]);
  const [lastHydrated, setLastHydrated] = useState("");
  if (plan && hydrated !== lastHydrated) {
    setLastHydrated(hydrated); setName(plan.name); setKeySource(plan.key_source); setActive(plan.is_active);
    setDraft(Object.fromEntries(PLAN_ACTIONS.map((action) => { const row = savedPrices.find((price) => price.action_type === action); return [action, { qty: row?.package_qty ?? 1, price: row?.package_price_cents ?? 0 }]; })) as Record<BillableAction, Pacote>);
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do plano.");
      let id = planId;
      if (id) { const { error } = await supabase.from("plans").update({ name: name.trim(), key_source: keySource, is_active: active }).eq("id", id); if (error) throw new Error(error.message); }
      else { const { data, error } = await supabase.from("plans").insert({ name: name.trim(), key_source: keySource, is_active: active } as never).select("id").single(); if (error) throw new Error(error.message); id = (data as { id: string }).id; }
      const rows = PLAN_ACTIONS.map((action_type) => { const pacote = draft[action_type]; const qty = Math.max(1, Math.round(pacote.qty || 1)); return { plan_id: id as string, action_type, package_qty: qty, package_price_cents: pacote.price, unit_price_cents: Math.round(pacote.price / qty), included_qty: 0, overage_price_cents: 0 }; });
      const { error } = await supabase.from("plan_action_prices").upsert(rows as never, { onConflict: "plan_id,action_type" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(editing ? "Plano atualizado." : "Plano criado."); qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["plan-action-prices"] }); navigate({ to: "/app/planos" }); },
    onError: (error) => toast.error(errMessage(error)),
  });
  if (!isBackoffice) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Você não tem acesso a esta página.</div>;
  if (editing && (planLoading || priceLoading)) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando plano...</p>;
  return <div className="w-full">
    <div className="mb-6"><h1 className="page-title">{editing ? "Editar plano" : "Novo plano"}</h1></div>
    <section className="panel"><div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)_auto] md:items-end">
      <label className="grid gap-1.5 text-xs font-semibold">Nome do plano<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Fonte de chave<Select value={keySource} onValueChange={(value) => setKeySource(value as Plan["key_source"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KEY_SOURCE.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
      <label className="flex h-10 items-center gap-2 text-sm font-semibold"><Switch checked={active} onCheckedChange={setActive} />Ativo</label>
    </div></section>
    <section className="panel mt-5"><div className="mb-5"><h2 className="font-bold">Pacotes por ação</h2><p className="mt-1 text-sm text-muted-foreground">Defina quantas unidades vêm em um pacote e quanto custa esse pacote. As quantidades compradas não expiram. Deixe o preço em R$ 0,00 para a ação ficar ilimitada.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] table-fixed text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="w-2/5 p-2">Ação</th><th className="p-2">Quantidade do pacote</th><th className="p-2">Preço do pacote <span className="hidden sm:inline">(R$)</span></th></tr></thead><tbody className="divide-y">{PLAN_ACTIONS.map((action) => <tr key={action}><td className="p-2 font-medium">{ACAO_LABELS[action]}</td><td className="p-2"><Input inputMode="numeric" value={String(draft[action].qty)} onChange={(event) => setDraftValue(setDraft, action, { qty: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })} /></td><td className="p-2"><MoneyInput value={draft[action].price} onChange={(value) => setDraftValue(setDraft, action, { price: value })} /></td></tr>)}</tbody></table></div>
    </section>
    <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => navigate({ to: "/app/planos" })}>Cancelar</Button><Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="size-4 animate-spin" />}Salvar plano</Button></div>
  </div>;
}

function emptyPrices() { return Object.fromEntries(PLAN_ACTIONS.map((action) => [action, { qty: 1, price: 0 }])) as Record<BillableAction, Pacote>; }
function setDraftValue(setter: React.Dispatch<React.SetStateAction<Record<BillableAction, Pacote>>>, action: BillableAction, patch: Partial<Pacote>) { setter((current) => ({ ...current, [action]: { ...current[action], ...patch } })); }
function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <Input inputMode="numeric" value={brl(value)} onChange={(event) => onChange(toCents(event.target.value))} />; }

/** Compatibilidade temporária para imports antigos. */
export const PlansCard = PlansPage;
/** Backoffice: lança manualmente a compra de pacotes para uma empresa. */
function CreditPackageCard({ tenants }: { tenants: Tenant[] }) {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState<BillableAction>("cena");
  const [packages, setPackages] = useState("1");

  const creditar = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Escolha a empresa.");
      const qtd = Number(packages);
      if (!Number.isFinite(qtd) || qtd === 0) throw new Error("Informe quantos pacotes creditar.");
      const { data, error } = await supabase.rpc("credit_action_packages", {
        _tenant: tenantId,
        _action: action,
        _packages: Math.round(qtd),
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: (saldo) => {
      toast.success(`Pacote creditado. Saldo atual: ${saldo}.`);
      qc.invalidateQueries({ queryKey: ["saldos"] });
      qc.invalidateQueries({ queryKey: ["saldo-movimentos"] });
    },
    onError: (error) => toast.error(errMessage(error)),
  });

  return <section className="panel mt-5">
    <h2 className="font-bold">Creditar pacote para uma empresa</h2>
    <p className="mt-1 text-sm text-muted-foreground">Lançamento manual enquanto o pagamento automático não existe. A quantidade do pacote vem do plano da empresa.</p>
    <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto] md:items-end">
      <label className="grid gap-1.5 text-xs font-semibold">Empresa
        <Select value={tenantId} onValueChange={setTenantId}><SelectTrigger><SelectValue placeholder="Escolha a empresa" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name || "Sem nome"}</SelectItem>)}</SelectContent></Select>
      </label>
      <label className="grid gap-1.5 text-xs font-semibold">Ação
        <Select value={action} onValueChange={(value) => setAction(value as BillableAction)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLAN_ACTIONS.map((item) => <SelectItem key={item} value={item}>{ACAO_LABELS[item]}</SelectItem>)}</SelectContent></Select>
      </label>
      <label className="grid gap-1.5 text-xs font-semibold">Pacotes
        <Input inputMode="numeric" value={packages} onChange={(event) => setPackages(event.target.value.replace(/[^\d-]/g, ""))} />
      </label>
      <Button disabled={creditar.isPending} onClick={() => creditar.mutate()}>{creditar.isPending && <Loader2 className="size-4 animate-spin" />}Creditar</Button>
    </div>
  </section>;
}
