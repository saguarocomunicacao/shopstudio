import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { DbProfile } from "@/lib/access";
import { formatFollowers } from "@/lib/studio-data";
import { useStudio } from "./studio-context";

const statusClass: Record<string, string> = { Ativo: "status-lime", Pausado: "status-neutral" };
function Badge({ children }: { children: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass[children] ?? "status-neutral"}`}>{children}</span>;
}
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase text-primary">{eyebrow}</p><h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1></div>{action}</div>;
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

export function ProfilesPage() {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ["access"] });

  const canCreate = can("perfis", "criar");
  const [confirm, setConfirm] = useState<DbProfile | null>(null);

  const toggleStatus = useMutation({
    mutationFn: async (profile: DbProfile) => {
      const next = profile.status === "Ativo" ? "Pausado" : "Ativo";
      const { error } = await supabase.from("profiles").update({ status: next }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => { toast.success(next === "Ativo" ? "Perfil reativado." : "Perfil pausado."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (profile: DbProfile) => {
      const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Perfil removido."); setConfirm(null); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <>
      <Heading
        eyebrow={loading ? "Carregando" : `${profiles.length} canais conectados`}
        title="Perfis do TikTok"
        {...(canCreate
          ? { action: <Button asChild><Link to="/app/perfis/novo"><Plus />Adicionar perfil</Link></Button> }
          : {})}
      />
      {profiles.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p, i) => {
            const canEdit = can("perfis", "editar", p.id);
            const canRemove = can("perfis", "remover", p.id);
            return (
              <article className="panel group" key={p.id}>
                <div className="mb-6 flex items-start justify-between">
                  <div className={`avatar avatar-${i % 5}`}>{p.initials}</div>
                  <Badge>{p.status}</Badge>
                </div>
                <h2 className="text-lg font-black">{p.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.niche || "Sem categoria"} · {p.handle ? `@${p.handle}` : "sem conta vinculada"}</p>
                <div className="mt-6 flex items-end justify-between border-t pt-4">
                  <div>
                    <p className="text-lg font-black">{formatFollowers(p.followers)}</p>
                    <p className="text-xs text-muted-foreground">seguidores</p>
                  </div>
                  {canEdit || canRemove ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Gerenciar</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onSelect={() => void navigate({ to: "/app/perfis/$id/editar", params: { id: p.id } })}>
                            <Pencil />Editar
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onSelect={() => toggleStatus.mutate(p)}>
                            {p.status === "Ativo" ? <><Pause />Pausar</> : <><Play />Reativar</>}
                          </DropdownMenuItem>
                        )}
                        {canRemove && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(p)}><Trash2 />Remover</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {loading ? "Carregando perfis..." : "Nenhum perfil disponível para você."}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O perfil e os acessos da equipe a ele serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (confirm) remove.mutate(confirm); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
