import { Button } from "@/components/ui/button";
import { JOB_STATUSES, JOB_STATUS_LABELS, relativeTime, useJobs, useProducts } from "@/lib/content";
import { Plus } from "lucide-react";
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

export function PipelinePage() {
  const { activeProfileId, profiles, can } = useStudio();
  const kanbanRef = useDragScroll<HTMLDivElement>();
  const { data: jobs = [], isLoading } = useJobs(can("pipeline", "visualizar"));
  const { data: products = [] } = useProducts(can("produtos", "visualizar"));

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "Sem produto";
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";

  const filtered = activeProfileId === "all" ? jobs : jobs.filter((j) => j.profile_id === activeProfileId);

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
                  <article className="job-card" key={job.id}>
                    <p className="text-sm font-bold">{job.title || productName(job.product_id)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{productName(job.product_id)}</p>
                    <p className="mt-4 text-[11px] text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p>
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
    </div>
  );
}
