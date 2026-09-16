import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Images, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUSES, JOB_STATUS_LABELS, relativeTime, useJobs, useProducts, type DbJob } from "@/lib/content";
import { generateJobScript } from "@/lib/script.functions";
import { RENDER_STAGE_LABELS, generateJobScenes } from "@/lib/video.functions";
import { useVideoDriver } from "@/lib/video-driver";
import { JobDetailDialog } from "./job-detail-dialog";
import { useStudio } from "./studio-context";
import { useDragScroll } from "./use-drag-scroll";

const statusClass: Record<string, string> = {
  novo: "status-neutral",
  produto_escolhido: "status-blue",
  roteiro_pronto: "status-violet",
  cenas_geradas: "status-orange",
  gerando_video: "status-cyan",
  video_pronto: "status-lime",
  rascunho_enviado: "status-orange",
  publicado: "status-pink",
};


const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

export function PipelinePage() {
  const { activeProfileId, profiles, can } = useStudio();
  const kanbanRef = useDragScroll<HTMLDivElement>();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useJobs(can("pipeline", "visualizar"));
  const { data: products = [] } = useProducts(can("produtos", "visualizar"));
  const [detail, setDetail] = useState<DbJob | null>(null);
  const generate = useServerFn(generateJobScript);
  const generateScenes = useServerFn(generateJobScenes);
  useVideoDriver(jobs);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);


  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "Sem produto";
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const canEditJob = (job: DbJob) => can("pipeline", "editar", job.profile_id) || can("pipeline", "criar", job.profile_id);

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

  const filtered = activeProfileId === "all" ? jobs : jobs.filter((j) => j.profile_id === activeProfileId);
  const current = detail ? jobs.find((j) => j.id === detail.id) ?? detail : null;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 lg:h-[calc(100vh-8.5rem)]">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase text-primary">Produção</p>
          <h1 className="truncate text-2xl font-black sm:text-3xl">Pipeline de conteúdo</h1>
        </div>
        <Button disabled><Plus />Novo job</Button>
      </div>
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
                  <article className="job-card cursor-pointer" key={job.id} onClick={() => setDetail(job)}>
                    <p className="text-sm font-bold">{job.title || productName(job.product_id)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{productName(job.product_id)}</p>
                    <p className="mt-4 text-[11px] text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p>
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
                          : <><Images />{job.render_error ? "Tentar de novo" : "Gerar cenas"}</>}
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

                    {job.status === "video_pronto" && job.video_thumbnail_url && (
                      <img src={job.video_thumbnail_url} alt="" className="mt-3 aspect-[9/16] w-full rounded-lg object-cover" />
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
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </div>
  );
}
