import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Clapperboard, Images, Loader2, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS_LABELS, type DbJob } from "@/lib/content";
import { generateJobScript } from "@/lib/script.functions";
import { RENDER_STAGE_LABELS, approveJobScenes, generateJobScenes } from "@/lib/video.functions";
import { approveDraft } from "@/lib/drafts.functions";
import { JobScenesReview } from "./job-scenes-review";
import { JobTimeline } from "./job-timeline";
import { JobCostSummary } from "./job-cost";
import { JobVoiceSelect } from "./job-voice-select";
import { SharePanel } from "./share-panel";
import { brl } from "@/lib/custo";
import { useEstimativaVeo, useGastoMes } from "@/lib/orcamento";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

/** A partir de "vídeo pronto" o job já pode ser compartilhado por link público. */
const SHAREABLE_STATUS: DbJob["status"][] = ["video_pronto", "rascunho_enviado", "publicado"];


export function JobDetailDialog({
  job,
  productName,
  canEdit,
  canDelete,
  onDelete,
  canStepBack,
  onStepBack,
  onOpenChange,
}: {
  job: DbJob | null;
  productName: string;
  canEdit: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
  canStepBack?: boolean;
  onStepBack?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateJobScript);
  const generateScenes = useServerFn(generateJobScenes);
  const approveScenes = useServerFn(approveJobScenes);
  const approveRascunho = useServerFn(approveDraft);

  const [confirmVeo, setConfirmVeo] = useState(false);
  const cenas = Array.isArray(job?.scenes) ? (job!.scenes as unknown[]).length : 0;
  const estimativa = useEstimativaVeo(job?.profile_id ?? null, cenas);
  const gasto = useGastoMes(job?.profile_id ?? null);
  const orcamentoEstourado = !!gasto?.bloqueado;

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
    onSuccess: () => { toast.success("Cenas aprovadas. Gerando o vídeo."); setConfirmVeo(false); refresh(); },
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

  const runApproveDraft = useMutation({
    mutationFn: async (jobId: string) => approveRascunho({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo aprovado para postagem. Ele continua na fila de Rascunhos, na aba Aprovados.");
      refresh();
      onOpenChange(false);
    },
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
          {job && SHAREABLE_STATUS.includes(job.status) && (
            job.video_path ? (
              <SharePanel jobId={job.id} />
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Preparando o vídeo para compartilhar, aguarde alguns instantes.
              </p>
            )
          )}
          {(job?.status === "gerando_video" || (job?.status === "roteiro_pronto" && job.render_stage)) && (
            <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {(job.render_stage && RENDER_STAGE_LABELS[job.render_stage]) ?? "Renderizando o vídeo"}... o card avança sozinho quando ficar pronto.
            </div>
          )}
          {job?.render_error && (
            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-destructive">{job.render_error}</p>
          )}
          {job && (job.scenes?.length ?? 0) > 0 && (
            <JobScenesReview
              job={job}
              canEdit={
                canEdit &&
                (job.status === "cenas_geradas" || (job.status === "roteiro_pronto" && !job.render_stage))
              }
            />
          )}

          {job && <JobVoiceSelect job={job} canEdit={canEdit} />}
          {job && <JobCostSummary jobId={job.id} />}
          {job && <JobTimeline jobId={job.id} />}


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
        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {canDelete && onDelete && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onDelete(); }}>
                <Trash2 />Excluir
              </Button>
            )}
            {canStepBack && onStepBack && (
              <Button variant="outline" onClick={() => { onOpenChange(false); onStepBack(); }}>
                <Undo2 />Voltar etapa
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Fechar</Button>
          {canEdit && (
            <>
              <Button variant="outline" disabled={busy || !job} onClick={() => job && runGenerate.mutate(job.id)}>
                {hasScript ? <><RefreshCw />Regenerar</> : <><Sparkles />Gerar roteiro</>}
              </Button>
              {job?.status === "roteiro_pronto" && !job.render_stage && (
                <Button variant="outline" disabled={runScenes.isPending} onClick={() => runScenes.mutate(job.id)}>
                  {runScenes.isPending ? <><Loader2 className="animate-spin" />Enviando...</> : <><Images />{job.render_error ? ((job.scenes ?? []).some((s) => s.image_url) ? "Gerar as cenas que faltam" : "Tentar de novo") : "Gerar cenas"}</>}
                </Button>
              )}
              {job?.status === "cenas_geradas" && (
                <Button
                  disabled={runApprove.isPending || orcamentoEstourado}
                  title={orcamentoEstourado ? "O orçamento do mês foi atingido." : undefined}
                  onClick={() => setConfirmVeo(true)}
                >
                  {runApprove.isPending ? <><Loader2 className="animate-spin" />Enviando...</> : <><Clapperboard />Aprovar e gerar vídeo</>}
                </Button>
              )}

              {hasScript && (
                <Button disabled={save.isPending || busy} onClick={() => job && save.mutate(job.id)}>Salvar</Button>
              )}
            </>
          )}
          </div>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmVeo} onOpenChange={setConfirmVeo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar a geração do vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              {estimativa ? (
                <>
                  Esta geração vai custar aproximadamente <strong>{brl(estimativa.totalBrl)}</strong> (animação{" "}
                  {brl(estimativa.veoBrl)} + montagem {brl(estimativa.montagemBrl)}), com {estimativa.cenas}{" "}
                  {estimativa.cenas === 1 ? "cena" : "cenas"} e {estimativa.segundos} segundos de vídeo.
                  {estimativa.semTarifa && " Falta tarifa cadastrada para parte do cálculo, então o valor pode estar incompleto."}
                </>
              ) : (
                "Não foi possível estimar o custo desta geração."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={runApprove.isPending || orcamentoEstourado}
              onClick={(e) => { e.preventDefault(); if (job) runApprove.mutate(job.id); }}
            >
              {runApprove.isPending ? "Enviando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
