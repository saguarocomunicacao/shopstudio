import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronRight, KeyRound, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { SUPER_ADMIN_EMAIL } from "@/lib/access";
import { sendCompanyPasswordReset } from "@/lib/company-admin.functions";
import { userErrorMessage } from "@/lib/user-error";
import { useStudio } from "./studio-context";

type CompanyUser = { id: string; email: string; name: string; status: string; created_at: string; tenant_id: string };
type Tenant = { id: string; name: string; plan_id: string | null };
type Plan = { id: string; name: string; is_active: boolean };
type Filter = "todos" | "pendente" | "aprovado" | "recusado";

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" };
const STATUS_CLASS: Record<string, string> = { pendente: "status-pink", aprovado: "status-lime", recusado: "status-neutral" };
const fmt = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const approvalError = (error: unknown, fallback: string) => {
  console.error("[companies]", error);
  return userErrorMessage(error, fallback);
};

export function ApprovalsPage() {
  const { isBackoffice } = useStudio();
  const qc = useQueryClient();
  const sendPasswordReset = useServerFn(sendCompanyPasswordReset);
  const [filter, setFilter] = useState<Filter>("todos");
  const [expanded, setExpanded] = useState<string | null>(null);

  const companies = useQuery({
    queryKey: ["companies"], enabled: isBackoffice,
    queryFn: async () => {
      const [{ data: users, error: usersError }, { data: tenants, error: tenantsError }, { data: plans, error: plansError }] = await Promise.all([
        supabase.from("app_users").select("id, email, name, status, created_at, tenant_id").order("created_at", { ascending: false }),
        supabase.from("tenants").select("id, name, plan_id").order("name"),
        supabase.from("plans").select("id, name, is_active").order("name"),
      ]);
      if (usersError) throw new Error(usersError.message);
      if (tenantsError) throw new Error(tenantsError.message);
      if (plansError) throw new Error(plansError.message);
      return { users: (users ?? []) as CompanyUser[], tenants: (tenants ?? []) as Tenant[], plans: (plans ?? []) as Plan[] };
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovado" | "recusado" }) => { const { error } = await supabase.from("app_users").update({ status }).eq("id", id); if (error) throw new Error(error.message); },
    onSuccess: (_data, values) => { toast.success(values.status === "aprovado" ? "Cadastro liberado." : "Cadastro recusado."); qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (error) => toast.error(approvalError(error, "Não foi possível concluir. Tente novamente.")),
  });

  const assignPlan = useMutation({
    mutationFn: async ({ tenantId, planId }: { tenantId: string; planId: string }) => { const { error } = await supabase.from("tenants").update({ plan_id: planId }).eq("id", tenantId); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Plano da empresa atualizado."); qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["tenants"] }); },
    onError: (error) => toast.error(approvalError(error, "Não foi possível trocar o plano. Tente novamente.")),
  });

  const resetPassword = useMutation({
    mutationFn: async (userId: string) => sendPasswordReset({ data: { userId } }),
    onSuccess: () => toast.success("E-mail de redefinição enviado."),
    onError: (error) => toast.error(approvalError(error, "Não foi possível enviar o e-mail. Tente novamente.")),
  });

  const data = companies.data ?? { users: [], tenants: [], plans: [] };
  const rows = useMemo(() => data.users.filter((user) => filter === "todos" || user.status === filter), [data.users, filter]);
  const pendingCount = data.users.filter((user) => user.status === "pendente").length;
  if (!isBackoffice) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Só o backoffice gerencia empresas.</div>;

  return <div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase text-primary">Controle de acesso</p><h1 className="text-2xl font-black sm:text-3xl">Empresas</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Aprove cadastros, atribua planos e envie redefinições de senha.</p></div><div className="w-full sm:w-52"><Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="pendente">Pendentes ({pendingCount})</SelectItem><SelectItem value="aprovado">Aprovados</SelectItem><SelectItem value="recusado">Recusados</SelectItem></SelectContent></Select></div></div>
    <section className="panel overflow-hidden p-0">
      {companies.isLoading ? <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando empresas...</p> : companies.isError ? <p className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar as empresas. Tente novamente.</p> : <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"/><TableHead>E-mail</TableHead><TableHead>Empresa</TableHead><TableHead>Plano atual</TableHead><TableHead>Status</TableHead><TableHead>Cadastro</TableHead></TableRow></TableHeader><TableBody>{rows.map((user) => {
        const tenant = data.tenants.find((item) => item.id === user.tenant_id);
        const plan = data.plans.find((item) => item.id === tenant?.plan_id);
        const open = expanded === user.id;
        const protectedAccount = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
        const Icon = open ? ChevronDown : ChevronRight;
        return <CompanyRows key={user.id} user={user} tenant={tenant} plan={plan} plans={data.plans} open={open} protectedAccount={protectedAccount} busy={review.isPending || assignPlan.isPending || resetPassword.isPending} onToggle={() => setExpanded(open ? null : user.id)} onReview={(status) => review.mutate({ id: user.id, status })} onPlan={(planId) => tenant && assignPlan.mutate({ tenantId: tenant.id, planId })} onReset={() => resetPassword.mutate(user.id)} />;
      })}</TableBody></Table>}
      {!companies.isLoading && !companies.isError && !rows.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma empresa neste filtro.</p>}
    </section>
  </div>;
}

function CompanyRows({ user, tenant, plan, plans, open, protectedAccount, busy, onToggle, onReview, onPlan, onReset }: { user: CompanyUser; tenant: Tenant | undefined; plan: Plan | undefined; plans: Plan[]; open: boolean; protectedAccount: boolean; busy: boolean; onToggle: () => void; onReview: (status: "aprovado" | "recusado") => void; onPlan: (planId: string) => void; onReset: () => void }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <>
    <TableRow className={user.status === "pendente" ? "bg-primary/5 hover:bg-primary/10" : undefined}>
      <TableCell><Button variant="ghost" size="icon" aria-label={open ? "Recolher empresa" : "Expandir empresa"} onClick={onToggle}><Icon /></Button></TableCell>
      <TableCell><p className="font-semibold">{user.email}</p><p className="text-xs text-muted-foreground">{user.name || "Sem nome"}</p></TableCell>
      <TableCell>{tenant?.name ?? "—"}</TableCell><TableCell>{plan?.name ?? "Sem plano"}</TableCell>
      <TableCell><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[user.status] ?? "status-neutral"}`}>{STATUS_LABEL[user.status] ?? user.status}</span></TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{fmt(user.created_at)}</TableCell>
    </TableRow>
    {open && <TableRow className="bg-secondary/40 hover:bg-secondary/40"><TableCell/><TableCell colSpan={5}><div className="grid gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
      <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Acesso</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || protectedAccount || user.status === "aprovado"} onClick={() => onReview("aprovado")}><Check />Aprovar</Button><Button size="sm" variant="secondary" disabled={busy || protectedAccount || user.status === "recusado"} onClick={() => onReview("recusado")}><X />Recusar</Button><Button size="sm" variant="outline" disabled={busy} onClick={onReset}><KeyRound />Enviar reset de senha</Button></div><p className="mt-3 text-xs text-muted-foreground">Por segurança, a senha não pode ser exibida; use o reset por e-mail.</p>{protectedAccount && <p className="mt-2 text-xs font-semibold text-primary">A conta principal não pode ser recusada ou rebaixada.</p>}</div>
      <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Plano da empresa</p><Select value={tenant?.plan_id ?? "sem-plano"} onValueChange={onPlan} disabled={!tenant || busy}><SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger><SelectContent><SelectItem value="sem-plano" disabled>Sem plano</SelectItem>{plans.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{!item.is_active ? " · inativo" : ""}</SelectItem>)}</SelectContent></Select></div>
    </div></TableCell></TableRow>}
  </>;
}