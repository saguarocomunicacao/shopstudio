import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Send,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime, useJobs, type DbJob } from "@/lib/content";
import {
  approveDraft,
  getDraftKit,
  markDraftPublished,
  rejectDraft,
  retryDraftVideoStorage,
} from "@/lib/drafts.functions";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

type QueueKey = "revisao" | "aprovado" | "publicado";

const QUEUES: { key: QueueKey; label: string; status: DbJob["status"]; badge: string }[] = [
  { key: "revisao", label: "Aguardando revisão", status: "video_pronto", badge: "status-lime" },
  { key: "aprovado", label: "Aprovados", status: "rascunho_enviado", badge: "status-orange" },
  { key: "publicado", label: "Publicados", status: "publicado", badge: "status-pink" },
];

export function DraftsPage() {
  return (
    <ProfileGate>
      <DraftsContent />
    </ProfileGate>
  );
}

function DraftsContent() {
  const { activeProfileId } = useStudio();
  const { data: jobs = [], isLoading } = useJobs(activeProfileId);
  const [queue, setQueue] = useState<QueueKey>("revisao");
  const [openId, setOpenId] = useState<string | null>(null);

  const current = QUEUES.find((q) => q.key === queue)!;
  const list = jobs.filter((j) => j.status === current.status);
  const countOf = (status: DbJob["status"]) => jobs.filter((j) => j.status === status).length;

  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase text-primary">Última etapa da esteira</p>
        <h1 className="text-2xl font-black sm:text-3xl">Fila de rascunhos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada vídeo pronto vira um kit de postagem: baixe o vídeo, copie os textos e publique no TikTok pelo celular.
        </p>
      </div>

      <Tabs value={queue} onValueChange={(v) => setQueue(v as QueueKey)} className="min-w-0">
        <div className="mb-5 overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            {QUEUES.map((q) => (
              <TabsTrigger key={q.key} value={q.key}>
                {q.label} ({countOf(q.status)})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando rascunhos...
        </p>
      ) : list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((job) => (
            <article key={job.id} className="panel">
              <button
                type="button"
                onClick={() => setOpenId(job.id)}
                className="block w-full overflow-hidden rounded-xl bg-black"
              >
                {job.video_thumbnail_url ? (
                  <img
                    src={job.video_thumbnail_url}
                    alt={job.title || "Rascunho"}
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-[9/16] w-full place-items-center text-xs text-white/70">
                    Sem miniatura
                  </div>
                )}
              </button>
              <p className="mt-3 truncate text-sm font-bold">{job.title || "Sem título"}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{relativeTime(job.created_at)}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${current.badge}`}>
                  {current.label}
                </span>
                {!job.video_path && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                    <AlertTriangle className="size-3" />
                    não salvo
                  </span>
                )}
              </div>
              <Button className="mt-3 w-full" onClick={() => setOpenId(job.id)}>
                Abrir kit de postagem
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {queue === "revisao"
            ? "Nenhum rascunho aguardando revisão. Quando um vídeo ficar pronto, ele aparece aqui."
            : queue === "aprovado"
              ? "Nenhum rascunho aprovado no momento."
              : "Nenhum vídeo publicado ainda."}
        </div>
      )}

      {openId && <DraftKitDialog jobId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function CopyBlock({
  title,
  value,
  hint,
  multiline,
}: {
  title: string;
  value: string;
  hint?: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${title} copiado.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };
  return (
    <section className="rounded-xl border p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${multiline ? "" : "truncate"}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : `Copiar ${title.toLowerCase()}`}
      </Button>
    </section>
  );
}

function DraftKitDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fetchKit = useServerFn(getDraftKit);
  const retryStorage = useServerFn(retryDraftVideoStorage);
  const approve = useServerFn(approveDraft);
  const publish = useServerFn(markDraftPublished);
  const reject = useServerFn(rejectDraft);

  const [publishOpen, setPublishOpen] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const kit = useQuery({
    queryKey: ["draft-kit", jobId],
    queryFn: () => fetchKit({ data: { jobId } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["draft-kit", jobId] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const retry = useMutation({
    mutationFn: () => retryStorage({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo salvo no nosso armazenamento.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const approveMut = useMutation({
    mutationFn: () => approve({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Rascunho aprovado.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const publishMut = useMutation({
    mutationFn: () => publish({ data: { jobId, url: postUrl.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Marcado como publicado.");
      setPublishOpen(false);
      setPostUrl("");
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const rejectMut = useMutation({
    mutationFn: (discard: boolean) => reject({ data: { jobId, reason: reason.trim() || undefined, discard } }),
    onSuccess: (_r, discard) => {
      toast.success(discard ? "Rascunho descartado." : "Rascunho devolvido ao pipeline.");
      setRejectOpen(false);
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const data = kit.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kit de postagem</DialogTitle>
          <DialogDescription>Baixe o vídeo, copie os textos e publique no TikTok.</DialogDescription>
        </DialogHeader>

        {kit.isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparando o kit...
          </p>
        )}
        {kit.isError && <p className="py-4 text-sm text-destructive">{errMessage(kit.error)}</p>}

        {data && (
          <div className="grid gap-4">
            {data.stored ? (
              <section className="rounded-xl border p-4">
                <p className="mb-2 text-sm font-bold">Vídeo</p>
                {data.videoUrl && (
                  <video
                    src={data.videoUrl}
                    controls
                    playsInline
                    poster={data.thumbnailUrl ?? undefined}
                    className="aspect-[9/16] w-full rounded-xl bg-black object-cover"
                  />
                )}
                <Button asChild size="lg" className="mt-3 w-full">
                  <a href={data.videoUrl ?? "#"} download={`${data.title || "video"}.mp4`}>
                    <Download />
                    Baixar vídeo
                  </a>
                </Button>
              </section>
            ) : (
              <section className="rounded-xl border border-dashed p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle className="size-4 text-primary" />
                  Vídeo ainda não salvo localmente
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.storageError ?? "A cópia do vídeo para o nosso armazenamento ainda não foi concluída."}
                </p>
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-3 w-full"
                  onClick={() => retry.mutate()}
                  disabled={retry.isPending}
                >
                  {retry.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Tentar salvar de novo
                </Button>
              </section>
            )}

            {data.stored && <SharePanel jobId={jobId} />}

            {data.hook && <CopyBlock title="Título / gancho" value={data.hook} multiline />}
            <CopyBlock title="Legenda" value={data.caption} multiline />
            <CopyBlock title="Hashtags" value={data.hashtags.join(" ")} multiline />
            {data.product?.url && (
              <CopyBlock
                title="Link do produto"
                value={data.product.url}
                hint="Cole/anexe este produto no TikTok ao publicar (passo manual)."
              />
            )}

            {data.publishedUrl && (
              <p className="text-xs text-muted-foreground">
                Post no TikTok:{" "}
                <a className="font-semibold text-primary underline" href={data.publishedUrl} target="_blank" rel="noreferrer">
                  {data.publishedUrl}
                </a>
              </p>
            )}

            {data.status !== "publicado" && (
              <DialogFooter className="grid gap-2 sm:grid-cols-2">
                {data.status === "video_pronto" ? (
                  <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                    {approveMut.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Aprovar
                  </Button>
                ) : (
                  <Button onClick={() => setPublishOpen(true)}>
                    <Send />
                    Marcar como publicado
                  </Button>
                )}
                {data.status === "video_pronto" && !data.requireReview && (
                  <Button variant="secondary" onClick={() => setPublishOpen(true)}>
                    <Send />
                    Marcar como publicado
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setRejectOpen(true)}>
                  <Undo2 />
                  Rejeitar / refazer
                </Button>
              </DialogFooter>
            )}

            {data.status === "video_pronto" && data.requireReview && (
              <p className="text-xs text-muted-foreground">
                Este perfil exige revisão: aprove o rascunho antes de marcar como publicado.
              </p>
            )}
          </div>
        )}
      </DialogContent>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como publicado</DialogTitle>
            <DialogDescription>Se quiser, cole o link do post no TikTok para alimentar as métricas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="post-url">Link do post (opcional)</Label>
            <Input
              id="post-url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@perfil/video/..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
              {publishMut.isPending && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar rascunho</DialogTitle>
            <DialogDescription>Devolva o job ao pipeline para refazer o vídeo, ou descarte de vez.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-reason">Motivo (opcional)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="O que ficou ruim no vídeo?"
            />
          </div>
          <DialogFooter className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => rejectMut.mutate(false)} disabled={rejectMut.isPending}>
              Voltar ao pipeline
            </Button>
            <Button variant="destructive" onClick={() => rejectMut.mutate(true)} disabled={rejectMut.isPending}>
              Descartar job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
