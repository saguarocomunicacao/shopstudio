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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { DbProfile } from "@/lib/access";
import { LANGUAGE_OPTIONS, TONE_OPTIONS } from "@/lib/content";
import { formatFollowers } from "@/lib/studio-data";
import { CategorySelect } from "./category-select";
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

type FormState = { name: string; handle: string; niche: string; categoryId: string; followers: string; status: string; tone: string; language: string; notes: string };
const emptyForm: FormState = { name: "", handle: "", niche: "", categoryId: "", followers: "0", status: "Ativo", tone: "descontraido", language: "pt-BR", notes: "" };

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
    const base: FormState = p
      ? { ...emptyForm, name: p.name, handle: p.handle, niche: p.niche, categoryId: p.category_id ?? "", followers: String(p.followers), status: p.status }
      : emptyForm;
    setForm(base);
    if (!p) return;
    let cancelled = false;
    void supabase
      .from("profile_identities")
      .select("tone, language, style_notes")
      .eq("profile_id", p.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setForm((f) => ({ ...f, tone: data.tone, language: data.language, notes: data.style_notes }));
      });
    return () => { cancelled = true; };
  }, [dialog]);

  const save = useMutation({
    mutationFn: async ({ profile, values }: { profile: DbProfile | null; values: FormState }) => {
      const payload = {
        name: values.name.trim(),
        handle: values.handle.trim().replace(/^@/, ""),
        niche: values.niche.trim(),
        category_id: values.categoryId || null,
        followers: Number.parseInt(values.followers, 10) || 0,
        status: values.status,
        initials: initialsOf(values.name),
      };
      if (!payload.name) throw new Error("Informe o nome do perfil.");
      let profileId: string;
      if (profile) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
        if (error) throw new Error(error.message);
        profileId = profile.id;
      } else {
        const { data, error } = await supabase.from("profiles").insert({ ...payload, slug: slugify(payload.handle || payload.name) }).select("id").single();
        if (error) throw new Error(error.message);
        profileId = data.id;
      }
      const identity = { profile_id: profileId, tone: values.tone, language: values.language.trim() || "pt-BR", style_notes: values.notes.trim() };
      const { error: identityError } = await supabase.from("profile_identities").upsert(identity, { onConflict: "profile_id" });
      if (identityError) throw new Error(identityError.message);
    },
    onSuccess: (_d, vars) => { toast.success(vars.profile ? "Perfil atualizado." : "Perfil criado."); setDialog({ open: false, profile: null }); refresh(); qc.invalidateQueries({ queryKey: ["profile-identity"] }); },
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
            <div className="grid gap-2"><Label htmlFor="p-handle">@ da conta <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="p-handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="ainda sem conta" /></div>
            <div className="grid gap-2"><Label htmlFor="p-niche">Categoria oficial</Label><CategorySelect id="p-niche" value={form.categoryId} onChange={(categoryId, categoryName) => setForm({ ...form, categoryId, niche: categoryName })} /></div>
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
            <div className="border-t pt-4">
              <p className="text-sm font-bold">Identidade do perfil</p>
              <p className="text-xs text-muted-foreground">Base usada pela IA para escrever os roteiros.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="p-tone">Tom de voz</Label>
                <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
                  <SelectTrigger id="p-tone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-language">Idioma</Label>
                <LanguageSelect id="p-language" value={form.language} onChange={(v) => setForm({ ...form, language: v })} />
              </div>
            </div>
            <div className="grid gap-2"><Label htmlFor="p-notes">Observações de estilo <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea id="p-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: falar direto com a câmera, frases curtas, sempre mostrar o produto em uso." /></div>
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
