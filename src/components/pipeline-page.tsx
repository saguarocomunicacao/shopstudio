import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Clapperboard, Images, Loader2, Sparkles, Trash2, Undo2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUSES, JOB_STATUS_LABELS, PREVIOUS_STATUS, jobStatusLabel, relativeTime, useJobs, useProducts, type DbJob } from "@/lib/content";
import { generateJobScript } from "@/lib/script.functions";
import { RENDER_STAGE_LABELS, generateJobScenes } from "@/lib/video.functions";
import { useVideoDriver } from "@/lib/video-driver";
import { sweepProfileVideos } from "@/lib/drafts.functions";
import { JobDetailDialog } from "./job-detail-dialog";
import { RecordingKitDialog } from "./recording-kit";
import { JobCostBadge } from "./job-cost";
import { SupplierBalanceBanner } from "./supplier-balance-banner";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";
import { useDragScroll } from "./use-drag-scroll";
import { actionError } from "@/lib/api-keys";

const statusClass: Record<string, string> = {
  novo: "status-neutral",
  produto_escolhido: "status-blue",
  roteiro_pronto: "status-violet",
  gerando_cenas: "status-cyan",
  cenas_geradas: "status-orange",
  gerando_video: "status-cyan",
  video_pronto: "status-lime",
  rascunho_enviado: "status-orange",
  publicado: "status-pink",
};


const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

export function PipelinePage() { return <ProfileGate><PipelineContent /></ProfileGate>; }

/** Rede de segurança: ao abrir o Pipeline, salva vídeos que ficaram sem cópia local. */
function usePendingVideoSweep(profileId: string | null) {
  const sweep = useServerFn(sweepProfileVideos);
  const qc = useQueryClient();
  useEffect(() => {
    if (!profileId) return;
    let cancel = false;
    sweep({ data: { profileId } })
      .then((r) => {
        if (!cancel && r.processados > 0) qc.invalidateQueries({ queryKey: ["jobs"] });
      })
      .catch((e) => console.error("[video-storage] varredura do perfil falhou:", e));
    return () => {
      cancel = true;
    };
  }, [profileId, sweep, qc]);
}

function PipelineContent() {
  const { activeProfileId, profiles, can } = useStudio();
  const kanbanRef = useDragScroll<HTMLDivElement>();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useJobs(activeProfileId, can("pipeline", "visualizar"));
  const { data: products = [] } = useProducts(activeProfileId, can("produtos", "visualizar"));
  const [detail, setDetail] = useState<DbJob | null>(null);
  const [recording, setRecording] = useState<DbJob | null>(null);
  const generate = useServerFn(generateJobScript);
  const generateScenes = useServerFn(generateJobScenes);
  useVideoDriver(jobs);
  usePendingVideoSweep(activeProfileId);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);


  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "Sem produto";
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const canEditJob = (job: DbJob) => can("pipeline", "editar", job.profile_id) || can("pipeline", "criar", job.profile_id);
  const canRemoveJob = (job: DbJob) => can("pipeline", "remover", job.profile_id);
  const canStepBack = (job: DbJob) => can("pipeline", "editar", job.profile_id) && !!PREVIOUS_STATUS[job.status];
  const [deleting, setDeleting] = useState<DbJob | null>(null);
  const [reverting, setReverting] = useState<DbJob | null>(null);

  const stepBack = useMutation({
    mutationFn: async (job: DbJob) => {
      const previous = PREVIOUS_STATUS[job.status];
      if (!previous) throw new Error("Este job já está na primeira etapa.");
      // Só muda o status: roteiro, cenas e vídeo continuam salvos no job.
      const { error } = await supabase.from("jobs").update({ status: previous, render_error: null }).eq("id", job.id);
      if (error) throw new Error(error.message);
      return previous;
    },
    onSuccess: (previous) => {
      toast.success(`Job movido para "${JOB_STATUS_LABELS[previous]}".`);
      setReverting(null);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const removeJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", jobId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Job excluído.");
      setDeleting(null);
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const runGenerate = useMutation({
    mutationFn: async (jobId: string) => {
      setGeneratingId(jobId);
      return generate({ data: { jobId } });
    },
    onSuccess: () => { toast.success("Roteiro gerado."); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setGeneratingId(null),
  });

  const runScenes = useMutation({
    mutationFn: async (jobId: string) => {
      setRenderingId(jobId);
      return generateScenes({ data: { jobId } });
    },
    onSuccess: () => { toast.success("Geração das cenas iniciada."); qc.invalidateQueries({ queryKey: ["jobs"] }); },

    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setRenderingId(null),
  });

  const filtered = jobs;
  const current = detail ? jobs.find((j) => j.id === detail.id) ?? detail : null;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 lg:h-[calc(100vh-8.5rem)]">
      <div className="mb-2">
        <p className="mb-1 text-xs font-bold uppercase text-primary">Produção</p>
        <h1 className="truncate text-2xl font-black sm:text-3xl">Pipeline de conteúdo</h1>
      </div>
      <SupplierBalanceBanner />
      <div ref={kanbanRef} className="kanban min-h-0 flex-1">
        {JOB_STATUSES.map((stage) => {
          const items = filtered.filter((j) => j.status === stage);
          return (
            <section className="kanban-column" key={stage}>
              <div className="mb-3 flex items-center justify-between">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass[stage]}`}>{JOB_STATUS_LABELS[stage]}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((job) => (
                  <article
                    className="job-card relative cursor-pointer"
                    key={job.id}
                    onClick={() => (job.formato === "gravacao" ? setRecording(job) : setDetail(job))}
                  >
                    <div className="absolute right-2 top-2 flex items-center gap-0.5">
                      {canStepBack(job) && (
                        <button
                          type="button"
                          aria-label="Voltar etapa"
                          title="Voltar etapa"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); setReverting(job); }}
                        >
                          <Undo2 className="size-4" />
                        </button>
                      )}
                      {canRemoveJob(job) && (
                        <button
                          type="button"
                          aria-label="Excluir job"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleting(job); }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-bold">{job.title || productName(job.product_id)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{productName(job.product_id)}</p>
                    <p className="mt-4 text-[11px] text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p>
                    <JobCostBadge jobId={job.id} />
                    {job.formato === "gravacao" ? (
                      <>
                        <p className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold">Gravar eu mesmo</p>
                        {(job.status === "gerando_cenas" || job.status === "gerando_video") && (
                          <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            {jobStatusLabel(job)}...
                          </p>
                        )}
                        {canEditJob(job) && (
                          <Button size="sm" className="mt-3 w-full" onClick={(e) => { e.stopPropagation(); setRecording(job); }}>
                            <Video />
                            {job.status === "produto_escolhido" ? "Criar roteiro" : "Roteiro e gravação"}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                    {job.status === "produto_escolhido" && canEditJob(job) && (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        disabled={generatingId === job.id}
                        onClick={(e) => { e.stopPropagation(); runGenerate.mutate(job.id); }}
                      >
                        {generatingId === job.id ? <><Loader2 className="animate-spin" />Gerando...</> : <><Sparkles />Gerar roteiro</>}
                      </Button>
                    )}
                    {job.render_error && (
                      <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-[11px] text-destructive">{job.render_error}</p>
                    )}
                    {job.status === "roteiro_pronto" && !job.render_stage && canEditJob(job) && (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        disabled={renderingId === job.id}
                        onClick={(e) => { e.stopPropagation(); runScenes.mutate(job.id); }}
                      >
                        {renderingId === job.id
                          ? <><Loader2 className="animate-spin" />Enviando...</>
                          : <><Images />{job.render_error ? ((job.scenes ?? []).some((s) => s.image_url) ? "Gerar as cenas que faltam" : "Tentar de novo") : "Gerar cenas"}</>}
                      </Button>
                    )}
                    {job.status === "cenas_geradas" && (
                      <>
                        <div className="mt-3 flex gap-1.5">
                          {(job.scenes ?? []).slice(0, 4).map((scene, i) =>
                            scene.image_url ? (
                              <img key={i} src={scene.image_url} alt="" className="aspect-[9/16] w-full rounded-md object-cover" />
                            ) : null,
                          )}
                        </div>
                        {canEditJob(job) && (
                          <Button size="sm" className="mt-3 w-full" onClick={(e) => { e.stopPropagation(); setDetail(job); }}>
                            <Clapperboard />Revisar e aprovar
                          </Button>
                        )}
                      </>
                    )}
                    {(job.status === "gerando_video" || (job.status === "roteiro_pronto" && job.render_stage)) && (
                      <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        {(job.render_stage && RENDER_STAGE_LABELS[job.render_stage]) ?? "Renderizando"}...
                      </p>
                    )}

                    {job.status === "video_pronto" && (
                      <>
                        {job.video_thumbnail_url && (
                          <img src={job.video_thumbnail_url} alt="" className="mt-3 aspect-[9/16] w-full rounded-lg object-cover" />
                        )}
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                          <BadgeCheck className="size-3.5" />
                          Na fila de revisão — aprove aqui ou em Rascunhos
                        </p>
                      </>
                    )}
                      </>
                    )}
                  </article>
                ))}
                {stage === "novo" && !filtered.length && !isLoading && (
                  <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Nenhum job ainda. Use um produto para criar o primeiro.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <JobDetailDialog
        job={current}
        productName={current ? productName(current.product_id) : ""}
        canEdit={!!current && canEditJob(current)}
        canDelete={!!current && canRemoveJob(current)}
        onDelete={() => current && setDeleting(current)}
        canStepBack={!!current && canStepBack(current)}
        onStepBack={() => current && setReverting(current)}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      {recording && (
        <RecordingKitDialog
          job={jobs.find((j) => j.id === recording.id) ?? recording}
          canEdit={canEditJob(recording)}
          onClose={() => setRecording(null)}
        />
      )}

      <AlertDialog open={!!reverting} onOpenChange={(open) => !open && setReverting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar etapa</AlertDialogTitle>
            <AlertDialogDescription>
              {reverting
                ? `Voltar para a etapa "${JOB_STATUS_LABELS[PREVIOUS_STATUS[reverting.status]!]}"? O conteúdo já gerado (roteiro, cenas e vídeo) é mantido.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={stepBack.isPending}
              onClick={(e) => { e.preventDefault(); reverting && stepBack.mutate(reverting); }}
            >
              {stepBack.isPending ? <Loader2 className="animate-spin" /> : null}Voltar etapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir job</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Esta ação não pode ser desfeita. O job será removido do pipeline; o produto do catálogo e o perfil não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeJob.isPending}
              onClick={(e) => { e.preventDefault(); deleting && removeJob.mutate(deleting.id); }}
            >
              {removeJob.isPending ? <Loader2 className="animate-spin" /> : null}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
