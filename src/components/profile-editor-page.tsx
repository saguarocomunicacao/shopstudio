import { LerComentariosToggle } from "./ler-comentarios-toggle";
import { PageLoader } from "@/components/page-loader";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { DEFAULT_RECORDING_ASPECT_RATIO, RECORDING_FORMATS, normalizeRecordingAspectRatio, type RecordingAspectRatio } from "@/lib/recording-format";
import { ProfileAvatarsCard } from "./avatar-library";
import { CategorySelect } from "./category-select";
import { LanguageSelect } from "./language-select";
import { ProfilePrompts } from "./profile-prompts";
import { TiktokIntegrationCard } from "./tiktok-integration-card";
import { VoiceSelect } from "./voice-select";
import { useStudio } from "./studio-context";
import { actionError } from "@/lib/api-keys";
import { DEFAULT_VISUAL_STYLE, VISUAL_STYLE_OPTIONS, type VisualStyle } from "@/lib/visual-style";
import { MAX_AVATAR_FILE_BYTES } from "@/lib/avatars.functions";
import { MAX_PROFILE_IMAGE_BYTES, saveProfileImage } from "@/lib/profile-image.functions";
import { ProfileImage } from "./profile-image";
import { ProfileImageCropper } from "./profile-image-cropper";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

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
type AvatarItem = { preview: string; url?: string; base64?: string; mimeType?: string; width?: number; height?: number };

const MAX_AVATARS = 5;
/** Abaixo disso o rosto costuma sair sem detalhe suficiente para o Gemini. */
const MIN_AVATAR_SIDE = 512;

const AVATAR_TIPS: { good: boolean; text: string }[] = [
  { good: true, text: "A mesma pessoa em todas as fotos." },
  { good: true, text: "Rosto bem visível, nítido e bem iluminado (luz natural de dia é ideal)." },
  { good: true, text: "Ângulos diferentes: uma de frente, uma de leve perfil e uma de meio corpo." },
  { good: true, text: "Fundo neutro e limpo, sem bagunça atrás." },
  { good: true, text: "Expressões naturais, sem óculos escuros, boné ou nada cobrindo o rosto." },
  { good: false, text: "Evite: foto borrada, escura, muito de longe, com várias pessoas ou com filtro pesado." },
];

const readFile = (file: File) =>
  new Promise<AvatarItem>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const result = String(reader.result);
      const item: AvatarItem = { preview: result, base64: result.split(",")[1] ?? "", mimeType: file.type };
      const probe = new Image();
      probe.onload = () => resolve({ ...item, width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => resolve(item);
      probe.src = result;
    };
    reader.readAsDataURL(file);
  });

type FormState = {
  name: string; handle: string; niche: string; categoryId: string; followers: string; status: string;
  tone: string; language: string; notes: string;
  avatarMode: string; avatarDescription: string; takes: string; duration: string; geminiModel: string; veoModel: string; recordingAspectRatio: RecordingAspectRatio; voiceRef: string | null;
  visualStyle: VisualStyle; visualStyleCustom: string;
  requireReview: boolean;
};
const emptyForm: FormState = {
  name: "", handle: "", niche: "", categoryId: "", followers: "0", status: "Ativo",
  tone: "descontraido", language: "pt-BR", notes: "",
  avatarMode: "livre", avatarDescription: "", takes: "3", duration: "8", geminiModel: GEMINI_MODELS[0]!.value, veoModel: VEO_MODELS[0]!.value, recordingAspectRatio: DEFAULT_RECORDING_ASPECT_RATIO, voiceRef: null,
  visualStyle: DEFAULT_VISUAL_STYLE, visualStyleCustom: "",
  requireReview: true,
};

type TabKey = "dados" | "identidade" | "video" | "pessoa" | "avatares" | "voz" | "publicacao" | "integracoes" | "prompts";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "dados", label: "Dados do perfil", hint: "Nome, conta, categoria e status" },
  { key: "identidade", label: "Identidade", hint: "Tom, idioma e estilo usados pela IA" },
  { key: "video", label: "Geração de vídeo", hint: "Cenas, duração e qualidade" },
  { key: "pessoa", label: "Pessoa / Avatar", hint: "Quem aparece nos vídeos" },
  { key: "avatares", label: "Meus avatares", hint: "Avatares salvos para reusar" },
  { key: "voz", label: "Voz", hint: "Voz da narração" },
  { key: "publicacao", label: "Publicação", hint: "Revisão, alertas e resumos" },
  { key: "integracoes", label: "Integrações", hint: "Conta do TikTok Shop" },
  { key: "prompts", label: "Prompts", hint: "Versões próprias deste perfil" },
];

/** Campos que cada aba edita, para marcar alterações não salvas. */
const TAB_FIELDS: Partial<Record<TabKey, (keyof FormState)[]>> = {
  dados: ["name", "handle", "categoryId", "niche", "followers", "status"],
  identidade: ["tone", "language", "notes"],
  video: ["takes", "duration", "geminiModel", "veoModel", "recordingAspectRatio", "visualStyle", "visualStyleCustom"],
  pessoa: ["avatarMode", "avatarDescription"],
  voz: ["voiceRef"],
  publicacao: ["requireReview"],
};

export function ProfileEditorPage({ profileId }: { profileId: string | null }) {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const profile = profileId ? profiles.find((p) => p.id === profileId) ?? null : null;
  const isNew = !profileId;
  const allowed = isNew ? can("perfis", "criar") : profileId ? can("perfis", "editar", profileId) : false;

  const tabParam = (useSearch({ strict: false }) as { tab?: string }).tab;
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "dados");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saved, setSaved] = useState<FormState>(emptyForm);
  const [avatarItems, setAvatarItems] = useState<AvatarItem[]>([]);
  const [avatarSource, setAvatarSource] = useState<"ia" | "upload">("ia");
  const [avatarDescription, setAvatarDescription] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingAvatars, setPendingAvatars] = useState<AvatarItem[]>([]);
  const [rejectedAvatars, setRejectedAvatars] = useState<{ id: string; name: string; reason: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const profileImageInput = useRef<HTMLInputElement>(null);
  const [profileImageSource, setProfileImageSource] = useState<string | null>(null);
  const [profileImageCropOpen, setProfileImageCropOpen] = useState(false);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevLightbox = useCallback(() => setLightboxIndex((i) => (i === null ? null : (i - 1 + avatarItems.length) % avatarItems.length)), [avatarItems.length]);
  const nextLightbox = useCallback(() => setLightboxIndex((i) => (i === null ? null : (i + 1) % avatarItems.length)), [avatarItems.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); prevLightbox(); }
      if (e.key === "ArrowRight") { e.preventDefault(); nextLightbox(); }
      if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, prevLightbox, nextLightbox, closeLightbox]);
  const generateAvatar = useServerFn(generateAvatarReference);
  const saveAvatars = useServerFn(saveAvatarReferences);
  const seedPrompts = useServerFn(seedProfilePrompts);
  const saveProfileImageFn = useServerFn(saveProfileImage);

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
      .select("avatar_mode, avatar_reference_url, avatar_reference_urls, avatar_description, takes_count, gemini_model, veo_model, take_duration, recording_aspect_ratio, voice_ref, require_review, visual_style, visual_style_custom")
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
          avatarDescription: data.avatar_description ?? "",
          takes: String(data.takes_count),
          duration: String(data.take_duration),
          geminiModel: data.gemini_model,
          veoModel: data.veo_model,
          recordingAspectRatio: normalizeRecordingAspectRatio(data.recording_aspect_ratio),
          voiceRef: data.voice_ref ?? null,
          requireReview: data.require_review ?? true,
          visualStyle: (VISUAL_STYLE_OPTIONS.some((option) => option.value === data.visual_style) ? data.visual_style : DEFAULT_VISUAL_STYLE) as VisualStyle,
          visualStyleCustom: data.visual_style_custom ?? "",
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
      if (values.visualStyle === "personalizado" && !values.visualStyleCustom.trim()) {
        throw new Error("Descreva o estilo visual personalizado.");
      }
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
          avatar_description: values.avatarDescription.trim(),
          takes_count: Number(values.takes),
          take_duration: Number(values.duration),
          gemini_model: values.geminiModel,
          veo_model: values.veoModel,
          recording_aspect_ratio: values.recordingAspectRatio,
          voice_ref: values.voiceRef,
          require_review: values.requireReview,
          visual_style: values.visualStyle,
          visual_style_custom: values.visualStyle === "personalizado" ? values.visualStyleCustom.trim() || null : null,
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
    onSettled: () => setPendingAvatars([]),
  });

  const profileImageUpload = useMutation({
    mutationFn: async (base64: string) => {
      if (!profile) throw new Error("Salve o perfil antes de enviar a foto.");
      return saveProfileImageFn({ data: { profileId: profile.id, base64, mimeType: "image/png" } });
    },
    onSuccess: () => {
      toast.success("Foto do perfil salva.");
      setProfileImageCropOpen(false);
      setProfileImageSource(null);
      qc.invalidateQueries({ queryKey: ["access"] });
      qc.invalidateQueries({ queryKey: ["profile-image-url"] });
    },
    onError: (error) => toast.error(errMessage(error)),
  });

  const pickProfileImage = (file: File | undefined) => {
    if (!file) return;
    if (!profile) {
      toast.error("Salve o perfil antes de enviar a foto.");
      return;
    }
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast.error("Escolha uma imagem JPG ou PNG.");
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      toast.error("A imagem deve ter no máximo 15 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Não foi possível ler a imagem.");
    reader.onload = () => {
      setProfileImageSource(String(reader.result));
      setProfileImageCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const pickAvatarFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const free = MAX_AVATARS - avatarItems.length;
    if (free <= 0) {
      toast.error(`Máximo de ${MAX_AVATARS} fotos. Remova uma para enviar outra.`);
      return;
    }

    const rejects: { id: string; name: string; reason: string }[] = [];
    const accepted: File[] = [];
    for (const file of list) {
      const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
      if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
        rejects.push({ id, name: file.name, reason: "Formato inválido (use JPG ou PNG)" });
      } else if (file.size > MAX_AVATAR_FILE_BYTES) {
        rejects.push({ id, name: file.name, reason: "Maior que 15 MB" });
      } else if (accepted.length >= free) {
        rejects.push({ id, name: file.name, reason: `Limite de ${MAX_AVATARS} fotos` });
      } else {
        accepted.push(file);
      }
    }
    setRejectedAvatars(rejects);
    if (!accepted.length) return;

    const read = await Promise.all(accepted.map(readFile));
    setPendingAvatars(read);
    const small = read.filter((r) => r.width && r.height && Math.min(r.width, r.height) < MIN_AVATAR_SIDE);
    if (small.length) {
      toast.warning(
        small.length === 1
          ? "Uma das fotos tem resolução baixa e pode deixar o rosto menos fiel. Se puder, envie uma maior."
          : `${small.length} fotos têm resolução baixa e podem deixar o rosto menos fiel. Se puder, envie versões maiores.`,
      );
    }
    uploadAvatars.mutate([...avatarItems, ...read]);
  };

  const onAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!profile || uploadAvatars.isPending || avatarItems.length >= MAX_AVATARS) return;
    void pickAvatarFiles(e.dataTransfer.files);
  };


  const goBack = () => void navigate({ to: "/app/perfis" });

  if (loading && !profile && !isNew) {
    return <PageLoader />;
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
          <h1 className="truncate page-title">{profile ? profile.name || "Editar perfil" : "Adicionar perfil"}</h1>
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
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                {profile ? (
                  <ProfileImage profile={profile} className="size-20 bg-foreground text-base text-background" />
                ) : (
                  <span className="grid size-20 place-items-center rounded-full bg-secondary text-base font-bold">{initialsOf(form.name)}</span>
                )}
                <div className="min-w-0">
                  <Label>Foto do perfil</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Foto ou logo do canal exibido no painel. Não é a pessoa que aparece nos vídeos.</p>
                  <input
                    ref={profileImageInput}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) => { pickProfileImage(event.target.files?.[0]); event.currentTarget.value = ""; }}
                  />
                  <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={!profile || profileImageUpload.isPending} onClick={() => profileImageInput.current?.click()}>
                    <Camera className="size-4" />{profile?.profile_image_path ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  <p className="mt-2 text-[11px] text-muted-foreground">JPG ou PNG, até 15 MB. Você ajustará o recorte redondo antes de salvar.</p>
                  {!profile && <p className="mt-1 text-[11px] font-semibold text-primary">Crie o perfil primeiro para adicionar a foto.</p>}
                </div>
              </div>
              <div className="grid gap-2"><Label htmlFor="p-name">Nome</Label><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Moda e Acessórios" /></div>
              <div className="grid gap-2"><Label htmlFor="p-handle">@ da conta <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="p-handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="ainda sem conta" />{profile && <ColetaAlerta profileId={profile.id} />}</div>
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
              <div className="grid gap-3 rounded-xl border p-4">
                <div className="grid gap-2 sm:max-w-md">
                  <Label htmlFor="p-visual-style">Estilo visual padrão</Label>
                  <Select value={form.visualStyle} onValueChange={(value) => setForm({ ...form, visualStyle: value as VisualStyle })}>
                    <SelectTrigger id="p-visual-style"><SelectValue /></SelectTrigger>
                    <SelectContent>{VISUAL_STYLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Aplicado a todas as cenas geradas por IA deste perfil, salvo quando um vídeo tiver outra escolha.</p>
                </div>
                {form.visualStyle === "personalizado" && (
                  <div className="grid gap-2">
                    <Label htmlFor="p-visual-style-custom">Descrição do estilo</Label>
                    <Textarea id="p-visual-style-custom" rows={3} maxLength={500} value={form.visualStyleCustom} onChange={(event) => setForm({ ...form, visualStyleCustom: event.target.value })} placeholder="Ex: colagem editorial com papel recortado, textura impressa e cores vibrantes" />
                  </div>
                )}
              </div>
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
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="p-recording-aspect-ratio">Formato de gravação</Label>
                  <Select
                    value={form.recordingAspectRatio}
                    onValueChange={(value: RecordingAspectRatio) => setForm({ ...form, recordingAspectRatio: value })}
                  >
                    <SelectTrigger id="p-recording-aspect-ratio"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(RECORDING_FORMATS) as [RecordingAspectRatio, (typeof RECORDING_FORMATS)[RecordingAspectRatio]][]).map(([value, option]) => (
                        <SelectItem key={value} value={value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Usado no preview e no arquivo salvo pelo estúdio. O padrão é vertical 9:16.</p>
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
                  <SelectTrigger id="p-avatar-mode" data-tour="avatar-mode"><SelectValue /></SelectTrigger>
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
                        data-tour={`avatar-${value}`}
                        onClick={() => setAvatarSource(value)}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${avatarSource === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {(avatarItems.length > 0 || pendingAvatars.length > 0 || rejectedAvatars.length > 0) && (
                    <div className="mb-3 flex flex-wrap gap-3">
                      {avatarItems.map((item, i) => (
                        <div className="group relative" key={item.url ?? i}>
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(i)}
                            aria-label={`Ver foto ${i + 1} em tela cheia`}
                            className="relative block size-24 overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <img src={item.preview} alt="" className="size-24 rounded-xl object-cover transition-transform group-hover:scale-[1.04]" />
                            <span className="absolute inset-x-0 bottom-0 bg-foreground/70 px-1 py-1 text-center text-[10px] font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100">
                              Ver em tela cheia
                            </span>
                          </button>
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

                      {pendingAvatars.map((item, i) => (
                        <div className="relative size-24 overflow-hidden rounded-xl" key={`pending-${i}`}>
                          <img src={item.preview} alt="" className="size-24 rounded-xl object-cover opacity-50" />
                          <span className="absolute inset-0 grid place-items-center bg-foreground/30">
                            <Loader2 className="size-5 animate-spin text-background" />
                          </span>
                        </div>
                      ))}

                      {rejectedAvatars.map((item) => (
                        <div
                          key={item.id}
                          className="relative grid size-24 place-items-center rounded-xl border border-dashed border-destructive/60 bg-destructive/5 p-2 text-center"
                        >
                          <div>
                            <AlertTriangle className="mx-auto mb-1 size-4 text-destructive" />
                            <p className="line-clamp-2 text-[10px] font-semibold text-destructive">{item.reason}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Descartar arquivo"
                            className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-muted text-foreground shadow"
                            onClick={() => setRejectedAvatars((prev) => prev.filter((r) => r.id !== item.id))}
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
                    <div className="grid gap-3">
                      <p className="text-xs text-muted-foreground">
                        Envie de 1 a {MAX_AVATARS} fotos da mesma pessoa. JPG ou PNG, até 15 MB cada.{" "}
                        <span className="font-semibold text-foreground">3 boas fotos já bastam</span> — acima disso o ganho é pequeno.
                      </p>

                      <div className="rounded-xl border bg-muted/40 p-3">
                        <p className="mb-2 text-xs font-bold">Como devem ser as fotos</p>
                        <ul className="grid gap-1.5">
                          {AVATAR_TIPS.map((tip) => (
                            <li key={tip.text} className="flex gap-2 text-xs text-muted-foreground">
                              {tip.good ? (
                                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                              ) : (
                                <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span>{tip.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => { void pickAvatarFiles(e.target.files); e.target.value = ""; }}
                      />

                      {avatarItems.length >= MAX_AVATARS ? (
                        <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-6 text-center text-xs font-semibold text-muted-foreground">
                          Limite de {MAX_AVATARS} fotos atingido. Remova uma para enviar outra.
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!profile || uploadAvatars.isPending}
                          onClick={() => fileInput.current?.click()}
                          onDragOver={(e) => { e.preventDefault(); if (profile && !uploadAvatars.isPending) setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={onAvatarDrop}
                          className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary hover:bg-primary/5"
                          }`}
                        >
                          {uploadAvatars.isPending ? (
                            <Loader2 className="size-6 animate-spin text-primary" />
                          ) : (
                            <Upload className={`size-6 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                          )}
                          <span className="text-sm font-bold">
                            {uploadAvatars.isPending ? "Enviando fotos..." : "Arraste fotos aqui ou clique para enviar"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {avatarItems.length} de {MAX_AVATARS} · JPG ou PNG, até 15 MB cada
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="p-avatar-desc">Descrição do avatar <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea
                  id="p-avatar-desc"
                  rows={2}
                  value={form.avatarDescription}
                  onChange={(e) => setForm({ ...form, avatarDescription: e.target.value })}
                  placeholder="mulher, loira, cerca de 30 anos, sorridente"
                />
                <p className="text-xs text-muted-foreground">
                  Se houver fotos, elas têm prioridade. Sem fotos, a IA cria a pessoa a partir desta descrição. Sem nenhum dos dois, a pessoa é livre.
                </p>
              </div>
            </div>
          )}

          {tab === "avatares" && <ProfileAvatarsCard profileId={profile?.id ?? null} />}


          {tab === "voz" && (
            <div className="grid gap-4">
              <SectionTitle title="Voz da narração" description="Escolha a voz usada nos vídeos deste perfil. Vozes clonadas ou importadas aqui são suas e ficam disponíveis em todos os seus perfis." />
              <VoiceSelect profileId={profile?.id ?? null} value={form.voiceRef} canManage={allowed} onChange={(voiceRef) => setForm({ ...form, voiceRef })} />

            </div>
          )}

          {tab === "publicacao" && (
            <div className="grid gap-4">
              <SectionTitle title="Fluxo de publicação" description="Comportamento de publicação deste perfil." />
              <div>
                {profile?.id && <LerComentariosToggle profileId={profile.id} disabled={!allowed} />}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t py-4">
                  <div>
                    <p className="text-sm font-semibold">Revisão obrigatória</p>
                    <p className="text-xs text-muted-foreground">Exigir aprovação do rascunho antes de marcar como publicado</p>
                  </div>
                  <Switch
                    checked={form.requireReview}
                    onCheckedChange={(checked) => setForm({ ...form, requireReview: checked })}
                    disabled={!allowed}
                    aria-label="Revisão obrigatória"
                  />
                </div>
                {[
                  ["Alertas de tendência", "Sinalizar produtos com hype alto"],
                  ["Resumo semanal", "Receber um resumo de desempenho"],
                ].map(([title, description], index) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t py-4" key={title}>
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Switch defaultChecked={index < 1} aria-label={title} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "integracoes" && (
            <div className="grid gap-4">
              <SectionTitle
                title="Integrações"
                description={profile
                  ? "Contas externas ligadas a este perfil."
                  : "Salve o perfil primeiro para conectar contas externas."}
              />
              {profile && <TiktokIntegrationCard profileId={profile.id} canEdit={allowed} />}
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

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => { if (!open) closeLightbox(); }}>
        <DialogContent className="h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-none border-0 bg-foreground/95 p-3 text-background sm:p-6">
          <DialogTitle className="pr-12 text-sm font-semibold text-background">
            {lightboxIndex === null ? "Fotos" : `Foto ${lightboxIndex + 1} de ${avatarItems.length}`}
          </DialogTitle>
          {lightboxIndex !== null && avatarItems[lightboxIndex] && (
            <div className="relative flex min-h-0 items-center justify-center px-11">
              {avatarItems.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-0 z-10 rounded-full"
                  onClick={prevLightbox}
                  aria-label="Foto anterior"
                >
                  <ChevronLeft />
                </Button>
              )}
              <img
                src={avatarItems[lightboxIndex].preview}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain"
              />
              {avatarItems.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-0 z-10 rounded-full"
                  onClick={nextLightbox}
                  aria-label="Próxima foto"
                >
                  <ChevronRight />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ProfileImageCropper
        source={profileImageSource}
        open={profileImageCropOpen}
        saving={profileImageUpload.isPending}
        onOpenChange={(open) => { setProfileImageCropOpen(open); if (!open) setProfileImageSource(null); }}
        onSave={(base64) => profileImageUpload.mutate(base64)}
      />
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

function ColetaAlerta({ profileId }: { profileId: string }) {
  const { data } = useQuery({
    queryKey: ["metricas-coleta", profileId],
    queryFn: async () => (await supabase.from("metricas_coleta").select("status, ultimo_erro").eq("profile_id", profileId).maybeSingle()).data,
  });
  if (data?.status !== "erro" || !data.ultimo_erro) return null;
  return <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-ink">Métricas: {data.ultimo_erro}</p>;
}
