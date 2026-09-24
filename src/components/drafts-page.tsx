import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Film,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Send,
  Trash2,
  Undo2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { jobStatusLabel, relativeTime, useJobs, useProducts, useTrashedJobs, type DbJob } from "@/lib/content";
import { restoreOriginalRecording } from "@/lib/recording.functions";
import {
  approveDraft,
  createDraftThumbnailUpload,
  getDraftKit,
  getDraftPreviews,
  moveDraftBack,
  duplicateJob,
  purgeDraft,
  restoreDraft,
  trashDraft,
  markDraftPublished,
  rejectDraft,
  retryDraftVideoStorage,
  saveDraftPostTexts,
  saveDraftThumbnail,
} from "@/lib/drafts.functions";
import { ProfileGate } from "./profile-gate";
import { NewOwnVideoDialog, RecordingKitDialog } from "./recording-kit";
import { SharePanel } from "./share-panel";
import { useStudio } from "./studio-context";
import { actionError } from "@/lib/api-keys";
import { supabase } from "@/integrations/supabase/client";
import { captureVideoThumbnail } from "@/lib/video-thumbnail";
import { VideoDownloadButton } from "./video-download-button";

const errMessage = (e: unknown) => actionError(e, "Algo deu errado.");

type QueueKey = "roteiros" | "revisao" | "aprovado" | "publicado" | "lixeira";

const QUEUES: { key: QueueKey; label: string; status?: DbJob["status"]; badge: string }[] = [
  { key: "roteiros", label: "Roteiros prontos", badge: "status-violet" },
  { key: "revisao", label: "Aguardando revisão", status: "video_pronto", badge: "status-violet" },
  { key: "aprovado", label: "Aprovados", status: "rascunho_enviado", badge: "status-cyan" },
  { key: "publicado", label: "Publicados", status: "publicado", badge: "status-published" },
  { key: "lixeira", label: "Lixeira", badge: "status-neutral" },
];

/** Roteiros concluídos do formato de gravação que ainda aguardam a pessoa gravar. */
const roteiroPronto = (job: DbJob) =>
  job.formato === "gravacao" &&
  ["roteiro_pronto", "gerando_cenas", "cenas_geradas", "gerando_video"].includes(job.status) &&
  !job.recorded_at;

export function DraftsPage({ initialJobId }: { initialJobId?: string | undefined }) {
  return (
    <ProfileGate>
      <DraftsContent initialJobId={initialJobId} />
    </ProfileGate>
  );
}

function DraftThumb({
  job,
  preview,
  loadingPreview = false,
  onOpen,
}: {
  job: DbJob;
  loadingPreview?: boolean;
  preview?: { videoUrl: string | null; thumbnailUrl: string | null } | undefined;
  onOpen: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!loadingPreview) return;
    setLoadTimedOut(false);
    const t = window.setTimeout(() => setLoadTimedOut(true), 15000);
    return () => window.clearTimeout(t);
  }, [loadingPreview]);
  const thumbnailAttempted = useRef(false);
  const qc = useQueryClient();
  const createThumbnailUpload = useServerFn(createDraftThumbnailUpload);
  const saveThumbnail = useServerFn(saveDraftThumbnail);
  const videoUrl = preview?.videoUrl ?? null;
  const posterUrl = preview?.thumbnailUrl ?? job.video_thumbnail_url ?? generatedPoster ?? undefined;
  // Enquanto a miniatura ainda não existe (e não falhou), mostramos um placeholder limpo que ocupa o card todo.
  const generatingThumbnail = !!videoUrl && !posterUrl && !thumbFailed;

  useEffect(() => () => {
    if (generatedPoster) URL.revokeObjectURL(generatedPoster);
  }, [generatedPoster]);

  useEffect(() => {
    if (!videoUrl || posterUrl || thumbnailAttempted.current) return;
    thumbnailAttempted.current = true;
    let cancelled = false;
    const generate = async () => {
      try {
        const thumbnail = await captureVideoThumbnail(videoUrl);
        if (cancelled) return;
        setGeneratedPoster(URL.createObjectURL(thumbnail));
        const { path, token } = await createThumbnailUpload({ data: { jobId: job.id } });
        const { error } = await supabase.storage.from("job-media").uploadToSignedUrl(path, token, thumbnail, {
          contentType: "image/jpeg",
        });
        if (error) throw error;
        await saveThumbnail({ data: { jobId: job.id, path } });
        if (!cancelled) void qc.invalidateQueries({ queryKey: ["draft-previews"] });
      } catch {
        // O próprio vídeo continua disponível; uma próxima abertura pode tentar novamente.
        thumbnailAttempted.current = false;
        if (!cancelled) setThumbFailed(true);
      }
    };
    void generate();
    return () => { cancelled = true; };
  }, [createThumbnailUpload, job.id, posterUrl, qc, saveThumbnail, videoUrl]);

  if (videoUrl) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-landing-bg">
        {generatingThumbnail ? (
          <div className="draft-thumbnail-placeholder aspect-[9/16] w-full">
            <span className="route-loader-mark scale-75" aria-hidden="true">
              <span className="route-loader-ring" />
              <Film className="relative z-10 size-8 text-brand-cyan" />
            </span>
            <p>Gerando miniatura...</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              key={videoUrl}
              // #t=0.5 faz o navegador desenhar um frame do vídeo como miniatura.
              src={playing ? videoUrl : `${videoUrl}#t=0.5`}
              poster={posterUrl}
              preload="metadata"
              playsInline
              muted={!playing}
              controls={playing}
              className="aspect-[9/16] w-full object-cover"
              onPause={() => setPlaying(false)}
            />
            {!playing && (
              <button
                type="button"
                aria-label={`Assistir ${job.title || "vídeo"}`}
                className="absolute inset-0 z-20 grid place-items-center bg-overlay/10 transition hover:bg-overlay/25"
                onClick={() => {
                  setPlaying(true);
                  window.setTimeout(() => void videoRef.current?.play(), 0);
                }}
              >
                <span className="grid size-14 place-items-center rounded-full bg-background/90 text-foreground shadow-lg">
                  <Play className="size-6" />
                </span>
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-xl">
      {posterUrl ? (
        <img src={posterUrl} alt={job.title || "Rascunho"} className="aspect-[9/16] w-full bg-black object-cover" />
      ) : loadingPreview && !loadTimedOut ? (
        <div className="draft-thumbnail-placeholder aspect-[9/16] w-full">
          <span className="route-loader-mark scale-75" aria-hidden="true">
            <span className="route-loader-ring" />
            <Film className="relative z-10 size-8 text-brand-cyan" />
          </span>
          <p>Preparando a prévia do vídeo...</p>
        </div>
      ) : (
        <NoVideoPlaceholder job={job} />
      )}
    </button>
  );
}

function NoVideoPlaceholder({ job }: { job: DbJob }) {
  const sceneImage = (job.scenes ?? []).find((c) => c.approved && c.image_url)?.image_url ?? (job.scenes ?? []).find((c) => c.image_url)?.image_url;
  const running = job.status === "gerando_cenas" || job.status === "gerando_video";
  const message =
    job.status === "cenas_geradas"
      ? "Cenas geradas, aguardando geração do vídeo. Abra para revisar e gerar."
      : running
        ? `${jobStatusLabel(job)}...`
        : job.video_path
          ? "Não foi possível carregar a prévia. Abra para ver o vídeo."
          : "Ainda sem vídeo. Abra para continuar.";
  return (
    <div className="relative aspect-[9/16] w-full">
      {sceneImage && <img src={sceneImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <div className="draft-thumbnail-placeholder relative h-full w-full">
        {running ? <Loader2 className="size-8 animate-spin text-brand-cyan" /> : <Film className="size-8 text-brand-cyan" />}
        <p>{message}</p>
      </div>
    </div>
  );
}

function DraftsContent({ initialJobId }: { initialJobId?: string | undefined }) {
  const { activeProfileId, activeProfile, can } = useStudio();
  const { data: jobs = [], isLoading, isError } = useJobs(activeProfileId);
  const { data: trashed = [], isError: trashError } = useTrashedJobs(activeProfileId);
  const canViewProducts = can("produtos", "visualizar");
  const { data: products = [] } = useProducts(activeProfileId, canViewProducts);
  const [queue, setQueue] = useState<QueueKey>("roteiros");
  const [openId, setOpenId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [openStudioDirectly, setOpenStudioDirectly] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [trashing, setTrashing] = useState<DbJob | null>(null);
  const [purging, setPurging] = useState<DbJob | null>(null);
  const qc = useQueryClient();
  const toTrash = useServerFn(trashDraft);
  const undoTrash = useServerFn(restoreDraft);
  const purge = useServerFn(purgeDraft);
  const stepBack = useServerFn(moveDraftBack);
  const duplicate = useServerFn(duplicateJob);

  useEffect(() => {
    if (!initialJobId || isLoading) return;
    const job = jobs.find((item) => item.id === initialJobId);
    if (!job) return;
    setQueue(job.status === "rascunho_enviado" ? "aprovado" : job.status === "publicado" ? "publicado" : "revisao");
    setOpenId(initialJobId);
  }, [initialJobId, isLoading, jobs]);
  const loadPreviews = useServerFn(getDraftPreviews);

  const canCreate = can("pipeline", "criar", activeProfileId) || can("pipeline", "editar", activeProfileId);
  const canRemove = (job: DbJob) =>
    can("pipeline", "criar", job.profile_id) || can("pipeline", "editar", job.profile_id);
  const roteirosList = jobs.filter(roteiroPronto);
  const current = QUEUES.find((q) => q.key === queue);
  const isTrash = queue === "lixeira";
  const list = isTrash
    ? trashed
    : queue === "roteiros"
      ? roteirosList
      : jobs.filter((j) => j.status === current?.status);
  const countOf = (status: DbJob["status"]) => jobs.filter((j) => j.status === status).length;
  const countQueue = (item: (typeof QUEUES)[number]) =>
    item.key === "lixeira"
      ? trashed.length
      : item.key === "roteiros"
        ? roteirosList.length
        : item.status
          ? countOf(item.status)
          : 0;
  const productName = (job: DbJob) => {
    if (!job.product_id) return "Tema próprio • sem produto";
    return products.find((product) => product.id === job.product_id)?.name ?? "Produto associado";
  };
  const recordingJob = jobs.find((j) => j.id === recordingId) ?? null;
  const openRecordingKit = (jobId: string, studio: boolean) => {
    setOpenStudioDirectly(studio);
    setRecordingId(jobId);
  };

  // Links assinados do vídeo de cada card: o frame do próprio vídeo vira a miniatura.
  const previewIds = list.filter((job) => !!job.video_path).map((job) => job.id);
  const previews = useQuery({
    queryKey: ["draft-previews", previewIds.join(",")],
    queryFn: () => loadPreviews({ data: { jobIds: previewIds } }),
    enabled: previewIds.length > 0,
    staleTime: 1000 * 60 * 30,
  });
  const previewOf = (jobId: string) => previews.data?.previews.find((p) => p.id === jobId);

  const refreshLists = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["jobs-trash"] });
  };

  const backMut = useMutation({
    mutationFn: (jobId: string) => stepBack({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo voltou para a etapa anterior.");
      refreshLists();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const dupMut = useMutation({
    mutationFn: (jobId: string) => duplicate({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Cópia criada como rascunho (roteiro pronto).");
      refreshLists();
      setQueue("roteiros");
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const trashMut = useMutation({
    mutationFn: (jobId: string) => toTrash({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo movido para a Lixeira.");
      setTrashing(null);
      setRecordingId(null);
      refreshLists();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (jobId: string) => undoTrash({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo restaurado.");
      refreshLists();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const purgeMut = useMutation({
    mutationFn: (jobId: string) => purge({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Vídeo excluído definitivamente.");
      setPurging(null);
      refreshLists();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const canStepBack = (job: DbJob) =>
    job.status === "publicado" ||
    job.status === "rascunho_enviado" ||
    (job.status === "video_pronto" && job.formato === "gravacao");

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-primary">Última etapa da esteira</p>
          <h1 className="text-2xl font-black sm:text-3xl">Fila de rascunhos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada vídeo pronto vira um kit de postagem: baixe o vídeo, copie os textos e publique no TikTok pelo celular.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setNovoOpen(true)}>
            <Video />
            Novo vídeo próprio
          </Button>
        )}
      </div>

      <Tabs value={queue} onValueChange={(v) => setQueue(v as QueueKey)} className="min-w-0">
        <div className="mb-5 overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            {QUEUES.map((q) => (
              <TabsTrigger key={q.key} value={q.key}>
                {q.label} ({countQueue(q)})
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
      ) : isError || trashError ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar os rascunhos. Tente novamente.
        </div>
      ) : list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((job) => {
            const pendente = isTrash
              ? job.deleted_from_status === "roteiro_pronto"
              : queue === "roteiros" && job.status === "roteiro_pronto";
            const fluxoIaProprio = !isTrash && queue === "roteiros" && job.formato === "gravacao";
            const abrir = () => (fluxoIaProprio ? openRecordingKit(job.id, false) : setOpenId(job.id));
            const badgeLabel = isTrash
              ? "Na lixeira"
              : fluxoIaProprio && job.status !== "roteiro_pronto"
                ? jobStatusLabel(job)
                : pendente
                  ? "Pendente de gravação"
                  : current?.label;
            return (
              <article key={job.id} className="panel">
                {pendente && !job.video_path ? (
                  <section className="flex aspect-[9/16] w-full flex-col justify-between rounded-xl border border-primary/30 bg-primary/5 p-5">
                    <div>
                      <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Camera className="size-5" />
                      </span>
                      <p className="status-violet mt-4 rounded-lg px-2 py-0.5 text-xs font-medium">Pendente de gravação</p>
                      <h2 className="mt-2 whitespace-pre-wrap break-words text-lg font-black leading-snug">
                        {job.title || "Vídeo próprio"}
                      </h2>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-foreground/75">
                        {productName(job)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/80 p-3 shadow-sm">
                      <p className="text-sm font-bold">Roteiro pronto. Falta gravar este vídeo.</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Abra o roteiro, leia no teleprompter e grave pelo celular.
                      </p>
                    </div>
                  </section>
                ) : (
                  <DraftThumb job={job} preview={previewOf(job.id)} loadingPreview={!!job.video_path && previews.isFetching && !previewOf(job.id)} onOpen={abrir} />
                )}
                <p className="mt-3 whitespace-pre-wrap break-words text-sm font-bold">{job.title || "Sem título"}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{relativeTime(job.created_at)}</p>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${isTrash ? "bg-secondary text-muted-foreground" : (current?.badge ?? "status-violet")}`}
                    >
                      {badgeLabel}
                    </span>
                    {!isTrash && !pendente && !job.video_path && (
                      <span className="status-pink inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium">
                        <AlertTriangle className="size-3" />
                        não salvo
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                  {!isTrash && previewOf(job.id)?.videoUrl && (
                    <VideoDownloadButton
                      versions={[{ key: "ativa", label: "Vídeo", source: previewOf(job.id)?.videoUrl ?? null }]}
                      title={job.title}
                      profileName={activeProfile?.name ?? null}
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                    />
                  )}
                  {canRemove(job) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`${isTrash ? "Excluir definitivamente" : "Mover para a lixeira"}: ${job.title || "vídeo"}`}
                      title={isTrash ? "Excluir definitivamente" : "Mover para a lixeira"}
                      onClick={() => (isTrash ? setPurging(job) : setTrashing(job))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {isTrash ? (
                    <Button
                      className="min-w-0"
                      variant="secondary"
                      disabled={restoreMut.isPending}
                      onClick={() => restoreMut.mutate(job.id)}
                    >
                      <RotateCcw />
                      Restaurar
                    </Button>
                  ) : pendente ? (
                    <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
                      <Button className="min-w-0" onClick={() => openRecordingKit(job.id, true)}>
                        <Camera />
                        Gravar vídeo
                      </Button>
                      <Button variant="secondary" className="min-w-0" onClick={abrir}>
                        Ver roteiro
                      </Button>
                    </div>
                  ) : (
                    <Button className="min-w-0" onClick={abrir}>Abrir kit de postagem</Button>
                  )}
                  {!isTrash && canRemove(job) && (
                    <Button
                      variant="ghost"
                      className="min-w-0"
                      disabled={dupMut.isPending}
                      onClick={() => dupMut.mutate(job.id)}
                    >
                      {dupMut.isPending && dupMut.variables === job.id ? <Loader2 className="animate-spin" /> : <Copy />}
                      Duplicar
                    </Button>
                  )}
                  {!isTrash && canRemove(job) && canStepBack(job) && (
                    <Button
                      variant="ghost"
                      className="min-w-0"
                      disabled={backMut.isPending}
                      onClick={() => backMut.mutate(job.id)}
                    >
                      <Undo2 />
                      Voltar etapa
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {queue === "revisao"
            ? "Nenhum rascunho aguardando revisão. Quando um vídeo ficar pronto, ele aparece aqui."
            : queue === "aprovado"
              ? "Nenhum rascunho aprovado no momento."
              : queue === "roteiros"
                ? "Nenhum roteiro pronto para gravar. Crie um vídeo próprio ou gere o roteiro de um produto nesse formato."
                : queue === "lixeira"
                  ? "A lixeira está vazia."
                  : "Nenhum vídeo publicado ainda."}
        </div>
      )}

      {openId && <DraftKitDialog jobId={openId} onClose={() => setOpenId(null)} onResumeRecording={() => {
        const jobId = openId;
        setOpenId(null);
        openRecordingKit(jobId, true);
      }} />}
      {recordingJob && (
        <RecordingKitDialog
          job={recordingJob}
          canEdit={canRemove(recordingJob)}
          openStudioInitially={openStudioDirectly}
          onClose={() => {
            setRecordingId(null);
            setOpenStudioDirectly(false);
          }}
        />
      )}
      <NewOwnVideoDialog open={novoOpen} onOpenChange={setNovoOpen} onCreated={(jobId) => setRecordingId(jobId)} />

      <AlertDialog open={!!trashing} onOpenChange={(open) => !open && setTrashing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para a Lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              “{trashing?.title || "Sem título"}” sai desta lista e vai para a Lixeira. Não é exclusão definitiva: você pode restaurar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={trashMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (trashing) trashMut.mutate(trashing.id);
              }}
            >
              {trashMut.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Mover para a Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!purging} onOpenChange={(open) => !open && setPurging(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              “{purging?.title || "Sem título"}” será apagado para sempre: vídeo editado, gravação original, miniatura e links de compartilhamento. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purgeMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (purging) purgeMut.mutate(purging.id);
              }}
            >
              {purgeMut.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
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

function PostTextField({
  id,
  title,
  value,
  onChange,
  readOnly,
  multiline,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
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
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{title}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={!value.trim()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <Textarea
        id={id}
        rows={multiline ? (title === "Legenda sugerida" ? 4 : 3) : 1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        className={readOnly ? "border-border bg-background text-muted-foreground" : "border-border bg-background"}
      />
    </div>
  );
}

function DraftKitDialog({ jobId, onClose, onResumeRecording }: { jobId: string; onClose: () => void; onResumeRecording: () => void }) {
  const qc = useQueryClient();
  const fetchKit = useServerFn(getDraftKit);
  const retryStorage = useServerFn(retryDraftVideoStorage);
  const approve = useServerFn(approveDraft);
  const publish = useServerFn(markDraftPublished);
  const reject = useServerFn(rejectDraft);
  const savePostTexts = useServerFn(saveDraftPostTexts);

  const [publishOpen, setPublishOpen] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [hook, setHook] = useState("");
  const [postCta, setPostCta] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  const kit = useQuery({
    queryKey: ["draft-kit", jobId],
    queryFn: () => fetchKit({ data: { jobId } }),
  });

  useEffect(() => {
    if (!kit.data) return;
    setHook(kit.data.hook);
    setPostCta(kit.data.postCta);
    setCaption(kit.data.caption);
    setHashtags(kit.data.hashtags.join(" "));
  }, [kit.data]);

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

  const saveTexts = useMutation({
    mutationFn: () => {
      const tags = hashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean);
      return savePostTexts({ data: { jobId, hook, postCta, caption, hashtags: tags } });
    },
    onSuccess: () => {
      toast.success("Textos de publicação salvos.");
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

  const restoreOriginal = useServerFn(restoreOriginalRecording);
  const restaurar = useMutation({
    mutationFn: () => restoreOriginal({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Edição descartada. O vídeo original voltou.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const data = kit.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-hidden p-0">
        <div className="max-h-[92vh] overflow-y-auto p-6 [scrollbar-gutter:stable]">
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
                <VideoDownloadButton
                  versions={[{ key: "ativa", label: "Vídeo", source: data.videoUrl }]}
                  title={data.title}
                  size="lg"
                  className="mt-3 w-full"
                />
                {data.edited && (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted-foreground">Você está vendo a versão editada. A gravação original continua guardada.</p>
                    <Button
                      variant="secondary"
                      size="lg"
                      disabled={restaurar.isPending}
                      onClick={() => restaurar.mutate()}
                      className="w-full"
                    >
                      {restaurar.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Restaurar original
                    </Button>
                  </div>
                )}
                {data.formato === "gravacao" && (
                  <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={onResumeRecording}>
                    <Scissors />
                    Continuar edição
                  </Button>
                )}
              </section>
            ) : (
              <section className="rounded-xl border border-dashed p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  {data.storageStatus === "baixando" ? (
                    <>
                      <Loader2 className="size-4 animate-spin text-primary" />
                      Salvando vídeo...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 text-primary" />
                      Falha ao salvar o vídeo
                    </>
                  )}
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

            <section className="grid gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-black text-primary">Textos para postar</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.status === "publicado"
                    ? "Textos usados na publicação."
                    : "Edite, salve e copie estes textos sem custo antes de publicar."}
                </p>
              </div>
              <PostTextField id="draft-hook" title="Título / gancho" value={hook} onChange={setHook} readOnly={data.status === "publicado"} />
              <PostTextField id="draft-post-cta" title="CTA final" value={postCta} onChange={setPostCta} readOnly={data.status === "publicado"} />
              <PostTextField id="draft-caption" title="Legenda sugerida" value={caption} onChange={setCaption} readOnly={data.status === "publicado"} multiline />
              <PostTextField id="draft-hashtags" title="Hashtags" value={hashtags} onChange={setHashtags} readOnly={data.status === "publicado"} multiline />
              {data.status !== "publicado" && (
                <Button onClick={() => saveTexts.mutate()} disabled={saveTexts.isPending}>
                  {saveTexts.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  {saveTexts.isPending ? "Salvando..." : "Salvar textos"}
                </Button>
              )}
            </section>

            <section className="grid gap-3 rounded-xl border bg-secondary/50 p-4">
              <div className="flex items-start gap-2">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-black">Conteúdo gerado (referência)</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Roteiro usado na narração (somente leitura). Para mudar a fala, volte a etapa e regenere — essa ação tem custo.
                  </p>
                </div>
              </div>
              <Textarea aria-label="Roteiro usado na narração" rows={9} value={data.script} readOnly className="bg-background text-muted-foreground" />
            </section>
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
        </div>
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
