import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, ChevronRight, ImageOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { DbJob } from "@/lib/content";
import { regenerateJobScene, sceneTags } from "@/lib/video.functions";
import { actionError } from "@/lib/api-keys";
import { useProfileAvatars } from "@/components/avatar-library";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

/** Aviso: várias pessoas específicas na mesma imagem é difícil para a IA. */
function MultiPersonaHint({ text }: { text: string }) {
  if (sceneTags(text).length < 2) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      Esta cena tem mais de uma pessoa marcada. Juntar várias pessoas específicas na mesma imagem é difícil para a IA:
      pode ser preciso regerar a cena algumas vezes até sair certo.
    </p>
  );
}

/** Revisão humana das cenas geradas (imagens baratas) antes de animar no Veo. */
export function JobScenesReview({ job, canEdit }: { job: DbJob; canEdit: boolean }) {
  const qc = useQueryClient();
  const regenerate = useServerFn(regenerateJobScene);
  const { data: personas = [] } = useProfileAvatars(job.profile_id);
  const [prompts, setPrompts] = useState<Record<number, string>>({});
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [approved, setApproved] = useState<Set<number>>(
    () => new Set((job.scenes ?? []).flatMap((scene, index) => scene.approved ? [index] : [])),
  );
  const scenes = job.scenes ?? [];

  const run = useMutation({
    mutationFn: async (index: number) => {
      setBusyIndex(index);
      const prompt = prompts[index]?.trim();
      return regenerate({ data: { jobId: job.id, index, ...(prompt ? { prompt } : {}) } });
    },
    onSuccess: (_, index) => {
      setApproved((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
      toast.success("Cena gerada.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setBusyIndex(null),
  });

  const approve = useMutation({
    mutationFn: async (index: number) => {
      const nextScenes = scenes.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, approved: true } : scene,
      );
      const { error } = await supabase.from("jobs").update({ scenes: nextScenes }).eq("id", job.id);
      if (error) throw new Error(error.message);
      return index;
    },
    onSuccess: (index) => {
      setApproved((current) => new Set(current).add(index));
      toast.success(`Cena ${index + 1} aprovada.`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  useEffect(() => {
    setApproved(new Set(scenes.flatMap((scene, index) => scene.approved ? [index] : [])));
  }, [job.id, job.scenes]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLightboxIndex((current) => current === null ? null : (current - 1 + scenes.length) % scenes.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setLightboxIndex((current) => current === null ? null : (current + 1) % scenes.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, scenes.length]);

  if (!scenes.length) return null;

  const faltando = scenes.filter((scene) => !scene.image_url).length;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Revise as cenas antes de animar. Regerar uma imagem é barato; a animação é a parte cara.
      </p>
      {personas.some((p) => p.tag) && (
        <div className="rounded-xl border bg-secondary/50 px-4 py-3 text-xs">
          <p className="font-bold">Pessoas deste perfil</p>
          <p className="mt-1 text-muted-foreground">
            Escreva a etiqueta na descrição da cena para colocar a pessoa na imagem, ex.{" "}
            <code className="rounded bg-background px-1">{`{{${personas.find((p) => p.tag)!.tag}}} segura o produto`}</code>.
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {personas.filter((p) => p.tag).map((p) => (
              <code key={p.id} className="rounded bg-background px-1.5 py-0.5 font-bold">{`{{${p.tag}}}`}</code>
            ))}
          </p>
        </div>
      )}
      {faltando > 0 && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {faltando === 1 ? "1 cena ficou sem imagem" : `${faltando} cenas ficaram sem imagem`}. As demais já estão
          prontas e serão mantidas — refaça só as que faltam pelo botão “Tentar novamente”.
        </p>
      )}
      {scenes.map((scene, index) => (
        <div
          className={`grid gap-3 rounded-2xl border p-3 sm:grid-cols-[120px_minmax(0,1fr)] ${scene.image_url ? "" : "border-destructive/40 bg-destructive/5"}`}
          key={index}
        >
          {scene.image_url ? (
            <Button
              type="button"
              variant="ghost"
              className="group relative h-auto w-full overflow-hidden rounded-xl p-0 focus-visible:ring-offset-2"
              onClick={() => setLightboxIndex(index)}
              aria-label={`Ampliar cena ${index + 1}`}
            >
              <img src={scene.image_url} alt={`Cena ${index + 1}`} className="aspect-[9/16] w-full object-cover transition-transform group-hover:scale-[1.02]" />
              <span className="absolute inset-x-0 bottom-0 bg-foreground/70 px-2 py-1.5 text-center text-xs font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                Ver em tela cheia
              </span>
            </Button>
          ) : (
            <div className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-destructive/40 bg-secondary px-2 text-center text-xs font-semibold text-destructive">
              <ImageOff className="size-5" />
              sem imagem
            </div>
          )}
          <div className="grid content-start gap-2">
            <p className="text-xs font-bold uppercase text-muted-foreground">Cena {index + 1}</p>
            <p className="text-sm">{scene.narration}</p>
            <Label htmlFor={`scene-${index}`} className="mt-1">Descrição da imagem</Label>
            <Textarea
              id={`scene-${index}`}
              rows={3}
              value={prompts[index] ?? scene.image_prompt}
              onChange={(e) => setPrompts((p) => ({ ...p, [index]: e.target.value }))}
              disabled={!canEdit || busyIndex !== null}
            />
            <MultiPersonaHint text={prompts[index] ?? scene.image_prompt} />
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {scene.image_url && (
                  <Button
                    size="sm"
                    variant={approved.has(index) ? "secondary" : "default"}
                    disabled={busyIndex !== null || approve.isPending || approved.has(index)}
                    onClick={() => approve.mutate(index)}
                  >
                    <Check />{approved.has(index) ? "Cena aprovada" : "Aprovar cena"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={scene.image_url ? "outline" : "default"}
                  disabled={busyIndex !== null || approve.isPending}
                  onClick={() => run.mutate(index)}
                >
                  {busyIndex === index
                    ? <><Loader2 className="animate-spin" />Gerando...</>
                    : <><RefreshCw />{scene.image_url ? "Regerar esta cena" : "Tentar novamente"}</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
        <DialogContent className="max-h-dvh w-screen max-w-none gap-3 overflow-y-auto rounded-none border-0 bg-foreground/95 p-3 text-background sm:p-6 [scrollbar-gutter:stable]">
          <DialogTitle className="pr-12 text-sm font-semibold text-background">
            {lightboxIndex === null ? "Cenas do job" : `Cena ${lightboxIndex + 1} de ${scenes.length}`}
          </DialogTitle>
          {lightboxIndex !== null && scenes[lightboxIndex] && (
            <div className="grid min-h-0 grid-rows-[minmax(280px,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:grid-rows-1">
              <div className="relative flex min-h-0 items-center justify-center px-11">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-0 z-10 rounded-full"
                  onClick={() => setLightboxIndex((lightboxIndex - 1 + scenes.length) % scenes.length)}
                  aria-label="Cena anterior"
                >
                  <ChevronLeft />
                </Button>
                <img
                  src={scenes[lightboxIndex].image_url}
                  alt={`Cena ${lightboxIndex + 1}`}
                  className="h-full max-h-[72vh] w-auto max-w-full rounded-xl object-contain"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-0 z-10 rounded-full"
                  onClick={() => setLightboxIndex((lightboxIndex + 1) % scenes.length)}
                  aria-label="Próxima cena"
                >
                  <ChevronRight />
                </Button>
              </div>
              <div className="grid content-start gap-3 rounded-xl bg-background p-4 text-foreground">
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Cena {lightboxIndex + 1} de {scenes.length}</p>
                  <p className="mt-2 text-sm">{scenes[lightboxIndex].narration}</p>
                </div>
                <Label htmlFor={`lightbox-scene-${lightboxIndex}`}>Descrição da imagem</Label>
                <Textarea
                  id={`lightbox-scene-${lightboxIndex}`}
                  rows={7}
                  value={prompts[lightboxIndex] ?? scenes[lightboxIndex].image_prompt}
                  onChange={(event) => setPrompts((current) => ({ ...current, [lightboxIndex]: event.target.value }))}
                  disabled={!canEdit || busyIndex !== null}
                />
                <MultiPersonaHint text={prompts[lightboxIndex] ?? scenes[lightboxIndex].image_prompt} />
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={approved.has(lightboxIndex) ? "secondary" : "default"}
                      disabled={busyIndex !== null || approve.isPending || approved.has(lightboxIndex)}
                      onClick={() => approve.mutate(lightboxIndex)}
                    >
                      <Check />{approved.has(lightboxIndex) ? "Cena aprovada" : "Aprovar cena"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyIndex !== null || approve.isPending}
                      onClick={() => run.mutate(lightboxIndex)}
                    >
                      {busyIndex === lightboxIndex ? <><Loader2 className="animate-spin" />Regerando...</> : <><RefreshCw />Regerar esta cena</>}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
