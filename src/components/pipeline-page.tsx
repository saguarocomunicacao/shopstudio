import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Loader2, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { JOB_STATUSES, JOB_STATUS_LABELS, relativeTime, useJobs, useProducts, type DbJob } from "@/lib/content";
import { generateJobScript } from "@/lib/script.functions";
import { generateJobVideo } from "@/lib/video.functions";
import { JobDetailDialog } from "./job-detail-dialog";
import { useStudio } from "./studio-context";
import { useDragScroll } from "./use-drag-scroll";

const statusClass: Record<string, string> = {
  novo: "status-neutral",
  produto_escolhido: "status-blue",
  roteiro_pronto: "status-violet",
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);

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
