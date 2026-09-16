import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DbJob } from "@/lib/content";
import { regenerateJobScene } from "@/lib/video.functions";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

/** Revisão humana das cenas geradas (imagens baratas) antes de animar no Veo. */
export function JobScenesReview({ job, canEdit }: { job: DbJob; canEdit: boolean }) {
  const qc = useQueryClient();
  const regenerate = useServerFn(regenerateJobScene);
  const [prompts, setPrompts] = useState<Record<number, string>>({});
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const scenes = job.scenes ?? [];

  const run = useMutation({
    mutationFn: async (index: number) => {
      setBusyIndex(index);
      const prompt = prompts[index]?.trim();
      return regenerate({ data: { jobId: job.id, index, ...(prompt ? { prompt } : {}) } });
    },
    onSuccess: () => { toast.success("Cena regerada."); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setBusyIndex(null),
  });

  if (!scenes.length) return null;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Revise as cenas antes de animar. Regerar uma imagem é barato; a animação é a parte cara.
      </p>
      {scenes.map((scene, index) => (
        <div className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[120px_minmax(0,1fr)]" key={index}>
          {scene.image_url ? (
            <img src={scene.image_url} alt={`Cena ${index + 1}`} className="aspect-[9/16] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center rounded-xl bg-secondary text-xs text-muted-foreground">
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
            {canEdit && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyIndex !== null}
                  onClick={() => run.mutate(index)}
                >
                  {busyIndex === index ? <><Loader2 className="animate-spin" />Regerando...</> : <><RefreshCw />Regerar esta cena</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
