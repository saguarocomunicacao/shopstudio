import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getVideoStorageState, retryDraftVideoStorage } from "@/lib/drafts.functions";
import { SharePanel } from "./share-panel";
import { actionError } from "@/lib/api-keys";

const errMessage = (e: unknown) => actionError(e, "Algo deu errado.");

/** Dias sem cópia local a partir dos quais o vídeo corre risco real de sumir. */
const RISCO_DIAS = 3;

/**
 * Estado real da cópia do vídeo no nosso armazenamento + link público.
 * Nunca fica em "preparando" eterno: mostra salvando, falha com retry ou o painel.
 */
export function JobVideoStorage({ jobId, renderedAt }: { jobId: string; renderedAt?: string | null }) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getVideoStorageState);
  const retryFn = useServerFn(retryDraftVideoStorage);

  const { data, isLoading } = useQuery({
    queryKey: ["video-storage", jobId],
    queryFn: () => fetchState({ data: { jobId } }),
    refetchInterval: (q) => (q.state.data?.status === "baixando" || q.state.data?.status === "pendente" ? 8000 : false),
  });

  const retry = useMutation({
    mutationFn: () => retryFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo salvo no seu armazenamento.");
      qc.invalidateQueries({ queryKey: ["video-storage", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => {
      toast.error(errMessage(e));
      qc.invalidateQueries({ queryKey: ["video-storage", jobId] });
    },
  });

  if (isLoading || !data) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Verificando o vídeo salvo...
      </p>
    );
  }

  if (data.stored) return <SharePanel jobId={jobId} />;

  const dias = renderedAt ? (Date.now() - Date.parse(renderedAt)) / 86_400_000 : 0;
  const emRisco = dias >= RISCO_DIAS;
  const salvando = data.status === "baixando" || (data.status === "pendente" && !retry.isError);

  return (
    <section className="rounded-xl border border-dashed p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        {salvando && !retry.isError ? (
          <>
            <Loader2 className="size-4 animate-spin text-primary" />
            Salvando vídeo no seu armazenamento...
          </>
        ) : (
          <>
            <AlertTriangle className="size-4 text-primary" />
            Falha ao salvar o vídeo
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {data.error ??
          (salvando
            ? "A cópia está em andamento. Isso costuma levar menos de um minuto."
            : "A cópia para o seu armazenamento não foi concluída.")}
      </p>
      {emRisco && (
        <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
          Vídeo pode ser perdido: o arquivo original é apagado 7 dias depois de pronto. Salve agora.
        </p>
      )}
      <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={() => retry.mutate()} disabled={retry.isPending}>
        {retry.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Tentar salvar de novo
      </Button>
    </section>
  );
}
