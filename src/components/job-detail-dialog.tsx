import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Images, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS_LABELS, type DbJob } from "@/lib/content";
import { generateJobScript } from "@/lib/script.functions";
import { RENDER_STAGE_LABELS, approveJobScenes, generateJobScenes } from "@/lib/video.functions";
import { JobScenesReview } from "./job-scenes-review";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");


export function JobDetailDialog({
  job,
  productName,
  canEdit,
  onOpenChange,
}: {
  job: DbJob | null;
  productName: string;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateJobScript);
  const generateScenes = useServerFn(generateJobScenes);
  const approveScenes = useServerFn(approveJobScenes);

  const [script, setScript] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  useEffect(() => {
    if (!job) return;
    setScript(job.script ?? "");
    setCaption(job.caption ?? "");
    setHashtags((job.hashtags ?? []).join(" "));
  }, [job]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs"] });

  const runGenerate = useMutation({
    mutationFn: async (jobId: string) => generate({ data: { jobId } }),
    onSuccess: (result) => {
      setScript(`GANCHO (0-3s)\n${result.hook}\n\nCORPO\n${result.body}\n\nCTA\n${result.cta}`);
      setCaption(result.caption);
      setHashtags(result.hashtags.join(" "));
      toast.success("Roteiro gerado.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const runScenes = useMutation({
    mutationFn: async (jobId: string) => generateScenes({ data: { jobId } }),
    onSuccess: () => { toast.success("Geração das cenas iniciada."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const runApprove = useMutation({
    mutationFn: async (jobId: string) => approveScenes({ data: { jobId } }),
    onSuccess: () => { toast.success("Cenas aprovadas. Gerando o vídeo."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });


  const save = useMutation({
    mutationFn: async (jobId: string) => {
      const tags = hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
      const { error } = await supabase
        .from("jobs")
        .update({ script: script.trim() || null, caption: caption.trim() || null, hashtags: tags })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Roteiro salvo."); refresh(); onOpenChange(false); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const busy = runGenerate.isPending;
  const hasScript = !!(job?.script || script.trim());

  return (
    <Dialog open={!!job} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{job?.title || productName}</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 grid gap-4 overflow-y-auto px-1 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-foreground">
              {job ? JOB_STATUS_LABELS[job.status] : ""}
            </span>
            <span>{productName}</span>
          </div>

          {job?.video_url && (
            <video src={job.video_url} controls playsInline poster={job.video_thumbnail_url ?? undefined} className="mx-auto max-h-[300px] rounded-xl bg-black" />
          )}
          {job?.status === "gerando_video" && (
            <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {(job.render_stage && RENDER_STAGE_LABELS[job.render_stage]) ?? "Renderizando o vídeo"}... o card avança sozinho quando ficar pronto.
            </div>
          )}
          {job?.render_error && (
            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-destructive">{job.render_error}</p>
          )}

          {busy ? (
            <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Gerando roteiro com inteligência artificial...
            </div>
          ) : hasScript ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="j-script">Roteiro (gancho, corpo e CTA)</Label>
                <Textarea id="j-script" rows={10} value={script} onChange={(e) => setScript(e.target.value)} disabled={!canEdit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="j-caption">Legenda sugerida</Label>
                <Textarea id="j-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!canEdit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="j-tags">Hashtags</Label>
                <Input id="j-tags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} disabled={!canEdit} placeholder="tiktokshop achadinhos" />
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este job ainda não tem roteiro. {canEdit ? "Gere um com a inteligência artificial." : "Você não tem permissão para gerar."}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Fechar</Button>
          {canEdit && (
            <>
              <Button variant="outline" disabled={busy || !job} onClick={() => job && runGenerate.mutate(job.id)}>
                {hasScript ? <><RefreshCw />Regenerar</> : <><Sparkles />Gerar roteiro</>}
              </Button>
              {job?.status === "roteiro_pronto" && (
                <Button variant="outline" disabled={runVideo.isPending} onClick={() => runVideo.mutate(job.id)}>
                  {runVideo.isPending ? <><Loader2 className="animate-spin" />Enviando...</> : <><Clapperboard />{job.render_error ? "Tentar de novo" : "Gerar vídeo"}</>}
                </Button>
              )}
              {hasScript && (
                <Button disabled={save.isPending || busy} onClick={() => job && save.mutate(job.id)}>Salvar</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
