import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { TONE_OPTIONS } from "@/lib/content";
import { generateAvatarReference, saveAvatarReferences } from "@/lib/video.functions";
import { seedProfilePrompts } from "@/lib/prompts.functions";
import { CategorySelect } from "./category-select";
import { LanguageSelect } from "./language-select";
import { ProfilePrompts } from "./profile-prompts";
import { VoiceSelect } from "./voice-select";
import { useStudio } from "./studio-context";

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

type TabKey = "dados" | "identidade" | "video" | "pessoa" | "voz" | "publicacao" | "prompts";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "dados", label: "Dados do perfil", hint: "Nome, conta, categoria e status" },
  { key: "identidade", label: "Identidade", hint: "Tom, idioma e estilo usados pela IA" },
  { key: "video", label: "Geração de vídeo", hint: "Cenas, duração e qualidade" },
  { key: "pessoa", label: "Pessoa / Avatar", hint: "Quem aparece nos vídeos" },
  { key: "voz", label: "Voz", hint: "Voz da narração" },
  { key: "publicacao", label: "Publicação", hint: "Revisão, alertas e resumos" },
  { key: "prompts", label: "Prompts", hint: "Versões próprias deste perfil" },
];

/** Campos que cada aba edita, para marcar alterações não salvas. */
const TAB_FIELDS: Partial<Record<TabKey, (keyof FormState)[]>> = {
  dados: ["name", "handle", "categoryId", "niche", "followers", "status"],
  identidade: ["tone", "language", "notes"],
  video: ["takes", "duration", "geminiModel", "veoModel"],
  pessoa: ["avatarMode"],
  voz: ["voiceRef"],
};

export function ProfileEditorPage({ profileId }: { profileId: string | null }) {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const profile = profileId ? profiles.find((p) => p.id === profileId) ?? null : null;
  const isNew = !profileId;
  const allowed = isNew ? can("perfis", "criar") : profileId ? can("perfis", "editar", profileId) : false;

  const [tab, setTab] = useState<TabKey>("dados");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saved, setSaved] = useState<FormState>(emptyForm);
  const [avatarItems, setAvatarItems] = useState<AvatarItem[]>([]);
  const [avatarSource, setAvatarSource] = useState<"ia" | "upload">("ia");
  const [avatarDescription, setAvatarDescription] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const generateAvatar = useServerFn(generateAvatarReference);
  const saveAvatars = useServerFn(saveAvatarReferences);
  const seedPrompts = useServerFn(seedProfilePrompts);

  useEffect(() => {
    const base: FormState = profile
      ? { ...emptyForm, name: profile.name, handle: profile.handle, niche: profile.niche, categoryId: profile.category_id ?? "", followers: String(profile.followers), status: profile.status }
      : emptyForm;
    setForm(base);
    setSaved(base);
    setAvatarItems([]);
    setAvatarSource("ia");
    setAvatarDescription("");
    if (!profile) return;
    let cancelled = false;
    void supabase
      .from("profile_identities")
      .select("tone, language, style_notes")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const patch = { tone: data.tone, language: data.language, notes: data.style_notes };
        setForm((f) => ({ ...f, ...patch }));
        setSaved((f) => ({ ...f, ...patch }));
      });
    void supabase
      .from("profile_video_settings")
      .select("avatar_mode, avatar_reference_url, avatar_reference_urls, takes_count, gemini_model, veo_model, take_duration, voice_ref")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const list = Array.isArray(data.avatar_reference_urls)
          ? (data.avatar_reference_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
          : [];
        const urls = list.length ? list : data.avatar_reference_url ? [data.avatar_reference_url] : [];
        setAvatarItems(urls.slice(0, MAX_AVATARS).map((url) => ({ preview: url, url })));
        if (urls.length > 1) setAvatarSource("upload");
        const patch = {
          avatarMode: data.avatar_mode,
          takes: String(data.takes_count),
          duration: String(data.take_duration),
          geminiModel: data.gemini_model,
          veoModel: data.veo_model,
          voiceRef: data.voice_ref ?? null,
        };
        setForm((f) => ({ ...f, ...patch }));
        setSaved((f) => ({ ...f, ...patch }));
      });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const dirtyTabs = useMemo(() => {
    const set = new Set<TabKey>();
    for (const [key, fields] of Object.entries(TAB_FIELDS) as [TabKey, (keyof FormState)[]][]) {
      if (fields.some((f) => form[f] !== saved[f])) set.add(key);
    }
    return set;
  }, [form, saved]);

  const dadosIncompleto = !form.name.trim() || !form.categoryId;
  const dirty = dirtyTabs.size > 0;

  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: () => dirty, withResolver: true });

  const save = useMutation({
    mutationFn: async (values: FormState) => {
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
      let newId: string;
      if (profile) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
        if (error) throw new Error(error.message);
        newId = profile.id;
      } else {
        const { data, error } = await supabase.from("profiles").insert({ ...payload, slug: slugify(payload.handle || payload.name) }).select("id").single();
        if (error) throw new Error(error.message);
        newId = data.id;
        // O perfil nasce com a cópia dos prompts padrão (feita no servidor).
        await seedPrompts({ data: { profileId: newId } }).catch(() => undefined);
      }
      const identity = { profile_id: newId, tone: values.tone, language: values.language.trim() || "pt-BR", style_notes: values.notes.trim() };
      const { error: identityError } = await supabase.from("profile_identities").upsert(identity, { onConflict: "profile_id" });
      if (identityError) throw new Error(identityError.message);
      const { error: videoError } = await supabase.from("profile_video_settings").upsert(
        {
          profile_id: newId,
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
      return newId;
    },
    onSuccess: (newId, values) => {
      toast.success(profile ? "Perfil atualizado." : "Perfil criado.");
      setSaved(values);
      qc.invalidateQueries({ queryKey: ["access"] });
      qc.invalidateQueries({ queryKey: ["profile-identity"] });
      qc.invalidateQueries({ queryKey: ["video-settings"] });
      if (!profile) void navigate({ to: "/app/perfis/$id/editar", params: { id: newId } });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const avatar = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Salve o perfil antes de criar a pessoa fixa.");
      return generateAvatar({ data: { profileId: profile.id, description: avatarDescription } });
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
      if (!profile) throw new Error("Salve o perfil antes de enviar as fotos.");
      const images = items.map((item) => (item.base64 ? { base64: item.base64, mimeType: item.mimeType! } : { url: item.url! }));
      return saveAvatars({ data: { profileId: profile.id, images } });
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

  const goBack = () => void navigate({ to: "/app/perfis" });

  if (loading && !profile && !isNew) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando perfil...</p>;
  }
  if (!allowed || (!isNew && !profile)) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        <p>{!isNew && !profile ? "Perfil não encontrado." : "Você não tem permissão para editar perfis."}</p>
        <Button variant="secondary" className="mt-4" asChild><Link to="/app/perfis">Voltar aos perfis</Link></Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="mb-1 inline-flex items-center gap-1 text-xs font-bold uppercase text-primary">
            <ArrowLeft className="size-3.5" />Perfis
          </button>
          <h1 className="truncate text-2xl font-black sm:text-3xl">{profile ? profile.name || "Editar perfil" : "Adicionar perfil"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">Alterações não salvas</span>}
          <Button variant="secondary" onClick={goBack}>Cancelar</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {profile ? "Salvar" : "Criar perfil"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="panel h-fit p-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            const alerta = t.key === "dados" && dadosIncompleto;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{t.label}</span>
                  <span className={`block truncate text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{t.hint}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {alerta && <AlertTriangle className={`size-4 ${active ? "" : "text-primary"}`} />}
                  {dirtyTabs.has(t.key) && <span className={`size-2 rounded-full ${active ? "bg-primary-foreground" : "bg-primary"}`} />}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="panel">
          {tab === "dados" && (
            <div className="grid gap-4">
              <SectionTitle title="Dados do perfil" description="Como o canal aparece no painel." />
              {dadosIncompleto && (
                <p className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-primary">
                  Informe ao menos o nome e a categoria oficial.
                </p>
              )}
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
            </div>
          )}

          {tab === "identidade" && (
            <div className="grid gap-4">
              <SectionTitle title="Identidade do perfil" description="Base usada pela IA para escrever os roteiros." />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="p-tone">Tom de voz</Label>
                  <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
                    <SelectTrigger id="p-tone"><SelectValue /></SelectTrigger>
                    <SelectContent>{TONE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-language">Idioma</Label>
                  <LanguageSelect id="p-language" value={form.language} onChange={(v) => setForm({ ...form, language: v })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-notes">Observações de estilo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea id="p-notes" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: falar direto com a câmera, frases curtas, sempre mostrar o produto em uso." />
              </div>
            </div>
          )}

          {tab === "video" && (
            <div className="grid gap-4">
              <SectionTitle title="Geração de vídeo" description="Todo vídeo deste perfil mostra uma pessoa ou mão usando o produto." />
              <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="grid gap-2">
                  <Label htmlFor="p-veo">Qualidade da animação</Label>
                  <Select value={form.veoModel} onValueChange={(v) => setForm({ ...form, veoModel: v })}>
                    <SelectTrigger id="p-veo"><SelectValue /></SelectTrigger>
                    <SelectContent>{VEO_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {tab === "pessoa" && (
            <div className="grid gap-4">
              <SectionTitle title="Pessoa do vídeo" description="Quem aparece nas cenas geradas para este perfil." />
              <div className="grid gap-2 sm:max-w-sm">
                <Label htmlFor="p-avatar-mode">Modo</Label>
                <Select value={form.avatarMode} onValueChange={(v) => setForm({ ...form, avatarMode: v })}>
                  <SelectTrigger id="p-avatar-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Pessoa nova a cada vídeo</SelectItem>
                    <SelectItem value="fixo">Sempre a mesma pessoa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.avatarMode === "fixo" && (
                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-sm font-semibold">Pessoa fixa do perfil</p>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">
                    {profile ? "Uma imagem de referência reutilizada em todos os vídeos." : "Salve o perfil primeiro para criar a pessoa fixa."}
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
                        disabled={!profile}
                      />
                      <Button
                        variant="secondary"
                        className="justify-self-start"
                        disabled={!profile || avatar.isPending || avatarDescription.trim().length < 3}
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
                        disabled={!profile || uploadAvatars.isPending || avatarItems.length >= MAX_AVATARS}
                        onClick={() => fileInput.current?.click()}
                      >
                        {uploadAvatars.isPending ? <><Loader2 className="animate-spin" />Enviando...</> : <><Upload />Enviar fotos ({avatarItems.length}/{MAX_AVATARS})</>}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "voz" && (
            <div className="grid gap-4">
              <SectionTitle title="Voz da narração" description="Escolha a voz usada nos vídeos deste perfil. Vozes clonadas ou importadas aqui ficam disponíveis para todos os perfis." />
              <VoiceSelect profileId={profile?.id ?? null} value={form.voiceRef} canManage={allowed} onChange={(voiceRef) => setForm({ ...form, voiceRef })} />

            </div>
          )}

          {tab === "publicacao" && (
            <div className="grid gap-4">
              <SectionTitle title="Fluxo de publicação" description="Comportamento de publicação deste perfil." />
              <div>
                {[
                  ["Revisão obrigatória", "Exigir aprovação antes de publicar"],
                  ["Alertas de tendência", "Sinalizar produtos com hype alto"],
                  ["Resumo semanal", "Receber um resumo de desempenho"],
                ].map(([title, description], index) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t py-4" key={title}>
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Switch defaultChecked={index < 2} aria-label={title} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "prompts" && (
            <div className="grid gap-4">
              <SectionTitle
                title="Prompts deste perfil"
                description={profile
                  ? "Cada prompt segue o padrão do sistema até você criar uma versão só deste perfil."
                  : "Salve o perfil primeiro para personalizar os prompts."}
              />
              {profile && <ProfilePrompts profileId={profile.id} />}
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={blocker.status === "blocked"} onOpenChange={(open) => { if (!open) blocker.reset?.(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>Há alterações não salvas neste perfil. Elas serão perdidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); blocker.proceed?.(); }}>Sair sem salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
