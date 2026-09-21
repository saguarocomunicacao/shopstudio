import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
  Upload,
  X,
  FlipHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { DbJob } from "@/lib/content";
import { createRecordingUploadUrl, finishRecording } from "@/lib/recording.functions";
import { withoutDuplicatedHook } from "@/lib/recording-script";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

type TeleprompterItem = { fala: string; orientacao?: string };

/** Somente o conteúdo falado: gancho e falas dos blocos, com suas dicas de ação. */
function teleprompterItems(job: DbJob) {
  const items: TeleprompterItem[] = [];
  if (job.hook) items.push({ fala: job.hook });
  for (const bloco of withoutDuplicatedHook(job.hook, job.roteiro_blocos ?? [])) {
    if (bloco.fala) {
      items.push(bloco.orientacao ? { fala: bloco.fala, orientacao: bloco.orientacao } : { fala: bloco.fala });
    }
  }
  if (!items.length && job.script) items.push({ fala: job.script });
  return items;
}

function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const supported = typeof MediaRecorder !== "undefined" ? candidates.find((t) => MediaRecorder.isTypeSupported(t)) : undefined;
  return supported ?? "";
}

export function RecordingStudio({ job, onClose }: { job: DbJob; onClose: () => void }) {
  const qc = useQueryClient();
  const getUploadUrl = useServerFn(createRecordingUploadUrl);
  const finish = useServerFn(finishRecording);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const mountedRef = useRef(true);

  const [supported] = useState(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
  );
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [rolando, setRolando] = useState(false);
  const [velocidade, setVelocidade] = useState(28); // pixels por segundo
  const [fonte, setFonte] = useState(30);
  const [espelhado, setEspelhado] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraSession, setCameraSession] = useState(0);

  const teleprompter = teleprompterItems(job);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setError(null);
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Você precisa permitir o acesso à câmera e ao microfone para gravar."
            : "Não foi possível abrir a câmera deste aparelho.",
        );
      }
    },
    [stopStream],
  );

  useEffect(() => {
    if (!supported) return;
    void startCamera(facing);
    return stopStream;
  }, [cameraSession, facing, supported, startCamera, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  // Rolagem suave do teleprompter.
  useEffect(() => {
    if (!rolando) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const el = scrollRef.current;
      const delta = (now - last) / 1000;
      last = now;
      if (el) {
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        scrollPositionRef.current = Math.min(maxScroll, scrollPositionRef.current + velocidade * delta);
        el.scrollTop = scrollPositionRef.current;
        if (scrollPositionRef.current >= maxScroll) setRolando(false);
      }
      if (mountedRef.current) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [rolando, velocidade]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Este navegador não conseguiu iniciar a gravação. Atualize o Chrome ou Safari e tente novamente.");
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      stopStream();
      setRecording(false);
      setRolando(false);
      setError("A gravação foi interrompida pelo navegador. Tente gravar novamente.");
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const recorded = new Blob(chunksRef.current, { type });
      stopStream();
      setRecording(false);
      setRolando(false);
      if (!mountedRef.current) return;
      if (recorded.size === 0) {
        setError("O navegador não gerou o arquivo do vídeo. Tente gravar novamente.");
        return;
      }
      setBlob(recorded);
      setPreviewUrl(URL.createObjectURL(recorded));
    };
    recorderRef.current = recorder;
    try {
      recorder.start(1000);
    } catch {
      setError("Não foi possível iniciar a gravação neste aparelho. Verifique as permissões e tente novamente.");
      return;
    }
    setBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    setRecording(true);
    scrollPositionRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setRolando(true);
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        // Alguns navegadores entregam o último trecho apenas no evento stop.
      }
    }
    recorder.stop();
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!blob) throw new Error("Nada gravado ainda.");
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const { path, token } = await getUploadUrl({ data: { jobId: job.id, extension } });
      const { error: uploadError } = await supabase.storage.from("job-media").uploadToSignedUrl(path, token, blob, {
        contentType: blob.type || "video/webm",
      });
      if (uploadError) throw new Error(uploadError.message);
      await finish({ data: { jobId: job.id, path } });
    },
    onSuccess: () => {
      stopStream();
      toast.success("Gravação salva. O vídeo está na fila de rascunhos.");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["draft-kit", job.id] });
      onClose();
    },
    onError: (e) => toast.error(`Não foi possível salvar. Seu vídeo continua aqui para tentar novamente. ${errMessage(e)}`),
  });

  const tempo = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-bold">{job.title || "Gravar vídeo"}</p>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar estúdio" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>

      {!supported ? (
        <div className="m-6 rounded-xl bg-white/10 p-6 text-center text-sm text-white">
          Este navegador não permite gravar vídeo. Abra o Shop Studio pelo Chrome ou Safari atualizado, no celular ou no
          computador, para usar o estúdio.
        </div>
      ) : (
        <div className="relative mx-auto w-full max-w-[520px] flex-1 overflow-hidden">
          {previewUrl ? (
            <video
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              aria-label="Revisão do vídeo gravado"
              className="size-full bg-black object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              className={`size-full bg-black object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
          )}

          {error && (
            <div className="absolute inset-x-4 top-4 rounded-xl bg-black/80 p-4 text-sm text-white">
              {error}
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void startCamera(facing)}>
                <RefreshCw />
                Tentar de novo
              </Button>
            </div>
          )}

          {!previewUrl && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-t from-black/85 via-black/60 to-transparent">
              <div
                ref={scrollRef}
                className="pointer-events-auto h-full overflow-y-auto px-5 py-8"
                style={{ scrollbarWidth: "none" }}
                onScroll={(event) => {
                  scrollPositionRef.current = event.currentTarget.scrollTop;
                }}
              >
                <div className="h-[65%]" aria-hidden="true" />
                {teleprompter.map((item, index) => (
                  <div
                    key={index}
                    className="mb-7"
                    style={{ transform: espelhado ? "scaleX(-1)" : undefined }}
                  >
                    {item.orientacao && (
                      <p className="mb-2 text-sm font-medium leading-relaxed text-white/60">
                        Dica: {item.orientacao}
                      </p>
                    )}
                    <p
                      className="font-bold leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                      style={{ fontSize: `${fonte}px` }}
                    >
                      {item.fala}
                    </p>
                  </div>
                ))}
                <div className="h-[70%]" aria-hidden="true" />
              </div>
            </div>
          )}

          {recording && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <span className="size-2 animate-pulse rounded-full bg-white" />
              {tempo}
            </span>
          )}
        </div>
      )}

      {supported && (
        <div className="mx-auto w-full max-w-[520px] px-4 pb-6 pt-3">
          {!previewUrl ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-white">
                <Button variant="secondary" size="sm" onClick={() => setRolando((v) => !v)}>
                  {rolando ? <Pause /> : <Play />}
                  {rolando ? "Pausar texto" : "Rolar texto"}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setVelocidade((v) => Math.max(8, v - 6))}>
                  <Minus />
                  Velocidade
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setVelocidade((v) => Math.min(90, v + 6))}>
                  <Plus />
                  Velocidade
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setFonte((f) => Math.max(16, f - 3))}>
                  <Minus />
                  Fonte
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setFonte((f) => Math.min(60, f + 3))}>
                  <Plus />
                  Fonte
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEspelhado((v) => !v)}>
                  <FlipHorizontal />
                  Espelhar texto
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={recording}
                  onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                >
                  <Camera />
                  Virar câmera
                </Button>
              </div>
              <Button
                size="lg"
                className="w-full"
                variant={recording ? "destructive" : "default"}
                disabled={!!error}
                onClick={() => (recording ? stop() : start())}
              >
                {recording ? <><Square />Parar gravação</> : <><Camera />Iniciar gravação</>}
              </Button>
            </>
          ) : (
            <div className="grid gap-2">
              <p className="text-center text-sm font-semibold text-white">Revise sua gravação</p>
              <Button size="lg" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={salvar.isPending}
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setBlob(null);
                  setSeconds(0);
                  scrollPositionRef.current = 0;
                  setError(null);
                  setCameraSession((session) => session + 1);
                }}
              >
                <RefreshCw />
                Regravar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
