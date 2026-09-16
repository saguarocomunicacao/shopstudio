import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Play, Plus, Trash2, Pause } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const slugify = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `perfil-${Date.now()}`;

const initialsOf = (value: string) =>
  value.trim().split(/\s+/).filter((w) => w.length > 2 || value.trim().split(/\s+/).length === 1).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "??";

type FormState = { name: string; handle: string; niche: string; tagline: string; followers: string; status: string };
const emptyForm: FormState = { name: "", handle: "", niche: "", tagline: "", followers: "0", status: "Ativo" };

export function ProfilesPage() {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["access"] });

  const canCreate = can("perfis", "criar");
  const [dialog, setDialog] = useState<{ open: boolean; profile: DbProfile | null }>({ open: false, profile: null });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirm, setConfirm] = useState<DbProfile | null>(null);

  useEffect(() => {
    if (!dialog.open) return;
    const p = dialog.profile;
    setForm(p ? { name: p.name, handle: p.handle, niche: p.niche, tagline: p.tagline, followers: String(p.followers), status: p.status } : emptyForm);
  }, [dialog]);

  const save = useMutation({
    mutationFn: async ({ profile, values }: { profile: DbProfile | null; values: FormState }) => {
      const payload = {
        name: values.name.trim(),
        handle: values.handle.trim().replace(/^@/, ""),
        niche: values.niche.trim(),
        tagline: values.tagline.trim(),
        followers: Number.parseInt(values.followers, 10) || 0,
        status: values.status,
        initials: initialsOf(values.name),
      };
      if (!payload.name) throw new Error("Informe o nome do perfil.");
      if (profile) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("profiles").insert({ ...payload, slug: slugify(payload.handle || payload.name) });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => { toast.success(vars.profile ? "Perfil atualizado." : "Perfil criado."); setDialog({ open: false, profile: null }); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

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
        {...(canCreate ? { action: <Button onClick={() => setDialog({ open: true, profile: null })}><Plus />Adicionar perfil</Button> } : {})}
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
                <p className="mt-1 text-sm text-muted-foreground">{p.niche}{p.handle ? ` · @${p.handle}` : ""}</p>
                {p.tagline ? <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p> : null}
                <div className="mt-6 flex items-end justify-between border-t pt-4">
                  <div>
                    <p className="text-lg font-black">{formatFollowers(p.followers)}</p>
                    <p className="text-xs text-muted-foreground">seguidores</p>
                  </div>
                  {canEdit || canRemove ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Gerenciar</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && <DropdownMenuItem onSelect={() => setDialog({ open: true, profile: p })}><Pencil />Editar</DropdownMenuItem>}
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

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, profile: open ? dialog.profile : null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog.profile ? "Editar perfil" : "Adicionar perfil"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="p-name">Nome</Label><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Moda e Acessórios" /></div>
            <div className="grid gap-2"><Label htmlFor="p-handle">@ da conta</Label><Input id="p-handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="modaacessorios" /></div>
            <div className="grid gap-2"><Label htmlFor="p-niche">Nicho</Label><Input id="p-niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Moda feminina" /></div>
            <div className="grid gap-2"><Label htmlFor="p-tagline">Tagline</Label><Input id="p-tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Looks & tendências" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="p-followers">Seguidores</Label><Input id="p-followers" inputMode="numeric" value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="grid gap-2">
                <Label htmlFor="p-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="p-status"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Pausado">Pausado</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false, profile: null })}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate({ profile: dialog.profile, values: form })}>
              {dialog.profile ? "Salvar" : "Criar perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
