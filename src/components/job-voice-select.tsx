import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoicePlayButton } from "@/components/voice-play-button";
import { supabase } from "@/integrations/supabase/client";
import { FONTE_LABELS, GENERO_LABELS, useVoices, type VoiceGenero } from "@/lib/voices";
import type { DbJob } from "@/lib/content";
import { useQuery } from "@tanstack/react-query";

const FILTROS: { value: VoiceGenero | "todos"; label: string }[] = [
  { value: "todos", label: "Todos os gêneros" },
  { value: "feminino", label: "Feminina" },
  { value: "masculino", label: "Masculina" },
  { value: "neutro", label: "Neutra" },
];

/** Voz padrão configurada no perfil do job. */
function useProfileVoiceRef(profileId: string | null) {
  return useQuery({
    queryKey: ["profile-voice-ref", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profile_video_settings")
        .select("voice_ref")
        .eq("profile_id", profileId!)
        .maybeSingle();
      return (data?.voice_ref ?? null) as string | null;
    },
  });
}

/**
 * Seleção da voz de narração DESTE vídeo. Null = usa a voz do perfil.
 * Trocar a voz depois da narração gerada faz a montagem regerar os áudios.
 */
export function JobVoiceSelect({ job, canEdit }: { job: DbJob; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: voices = [] } = useVoices(job.profile_id);
  const { data: profileVoiceRef = null } = useProfileVoiceRef(job.profile_id);
  const [genero, setGenero] = useState<VoiceGenero | "todos">("todos");
  const [pendente, setPendente] = useState<string | null | undefined>(undefined);

  const lista = useMemo(
    () => voices.filter((v) => genero === "todos" || v.genero === genero),
    [voices, genero],
  );

  const vozDoPerfil = voices.find((v) => v.id === profileVoiceRef) ?? null;
  const efetiva = job.voice_ref ? voices.find((v) => v.id === job.voice_ref) ?? null : vozDoPerfil;
  const jaNarrado = (job.scenes ?? []).some((s) => !!(s as { audio_url?: string }).audio_url);

  const salvar = useMutation({
    mutationFn: async (voiceRef: string | null) => {
      const { error } = await supabase.from("jobs").update({ voice_ref: voiceRef }).eq("id", job.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Voz do vídeo atualizada.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar a voz."),
  });

  const escolher = (valor: string | null) => {
    if (valor === (job.voice_ref ?? null)) return;
    if (jaNarrado) setPendente(valor);
    else salvar.mutate(valor);
  };

  return (
    <div className="space-y-1.5 rounded-xl bg-secondary/60 p-4">
      <Label>Voz da narração</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={genero} onValueChange={(v) => setGenero(v as VoiceGenero | "todos")}>
          <SelectTrigger className="w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={job.voice_ref ?? "perfil"}
          disabled={!canEdit || salvar.isPending}
          onValueChange={(v) => escolher(v === "perfil" ? null : v)}
        >
          <SelectTrigger className="min-w-[200px] flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="perfil">Usar voz do perfil</SelectItem>
            {lista.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nome} · {v.genero ? GENERO_LABELS[v.genero] : "—"} · {FONTE_LABELS[v.fonte]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <VoicePlayButton voiceRowId={efetiva?.id ?? null} previewUrl={efetiva?.preview_url ?? null} />
      </div>
      <p className="text-xs text-muted-foreground">
        {job.voice_ref
          ? `Só neste vídeo: ${efetiva?.nome ?? "voz escolhida"}.`
          : efetiva
            ? `Usando voz do perfil: ${efetiva.nome}.`
            : "Usando a voz padrão do idioma configurada no perfil."}
      </p>

      <AlertDialog open={pendente !== undefined} onOpenChange={(o) => !o && setPendente(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar a voz deste vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              A narração deste vídeo já foi gerada. Ao trocar a voz, os áudios das cenas serão
              gerados de novo na próxima montagem, o que tem custo adicional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                salvar.mutate(pendente ?? null);
                setPendente(undefined);
              }}
            >
              Trocar e regerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
