import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { actionError } from "@/lib/api-keys";
import { setJobVisualStyle } from "@/lib/visual-style.functions";
import { isVisualStyle, VISUAL_STYLE_OPTIONS, visualStyleLabel, type VisualStyle } from "@/lib/visual-style";

type JobStyleRow = { visual_style_override: string | null; visual_style_custom: string | null };
type ProfileStyleRow = { visual_style: string; visual_style_custom: string | null };

export function JobVisualStyleSelect({ jobId, profileId, canEdit }: { jobId: string; profileId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const saveStyle = useServerFn(setJobVisualStyle);
  const { data } = useQuery({
    queryKey: ["job-visual-style", jobId],
    queryFn: async () => {
      const [jobResult, profileResult] = await Promise.all([
        supabase.from("jobs").select("visual_style_override, visual_style_custom").eq("id", jobId).maybeSingle(),
        supabase.from("profile_video_settings").select("visual_style, visual_style_custom").eq("profile_id", profileId).maybeSingle(),
      ]);
      if (jobResult.error) throw new Error(jobResult.error.message);
      if (profileResult.error) throw new Error(profileResult.error.message);
      return {
        job: (jobResult.data ?? null) as JobStyleRow | null,
        profile: (profileResult.data ?? null) as ProfileStyleRow | null,
      };
    },
  });

  const [style, setStyle] = useState<VisualStyle | "perfil">("perfil");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    const override = data?.job?.visual_style_override;
    setStyle(isVisualStyle(override) ? override : "perfil");
    setCustom(data?.job?.visual_style_custom ?? "");
  }, [data?.job?.visual_style_override, data?.job?.visual_style_custom]);

  const save = useMutation({
    mutationFn: () => saveStyle({ data: { jobId, style: style === "perfil" ? null : style, custom: style === "personalizado" ? custom : null } }),
    onSuccess: () => {
      toast.success("Estilo deste vídeo atualizado.");
      qc.invalidateQueries({ queryKey: ["job-visual-style", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => toast.error(actionError(error, "Não foi possível salvar o estilo.")),
  });

  const profileStyle = isVisualStyle(data?.profile?.visual_style) ? data.profile.visual_style : "realista";
  const profileLabel = profileStyle === "personalizado"
    ? data?.profile?.visual_style_custom || "Personalizado"
    : visualStyleLabel(profileStyle);

  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-black">Estilo visual deste vídeo</p>
        <p className="mt-1 text-xs text-muted-foreground">Escolha um estilo só para este vídeo ou mantenha o padrão do perfil.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`job-style-${jobId}`}>Estilo visual</Label>
        <Select value={style} onValueChange={(value) => setStyle(value as VisualStyle | "perfil")} disabled={!canEdit}>
          <SelectTrigger id={`job-style-${jobId}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="perfil">Padrão do perfil — {profileLabel}</SelectItem>
            {VISUAL_STYLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {style === "personalizado" && (
        <div className="grid gap-2">
          <Label htmlFor={`job-style-custom-${jobId}`}>Descrição do estilo</Label>
          <Textarea id={`job-style-custom-${jobId}`} rows={3} maxLength={500} value={custom} disabled={!canEdit} onChange={(event) => setCustom(event.target.value)} placeholder="Ex: colagem editorial com papel recortado, textura impressa e cores vibrantes" />
        </div>
      )}
      {canEdit && (
        <Button variant="secondary" className="justify-self-start" disabled={save.isPending || (style === "personalizado" && !custom.trim())} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="animate-spin" />}Usar este estilo
        </Button>
      )}
    </section>
  );
}