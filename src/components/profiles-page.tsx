import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Play, Plus, Sparkles, Trash2, Pause, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageSelect } from "./language-select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { VoiceSelect } from "@/components/voice-select";
import type { DbProfile } from "@/lib/access";
import { TONE_OPTIONS } from "@/lib/content";
import { generateAvatarReference, saveAvatarReferences } from "@/lib/video.functions";
import { formatFollowers } from "@/lib/studio-data";
import { CategorySelect } from "./category-select";
import { ProfilePrompts } from "./profile-prompts";
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

const GEMINI_MODELS = [
  { value: "gemini-3.1-flash-image", label: "Equilibrado (padrão)" },
  { value: "gemini-3.1-flash-lite-image", label: "Econômico" },
  { value: "gemini-3-pro-image", label: "Máxima qualidade" },
];

const VEO_MODELS = [
  { value: "veo-3.1-fast-generate-preview", label: "Rápido e econômico (padrão)" },
  { value: "veo-3.1-generate-preview", label: "Alta qualidade" },
];

/** Foto de referência da pessoa: já salva (url) ou recém-escolhida (base64). */
type AvatarItem = { preview: string; url?: string; base64?: string; mimeType?: string };

const MAX_AVATARS = 3;

const readFile = (file: File) =>
  new Promise<AvatarItem>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ preview: result, base64: result.split(",")[1] ?? "", mimeType: file.type });
    };
    reader.readAsDataURL(file);
  });

type FormState = {
  name: string; handle: string; niche: string; categoryId: string; followers: string; status: string;
  tone: string; language: string; notes: string;
  avatarMode: string; takes: string; duration: string; geminiModel: string; veoModel: string; voiceRef: string | null;
};
const emptyForm: FormState = {
  name: "", handle: "", niche: "", categoryId: "", followers: "0", status: "Ativo",
  tone: "descontraido", language: "pt-BR", notes: "",
  avatarMode: "livre", takes: "3", duration: "8", geminiModel: GEMINI_MODELS[0]!.value, veoModel: VEO_MODELS[0]!.value, voiceRef: null,
};

export function ProfilesPage() {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["access"] });

  const canCreate = can("perfis", "criar");
  const [dialog, setDialog] = useState<{ open: boolean; profile: DbProfile | null }>({ open: false, profile: null });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirm, setConfirm] = useState<DbProfile | null>(null);
  const [avatarItems, setAvatarItems] = useState<AvatarItem[]>([]);
  const [avatarSource, setAvatarSource] = useState<"ia" | "upload">("ia");
  const fileInput = useRef<HTMLInputElement>(null);
  const [avatarDescription, setAvatarDescription] = useState("");
  const generateAvatar = useServerFn(generateAvatarReference);
  const saveAvatars = useServerFn(saveAvatarReferences);

  useEffect(() => {
    if (!dialog.open) return;
    const p = dialog.profile;
    const base: FormState = p
      ? { ...emptyForm, name: p.name, handle: p.handle, niche: p.niche, categoryId: p.category_id ?? "", followers: String(p.followers), status: p.status }
      : emptyForm;
    setForm(base);
    setAvatarItems([]);
    setAvatarSource("ia");
    setAvatarDescription("");
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
    void supabase
      .from("profile_video_settings")
      .select("avatar_mode, avatar_reference_url, avatar_reference_urls, takes_count, gemini_model, veo_model, take_duration, voice_ref")
      .eq("profile_id", p.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const list = Array.isArray(data.avatar_reference_urls)
          ? (data.avatar_reference_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
          : [];
        const urls = list.length ? list : data.avatar_reference_url ? [data.avatar_reference_url] : [];
        setAvatarItems(urls.slice(0, MAX_AVATARS).map((url) => ({ preview: url, url })));
        if (urls.length > 1) setAvatarSource("upload");
        setForm((f) => ({
          ...f,
          avatarMode: data.avatar_mode,
          takes: String(data.takes_count),
          duration: String(data.take_duration),
          geminiModel: data.gemini_model,
          veoModel: data.veo_model,
          voiceRef: data.voice_ref ?? null,
        }));
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
      const { error: videoError } = await supabase.from("profile_video_settings").upsert(
        {
          profile_id: profileId,
          avatar_mode: values.avatarMode,
          takes_count: Number(values.takes),
          take_duration: Number(values.duration),
          gemini_model: values.geminiModel,
          veo_model: values.veoModel,
          voice_ref: values.voiceRef,
        },
        { onConflict: "profile_id" },
      );
      if (videoError) throw new Error(videoError.message);
    },
    onSuccess: (_d, vars) => { toast.success(vars.profile ? "Perfil atualizado." : "Perfil criado."); setDialog({ open: false, profile: null }); refresh(); qc.invalidateQueries({ queryKey: ["profile-identity"] }); qc.invalidateQueries({ queryKey: ["video-settings"] }); },
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

  const avatar = useMutation({
    mutationFn: async () => {
      const id = dialog.profile?.id;
      if (!id) throw new Error("Salve o perfil antes de criar a pessoa fixa.");
      return generateAvatar({ data: { profileId: id, description: avatarDescription } });
    },
    onSuccess: (result) => {
      toast.success("Pessoa de referência criada.");
      setAvatarItems([{ preview: result.url, url: result.url }]);
      qc.invalidateQueries({ queryKey: ["video-settings"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const uploadAvatars = useMutation({
    mutationFn: async (items: AvatarItem[]) => {
      const id = dialog.profile?.id;
      if (!id) throw new Error("Salve o perfil antes de enviar as fotos.");
      const images = items.map((item) =>
        item.base64 ? { base64: item.base64, mimeType: item.mimeType! } : { url: item.url! },
      );
      return saveAvatars({ data: { profileId: id, images } });
    },
    onSuccess: (result) => {
      toast.success("Fotos de referência salvas.");
      setAvatarItems(result.urls.map((url) => ({ preview: url, url })));
      qc.invalidateQueries({ queryKey: ["video-settings"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const pickAvatarFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const free = MAX_AVATARS - avatarItems.length;
    if (free <= 0) {
      toast.error("Máximo de 3 fotos. Remova uma para enviar outra.");
      return;
    }
    const chosen = Array.from(files)
      .filter((f) => ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type))
      .slice(0, free);
    if (!chosen.length) {
      toast.error("Envie imagens JPG ou PNG.");
      return;
    }
    if (chosen.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error("Cada foto precisa ter até 5 MB.");
      return;
    }
    const read = await Promise.all(chosen.map(readFile));
    uploadAvatars.mutate([...avatarItems, ...read]);
  };

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
        <DialogContent className="max-h-[88vh] overflow-y-auto">
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

            <div className="border-t pt-4">
              <p className="text-sm font-bold">Geração de vídeo</p>
              <p className="text-xs text-muted-foreground">Todo vídeo deste perfil mostra uma pessoa ou mão usando o produto.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="p-avatar-mode">Pessoa do vídeo</Label>
                <Select value={form.avatarMode} onValueChange={(v) => setForm({ ...form, avatarMode: v })}>
                  <SelectTrigger id="p-avatar-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Pessoa nova a cada vídeo</SelectItem>
                    <SelectItem value="fixo">Sempre a mesma pessoa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-takes">Cenas por vídeo</Label>
                <Select value={form.takes} onValueChange={(v) => setForm({ ...form, takes: v })}>
                  <SelectTrigger id="p-takes"><SelectValue /></SelectTrigger>
                  <SelectContent>{[3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} cenas</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-duration">Duração de cada cena</Label>
                <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                  <SelectTrigger id="p-duration"><SelectValue /></SelectTrigger>
                  <SelectContent>{[4, 6, 8].map((n) => <SelectItem key={n} value={String(n)}>{n} segundos</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-gemini">Qualidade das cenas</Label>
                <Select value={form.geminiModel} onValueChange={(v) => setForm({ ...form, geminiModel: v })}>
                  <SelectTrigger id="p-gemini"><SelectValue /></SelectTrigger>
                  <SelectContent>{GEMINI_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="p-veo">Qualidade da animação</Label>
                <Select value={form.veoModel} onValueChange={(v) => setForm({ ...form, veoModel: v })}>
                  <SelectTrigger id="p-veo"><SelectValue /></SelectTrigger>
                  <SelectContent>{VEO_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <VoiceSelect
                  profileId={dialog.profile?.id ?? null}
                  value={form.voiceRef}
                  onChange={(voiceRef) => setForm({ ...form, voiceRef })}
                />
              </div>
            </div>

            {form.avatarMode === "fixo" && (
              <div className="rounded-xl bg-secondary p-4">
                <p className="text-sm font-semibold">Pessoa fixa do perfil</p>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">
                  {dialog.profile ? "Uma imagem de referência reutilizada em todos os vídeos." : "Salve o perfil primeiro para criar a pessoa fixa."}
                </p>
                <div className="mb-3 inline-flex rounded-lg bg-background p-1">
                  {([["ia", "Gerar por IA"], ["upload", "Enviar fotos"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAvatarSource(value)}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${avatarSource === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {avatarItems.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-3">
                    {avatarItems.map((item, i) => (
                      <div className="relative" key={item.url ?? i}>
                        <img src={item.preview} alt="" className="size-24 rounded-xl object-cover" />
                        <button
                          type="button"
                          aria-label="Remover foto"
                          className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow"
                          disabled={uploadAvatars.isPending}
                          onClick={() => uploadAvatars.mutate(avatarItems.filter((_, idx) => idx !== i))}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {avatarSource === "ia" ? (
                  <div className="grid gap-2">
                    <Input
                      value={avatarDescription}
                      onChange={(e) => setAvatarDescription(e.target.value)}
                      placeholder="mulher brasileira de 28 anos, cabelo cacheado, estilo casual"
                      disabled={!dialog.profile}
                    />
                    <Button
                      variant="secondary"
                      className="justify-self-start"
                      disabled={!dialog.profile || avatar.isPending || avatarDescription.trim().length < 3}
                      onClick={() => avatar.mutate()}
                    >
                      {avatar.isPending ? <><Loader2 className="animate-spin" />Criando...</> : <><Sparkles />Criar pessoa</>}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      Envie de 1 a 3 fotos da mesma pessoa (ângulos e expressões diferentes deixam os vídeos mais consistentes). JPG ou PNG, até 5 MB cada.
                    </p>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => { void pickAvatarFiles(e.target.files); e.target.value = ""; }}
                    />
                    <Button
                      variant="secondary"
                      className="justify-self-start"
                      disabled={!dialog.profile || uploadAvatars.isPending || avatarItems.length >= MAX_AVATARS}
                      onClick={() => fileInput.current?.click()}
                    >
                      {uploadAvatars.isPending ? <><Loader2 className="animate-spin" />Enviando...</> : <><Upload />Enviar fotos ({avatarItems.length}/{MAX_AVATARS})</>}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-bold">Prompts deste perfil</p>
              <p className="text-xs text-muted-foreground">
                {dialog.profile
                  ? "Cada prompt segue o padrão do sistema até você criar uma versão só deste perfil."
                  : "Salve o perfil primeiro para personalizar os prompts."}
              </p>
            </div>
            {dialog.profile && <ProfilePrompts profileId={dialog.profile.id} />}
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
