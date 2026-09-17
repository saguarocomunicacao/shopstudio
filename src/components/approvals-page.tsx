import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SUPER_ADMIN_EMAIL, type AppUser } from "@/lib/access";
import { useStudio } from "./studio-context";

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" };
const STATUS_CLASS: Record<string, string> = { pendente: "status-pink", aprovado: "status-lime", recusado: "status-neutral" };

function useAppUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["approvals"],
    enabled,
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from("app_users")
        .select("id, email, name, avatar_url, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AppUser[];
    },
  });
}

export function ApprovalsPage() {
  const { isSuperAdmin } = useStudio();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useAppUsers(isSuperAdmin);

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovado" | "recusado" }) => {
      const { error } = await supabase.from("app_users").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "aprovado" ? "Cadastro liberado." : "Cadastro recusado.");
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível concluir."),
  });

  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Só o administrador dono do sistema vê a aprovação de cadastros.
      </div>
    );
  }

  const pending = users.filter((u) => u.status === "pendente");
  const reviewed = users.filter((u) => u.status !== "pendente");

  const row = (user: AppUser) => {
    const superAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    return (
      <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            Cadastro em {new Date(user.created_at).toLocaleDateString("pt-BR")}
            {superAdmin ? " · dono do sistema" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[user.status] ?? "status-neutral"}`}>
            {STATUS_LABEL[user.status] ?? user.status}
          </span>
          {!superAdmin && user.status !== "aprovado" && (
            <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: user.id, status: "aprovado" })}>
              <Check />Aprovar
            </Button>
          )}
          {!superAdmin && user.status !== "recusado" && (
            <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => review.mutate({ id: user.id, status: "recusado" })}>
              <X />Recusar
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase text-primary">Controle de acesso</p>
        <h1 className="truncate text-2xl font-black sm:text-3xl">Aprovação de cadastros</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Quem se cadastra fica parado aqui até você liberar. Antes da liberação a pessoa não entra no sistema nem consome nada.
      </p>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando cadastros...</div>
      ) : (
        <div className="grid gap-6">
          <section className="panel">
            <h2 className="mb-3 font-bold">Aguardando aprovação ({pending.length})</h2>
            {pending.length ? <div className="grid gap-2">{pending.map(row)}</div> : <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p>}
          </section>
          <section className="panel">
            <h2 className="mb-3 font-bold">Já avaliados</h2>
            {reviewed.length ? <div className="grid gap-2">{reviewed.map(row)}</div> : <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>}
          </section>
        </div>
      )}
    </>
  );
}
