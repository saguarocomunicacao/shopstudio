import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVideoSettings, type DbJob, type RoteiroBloco } from "@/lib/content";
import { withoutDuplicatedHook } from "@/lib/recording-script";
import { DEFAULT_RECORDING_ASPECT_RATIO, RECORDING_FORMATS, normalizeRecordingAspectRatio } from "@/lib/recording-format";
import {
  createOwnVideoJob,
  generateRecordingScript,
  getRecordingVideoUrl,
  saveRecordingScript,
} from "@/lib/recording.functions";
import { RecordingStudio } from "./recording-studio";
import { useStudio } from "./studio-context";
import { VoiceDictationButton } from "./voice-dictation-button";
import { actionError } from "@/lib/api-keys";

const errMessage = (e: unknown) => actionError(e, "Algo deu errado.");

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!value.trim()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copiado.`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Não foi possível copiar. Selecione o texto manualmente.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

/** Origem A: vídeo próprio sobre um assunto livre, sem produto vinculado. */
export function NewOwnVideoDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (jobId: string) => void;
}) {
  const { activeProfileId } = useStudio();
  const qc = useQueryClient();
  const createJob = useServerFn(createOwnVideoJob);
  const generate = useServerFn(generateRecordingScript);
  const [assunto, setAssunto] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      if (!activeProfileId) throw new Error("Selecione um perfil no seletor acima.");
      const { jobId } = await createJob({ data: { profileId: activeProfileId, assunto: assunto.trim() } });
      await generate({ data: { jobId } });
      return jobId;
    },
    onSuccess: (jobId) => {
      toast.success("Roteiro pronto. Agora é só gravar.");
      setAssunto("");
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      onCreated?.(jobId);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !criar.isPending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo vídeo próprio</DialogTitle>
          <DialogDescription>
            Conte o assunto do vídeo. A inteligência artificial escreve o roteiro e você grava lendo o teleprompter.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="assunto-video">Assunto do vídeo</Label>
          <Textarea
            id="assunto-video"
            rows={3}
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Ex: me apresentar e contar o que as pessoas encontram no meu perfil"
          />
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <VoiceDictationButton
              profileId={activeProfileId}
              disabled={criar.isPending}
              onText={(texto) => setAssunto((atual) => (atual.trim() ? `${atual.trim()} ${texto}` : texto))}
            />
            <p className="text-xs text-muted-foreground">Fale o assunto e ajuste o texto depois, se quiser.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button disabled={criar.isPending || assunto.trim().length < 3} onClick={() => criar.mutate()}>
            {criar.isPending ? <><Loader2 className="animate-spin" />Escrevendo roteiro...</> : <><Sparkles />Criar roteiro</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kit de roteiro do formato "Gravar eu mesmo": textos editáveis, copiáveis e estúdio de gravação. */
export function RecordingKitDialog({
  job,
  canEdit,
  onClose,
  openStudioInitially = false,
}: {
  job: DbJob;
  canEdit: boolean;
  onClose: () => void;
  openStudioInitially?: boolean;
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateRecordingScript);
  const save = useServerFn(saveRecordingScript);
  const videoUrl = useServerFn(getRecordingVideoUrl);
  const { data: videoSettings } = useVideoSettings(job.profile_id);

  const [titulo, setTitulo] = useState(job.title ?? "");
  const [gancho, setGancho] = useState(job.hook ?? "");
  const [blocos, setBlocos] = useState<RoteiroBloco[]>(job.roteiro_blocos ?? []);
  const [textoTela, setTextoTela] = useState(job.texto_tela ?? "");
  const [cta, setCta] = useState(job.post_cta ?? "");
  const [caption, setCaption] = useState(job.caption ?? "");
  const [hashtags, setHashtags] = useState((job.hashtags ?? []).join(" "));
  const [studioOpen, setStudioOpen] = useState(openStudioInitially);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  // Snapshot "salvo" dos campos, usado para detectar alterações não salvas (dirty state).
  const savedSnapshot = () =>
    JSON.stringify({
      titulo: (job.title ?? "").trim(),
      gancho: (job.hook ?? "").trim(),
      blocos: (job.roteiro_blocos ?? []).map((b) => ({ tempo: b.tempo.trim(), orientacao: b.orientacao.trim(), fala: b.fala.trim() })),
      textoTela: (job.texto_tela ?? "").trim(),
      cta: (job.post_cta ?? "").trim(),
      caption: (job.caption ?? "").trim(),
      hashtags: (job.hashtags ?? []).join(" ").trim(),
    });
  const [savedKey, setSavedKey] = useState(savedSnapshot);

  const currentKey = JSON.stringify({
    titulo: titulo.trim(),
    gancho: gancho.trim(),
    blocos: blocos.map((b) => ({ tempo: b.tempo.trim(), orientacao: b.orientacao.trim(), fala: b.fala.trim() })),
    textoTela: textoTela.trim(),
    cta: cta.trim(),
    caption: caption.trim(),
    hashtags: hashtags.trim(),
  });
  const isDirty = canEdit && currentKey !== savedKey;

  useEffect(() => {
    setTitulo(job.title ?? "");
    setGancho(job.hook ?? "");
    setBlocos(job.roteiro_blocos ?? []);
    setTextoTela(job.texto_tela ?? "");
    setCta(job.post_cta ?? "");
    setCaption(job.caption ?? "");
    setHashtags((job.hashtags ?? []).join(" "));
    setSavedKey(savedSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  /** Tenta fechar o modal: se há alterações não salvas, pede confirmação; senão, fecha direto. */
  const attemptClose = () => {
    if (isDirty) setConfirmCloseOpen(true);
    else onClose();
  };

  const gravado = !!job.video_path && !!job.recorded_at;
  const recordingAspectRatio = normalizeRecordingAspectRatio(videoSettings?.recording_aspect_ratio ?? DEFAULT_RECORDING_ASPECT_RATIO);

  const download = useQuery({
    queryKey: ["recording-url", job.id, job.video_path],
    enabled: gravado,
    queryFn: () => videoUrl({ data: { jobId: job.id } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs"] });

  const gerar = useMutation({
    mutationFn: () => generate({ data: { jobId: job.id } }),
    onSuccess: () => {
      toast.success("Roteiro gerado.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const salvar = useMutation({
    mutationFn: () =>
      save({
        data: {
          jobId: job.id,
          titulo: titulo.trim(),
          gancho: gancho.trim(),
          blocos: blocos.map((b) => ({ tempo: b.tempo.trim(), orientacao: b.orientacao.trim(), fala: b.fala.trim() })),
          textoTela: textoTela.trim(),
          cta: cta.trim(),
          caption: caption.trim(),
          hashtags: hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Roteiro salvo.");
      // Zera o dirty state: o snapshot salvo passa a refletir o que está nos campos agora.
      setSavedKey(currentKey);
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const temRoteiro = !!gancho || blocos.length > 0;
  const blocosVisiveis = blocos
    .map((bloco, originalIndex) => ({ bloco, originalIndex }))
    .filter(({ bloco }) => withoutDuplicatedHook(gancho, [bloco]).length > 0);
  const roteiroCompleto = [gancho, ...blocosVisiveis.map(({ bloco }) => bloco.fala), cta].filter(Boolean).join("\n\n");

  return (
    <>
      <Dialog open={!studioOpen && !confirmCloseOpen} onOpenChange={(open) => !open && attemptClose()}>
        <DialogContent
          className="max-h-[92vh] max-w-lg overflow-hidden p-0"
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmCloseOpen(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmCloseOpen(true);
            }
          }}
        >
          <div className="max-h-[92vh] overflow-y-auto p-6 [scrollbar-gutter:stable]">
            <DialogHeader>
              <DialogTitle>Gravar eu mesmo</DialogTitle>
              <DialogDescription>
                A inteligência artificial escreve os textos; você grava o vídeo lendo o teleprompter.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-4">
              {gravado && (
                <section className="rounded-xl border p-4">
                  <p className="mb-2 text-sm font-bold">Vídeo gravado</p>
                  {download.data?.url ? (
                    <>
                      <video src={download.data.url} controls playsInline className={`${RECORDING_FORMATS[recordingAspectRatio].mediaClass} w-full rounded-xl bg-black object-contain`} />
                      <Button asChild size="lg" className="mt-3 w-full">
                        <a
                          href={download.data.url}
                          download={`${job.title || "video"}.${job.video_path?.toLowerCase().endsWith(".webm") ? "webm" : "mp4"}`}
                        >
                          <Download />
                          Baixar vídeo
                        </a>
                      </Button>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Preparando o vídeo...
                    </p>
                  )}
                </section>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-titulo">Título / tema</Label>
                  <CopyButton value={titulo} label="Título" />
                </div>
                <Textarea id="rec-titulo" rows={1} value={titulo} onChange={(e) => setTitulo(e.target.value)} readOnly={!canEdit} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-gancho">Gancho (0-3s)</Label>
                  <CopyButton value={gancho} label="Gancho" />
                </div>
                <Textarea id="rec-gancho" rows={2} value={gancho} onChange={(e) => setGancho(e.target.value)} readOnly={!canEdit} />
              </div>

              <section className="grid gap-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">Blocos de tempo</p>
                  <CopyButton value={roteiroCompleto} label="Roteiro" />
                </div>
                {blocosVisiveis.map(({ bloco, originalIndex }) => (
                  <div key={originalIndex} className="grid gap-2 rounded-lg bg-secondary/50 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <Input
                        aria-label="Tempo do bloco"
                        value={bloco.tempo}
                        readOnly={!canEdit}
                        className="h-10 min-w-0 bg-background sm:max-w-28"
                        onChange={(e) =>
                          setBlocos((list) => list.map((b, i) => (i === originalIndex ? { ...b, tempo: e.target.value } : b)))
                        }
                      />
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover bloco"
                          title="Remover bloco"
                          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setBlocos((list) => list.filter((_, i) => i !== originalIndex))}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      aria-label="O que mostrar ou fazer"
                      rows={1}
                      value={bloco.orientacao}
                      readOnly={!canEdit}
                      placeholder="O que mostrar ou fazer"
                      className="w-full bg-background"
                      onChange={(e) =>
                        setBlocos((list) => list.map((b, i) => (i === originalIndex ? { ...b, orientacao: e.target.value } : b)))
                      }
                    />
                    <Textarea
                      aria-label="Fala do bloco"
                      rows={2}
                      value={bloco.fala}
                      readOnly={!canEdit}
                      className="w-full bg-background"
                      onChange={(e) => setBlocos((list) => list.map((b, i) => (i === originalIndex ? { ...b, fala: e.target.value } : b)))}
                    />
                  </div>
                ))}
                {!blocos.length && <p className="text-xs text-muted-foreground">Nenhum bloco ainda. Gere o roteiro com a inteligência artificial.</p>}
                {canEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setBlocos((list) => [...list, { tempo: "", orientacao: "", fala: "" }])}
                  >
                    <Plus />
                    Adicionar bloco
                  </Button>
                )}
              </section>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-texto-tela">Texto na tela</Label>
                  <CopyButton value={textoTela} label="Texto na tela" />
                </div>
                <Textarea id="rec-texto-tela" rows={1} value={textoTela} onChange={(e) => setTextoTela(e.target.value)} readOnly={!canEdit} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-cta">CTA final</Label>
                  <CopyButton value={cta} label="CTA" />
                </div>
                <Textarea id="rec-cta" rows={1} value={cta} onChange={(e) => setCta(e.target.value)} readOnly={!canEdit} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-caption">Legenda do post</Label>
                  <CopyButton value={caption} label="Legenda" />
                </div>
                <Textarea id="rec-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} readOnly={!canEdit} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rec-hashtags">Hashtags</Label>
                  <CopyButton value={hashtags} label="Hashtags" />
                </div>
                <Textarea id="rec-hashtags" rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} readOnly={!canEdit} />
              </div>

              {canEdit && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" disabled={gerar.isPending} onClick={() => gerar.mutate()}>
                    {gerar.isPending ? <Loader2 className="animate-spin" /> : temRoteiro ? <RefreshCw /> : <Sparkles />}
                    {gerar.isPending ? "Gerando..." : temRoteiro ? "Regenerar roteiro" : "Gerar roteiro"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={salvar.isPending}
                    onClick={() => salvar.mutate()}
                    className={`bg-[#25F4EE] text-[#0A0A0A] hover:bg-[#25F4EE]/90${isDirty ? " ring-2 ring-[#25F4EE] ring-offset-2 ring-offset-background animate-pulse" : ""}`}
                  >
                    {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    Salvar alterações
                  </Button>
                </div>
              )}

              {canEdit && (
                <Button size="lg" disabled={!temRoteiro} onClick={() => setStudioOpen(true)}>
                  <Video />
                  {gravado ? "Gravar de novo" : "Gravar vídeo"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {studioOpen && (
        <RecordingStudio
          job={job}
          aspectRatio={recordingAspectRatio}
          onClose={() => setStudioOpen(false)}
          onSaved={onClose}
        />
      )}

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas. Deseja sair sem salvar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmCloseOpen(false);
              }}
            >
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmCloseOpen(false);
                onClose();
              }}
            >
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
