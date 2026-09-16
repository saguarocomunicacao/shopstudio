import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useVideoSettings } from "@/lib/content";
import { generateAvatarReference } from "@/lib/video.functions";
import { useStudio } from "./studio-context";

const GEMINI_MODELS = [
  { value: "gemini-3.1-flash-image", label: "Equilibrado (padrão)" },
  { value: "gemini-3.1-flash-lite-image", label: "Econômico" },
  { value: "gemini-3-pro-image", label: "Máxima qualidade" },
];

const VEO_MODELS = [
  { value: "veo-3.1-fast-generate-preview", label: "Rápido e econômico (padrão)" },
  { value: "veo-3.1-generate-preview", label: "Alta qualidade" },
];

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

export function VideoSettingsCard() {
  const { activeProfile, can } = useStudio();
  const profileId = activeProfile?.id ?? null;
  const { data: settings } = useVideoSettings(profileId);
  const qc = useQueryClient();
  const generateAvatar = useServerFn(generateAvatarReference);
  const canEdit = !!profileId && can("perfis", "editar", profileId);

  const [avatarMode, setAvatarMode] = useState("livre");
  const [takes, setTakes] = useState("3");
  const [geminiModel, setGeminiModel] = useState(GEMINI_MODELS[0]!.value);
  const [veoModel, setVeoModel] = useState(VEO_MODELS[0]!.value);
  const [duration, setDuration] = useState("8");
  const [avatarDescription, setAvatarDescription] = useState("");

  useEffect(() => {
    setAvatarMode(settings?.avatar_mode ?? "livre");
    setTakes(String(settings?.takes_count ?? 3));
    setGeminiModel(settings?.gemini_model ?? GEMINI_MODELS[0]!.value);
    setVeoModel(settings?.veo_model ?? VEO_MODELS[0]!.value);
    setDuration(String(settings?.take_duration ?? 8));
  }, [settings, profileId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profileId) return;
      const { error } = await supabase.from("profile_video_settings").upsert(
        {
          profile_id: profileId,
          avatar_mode: avatarMode,
          takes_count: Number(takes),
          gemini_model: geminiModel,
          veo_model: veoModel,
          take_duration: Number(duration),
        },
        { onConflict: "profile_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração de vídeo salva.");
      qc.invalidateQueries({ queryKey: ["video-settings", profileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const avatar = useMutation({
    mutationFn: async () => generateAvatar({ data: { profileId: profileId!, description: avatarDescription } }),
    onSuccess: () => {
      toast.success("Pessoa de referência criada.");
      qc.invalidateQueries({ queryKey: ["video-settings", profileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  if (!profileId) {
    return (
      <section className="panel">
        <h2 className="font-bold">Geração de vídeo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha um perfil no topo para configurar a produção de vídeo.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="font-bold">Geração de vídeo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Todo vídeo deste perfil mostra uma pessoa ou mão usando o produto. Aqui você define como isso é produzido.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Pessoa do vídeo</Label>
          <Select value={avatarMode} onValueChange={setAvatarMode} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="livre">Pessoa nova a cada vídeo</SelectItem>
              <SelectItem value="fixo">Sempre a mesma pessoa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Cenas por vídeo</Label>
          <Select value={takes} onValueChange={setTakes} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} cenas</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Duração de cada cena</Label>
          <Select value={duration} onValueChange={setDuration} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[4, 6, 8].map((n) => <SelectItem key={n} value={String(n)}>{n} segundos</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Qualidade das cenas</Label>
          <Select value={geminiModel} onValueChange={setGeminiModel} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GEMINI_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label>Qualidade da animação</Label>
          <Select value={veoModel} onValueChange={setVeoModel} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEO_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {avatarMode === "fixo" && (
        <div className="mt-5 border-t pt-5">
          <p className="text-sm font-semibold">Pessoa fixa do perfil</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Uma imagem de referência reutilizada em todos os vídeos para manter a mesma cara.
          </p>
          <div className="flex items-start gap-4">
            {settings?.avatar_reference_url && (
              <img src={settings.avatar_reference_url} alt="" className="size-24 rounded-xl object-cover" />
            )}
            <div className="grid flex-1 gap-2">
              <Input
                value={avatarDescription}
                onChange={(e) => setAvatarDescription(e.target.value)}
                placeholder="mulher brasileira de 28 anos, cabelo cacheado, estilo casual"
                disabled={!canEdit}
              />
              <Button
                variant="secondary"
                className="justify-self-start"
                disabled={!canEdit || avatar.isPending || avatarDescription.trim().length < 3}
                onClick={() => avatar.mutate()}
              >
                {avatar.isPending ? <><Loader2 className="animate-spin" />Criando...</> : <><Sparkles />Criar pessoa</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="mt-5 flex justify-end border-t pt-4">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <><Loader2 className="animate-spin" />Salvando...</> : "Salvar"}
          </Button>
        </div>
      )}
    </section>
  );
}
