import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " · " + new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ApprovalsPage() {
  const { isBackoffice } = useStudio();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useAppUsers(isBackoffice);

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
          <section className="panel space-y-3">
            <h2 className="font-bold">Aguardando aprovação ({pending.length})</h2>
            {pending.length ? (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>E-mail</TableHead>
                      <TableHead className="w-44">Data do cadastro</TableHead>
                      <TableHead className="w-44 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="truncate font-semibold text-foreground max-w-[28rem]">{user.email}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{fmt(user.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: user.id, status: "aprovado" })}>
                              <Check />Aprovar
                            </Button>
                            <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => review.mutate({ id: user.id, status: "recusado" })}>
                              <X />Recusar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p>
            )}
          </section>

          <section className="panel space-y-3">
            <h2 className="font-bold">Já avaliados</h2>
            {reviewed.length ? (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>E-mail</TableHead>
                      <TableHead className="w-44">Data do cadastro</TableHead>
                      <TableHead className="w-56">Observação</TableHead>
                      <TableHead className="w-28 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewed.map((user) => {
                      const superAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="truncate font-semibold text-foreground max-w-[24rem]">{user.email}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{fmt(user.created_at)}</TableCell>
                          <TableCell className="text-muted-foreground truncate max-w-[14rem]">{superAdmin ? "dono do sistema" : "—"}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[user.status] ?? "status-neutral"}`}>
                              {STATUS_LABEL[user.status] ?? user.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
