import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clapperboard, Loader2, RefreshCw, Sparkles, TriangleAlert, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { JobScenesReview } from "@/components/job-scenes-review";
import { JobAvatarSelect } from "@/components/avatar-library";
import type { DbJob } from "@/lib/content";
import { actionError } from "@/lib/api-keys";
import { useEstimativaVeo } from "@/lib/orcamento";
import { getRecordingVideoUrl, setJobVideoChoice } from "@/lib/recording.functions";
import { useVideoDriver } from "@/lib/video-driver";
import { approveJobScenes, generateJobScenes } from "@/lib/video.functions";
import { VideoDownloadButton } from "@/components/video-download-button";

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

const ETAPA_LABEL: Record<string, string> = {
  planejando: "Planejando as cenas...",
  cenas: "Gerando as imagens das cenas...",
  takes: "Animando as cenas em vídeo...",
  narracao: "Gravando a narração...",
  montagem: "Enviando para a montagem...",
  render: "Montando o vídeo final...",
};

/**
 * Versão gerada por IA de um vídeo próprio, dentro do próprio modal.
 * Roda na trilha ai_* do job: a gravação original e a editada nunca são tocadas.
 */
export function JobAiVideo({ job, canEdit }: { job: DbJob; canEdit: boolean }) {
  const qc = useQueryClient();
  const gerarCenas = useServerFn(generateJobScenes);
  const aprovarCenas = useServerFn(approveJobScenes);
  const escolherVersao = useServerFn(setJobVideoChoice);
  const linkVideo = useServerFn(getRecordingVideoUrl);

  // Empurra uma etapa por vez; cada etapa é idempotente no servidor.
  useVideoDriver([job]);

  const etapa = job.ai_render_stage ?? null;
  const aiStatus = job.ai_status ?? null;
  const cenas = job.scenes ?? [];
  const estimativa = useEstimativaVeo(job.profile_id, cenas.length);

  const versoes = useQuery({
    queryKey: ["recording-versions", job.id, job.video_path, job.ai_video_path, job.video_choice],
    queryFn: () => linkVideo({ data: { jobId: job.id } }),
  });

  const iniciar = useMutation({
    mutationFn: () => gerarCenas({ data: { jobId: job.id } }),
    onSuccess: () => {
      toast.success("Gerando as cenas. Você aprova antes de gastar com o vídeo.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const aprovar = useMutation({
    mutationFn: () => aprovarCenas({ data: { jobId: job.id } }),
    onSuccess: () => {
      toast.success("Cenas aprovadas. Gerando o vídeo.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const escolher = useMutation({
    mutationFn: (choice: "gravado" | "gravado_editado" | "ia") => escolherVersao({ data: { jobId: job.id, choice } }),
    onSuccess: () => {
      toast.success("Versão escolhida.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      void versoes.refetch();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const rodando = !!etapa;
  const escolha = job.video_choice ?? "gravado";
  const dados = versoes.data;
  const opcoes = [
    { key: "gravado" as const, label: "Gravado original", url: dados?.originalUrl ?? null },
    { key: "gravado_editado" as const, label: "Gravado editado", url: dados?.editedUrl ?? null },
    { key: "ia" as const, label: "Gerado por IA", url: dados?.aiUrl ?? null },
  ].filter((o) => !!o.url);

  return (
    <section className="grid gap-4 rounded-xl border p-4">
      <div className="grid gap-1">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="size-4 text-primary" />
          Gerar vídeo por IA
        </p>
        <p className="text-sm text-muted-foreground">
          Usa o roteiro deste vídeo para criar as cenas, animar e montar. Diferente de gravar você mesmo, esta opção
          gera custo.
        </p>
      </div>

      {job.ai_render_error && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {job.ai_render_error}
        </p>
      )}

      {/* Etapa 1: escolher avatar (override só deste vídeo) e começar */}
      {!rodando && !aiStatus && (
        <div className="grid gap-3">
          <JobAvatarSelect jobId={job.id} profileId={job.profile_id} canEdit={canEdit} />
          <Button size="lg" className="w-full" disabled={!canEdit || iniciar.isPending} onClick={() => iniciar.mutate()}>
            {iniciar.isPending ? <Loader2 className="animate-spin" /> : <Clapperboard />}
            Gerar vídeo por IA
          </Button>
        </div>
      )}

      {/* Em andamento */}
      {rodando && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {ETAPA_LABEL[etapa!] ?? "Processando..."}
        </p>
      )}

      {/* Etapa 2: aprovação das cenas, empilhada no celular */}
      {!rodando && aiStatus === "cenas_geradas" && (
        <div className="grid gap-4">
          <JobScenesReview job={job} canEdit={canEdit} />
          <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-bold">Custo estimado do vídeo</p>
            {estimativa ? (
              <p className="text-muted-foreground">
                {estimativa.cenas} cenas · {estimativa.segundos}s · animação {brl(estimativa.veoBrl)} + montagem{" "}
                {brl(estimativa.montagemBrl)} ={" "}
                <span className="font-bold text-foreground">{brl(estimativa.totalBrl)}</span>
                {estimativa.semTarifa ? " (estimativa parcial)" : ""}
              </p>
            ) : (
              <p className="text-muted-foreground">Estimativa indisponível no momento.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Button size="lg" disabled={!canEdit || aprovar.isPending} onClick={() => aprovar.mutate()}>
              {aprovar.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Aprovar cenas e gerar o vídeo
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={!canEdit || iniciar.isPending}
              onClick={() => iniciar.mutate()}
            >
              <RefreshCw />
              Refazer as cenas
            </Button>
          </div>
        </div>
      )}

      {/* Etapa 3: vídeo por IA pronto */}
      {!rodando && aiStatus === "video_pronto" && (
        <div className="grid gap-3">
          {dados?.aiUrl ? (
            <>
              <video src={dados.aiUrl} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-black object-contain" />
              <VideoDownloadButton
                versions={[
                  { key: "ia", label: "Versão gerada por IA", source: dados.aiUrl },
                  { key: "gravado", label: "Gravação original", source: dados.originalUrl },
                  { key: "gravado-editado", label: "Gravação editada", source: dados.editedUrl },
                ]}
                title={job.title}
                size="lg"
                className="w-full"
              />
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Preparando o vídeo gerado...
            </p>
          )}
        </div>
      )}

      {/* Escolha da versão final: nada é sobrescrito */}
      {opcoes.length > 1 && (
        <div className="grid gap-2">
          <p className="text-sm font-bold">Versão que vai ser usada</p>
          <div className="grid gap-2">
            {opcoes.map((opcao) => (
              <Button
                key={opcao.key}
                type="button"
                variant={escolha === opcao.key ? "default" : "outline"}
                size="lg"
                className="justify-start"
                disabled={!canEdit || escolher.isPending}
                onClick={() => escolher.mutate(opcao.key)}
              >
                {escolha === opcao.key ? <Check /> : <Video />}
                {opcao.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Todas as versões continuam guardadas. Você pode trocar a qualquer momento.
          </p>
        </div>
      )}
    </section>
  );
}
