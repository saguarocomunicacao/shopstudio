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

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

/** Linhas do teleprompter: gancho, falas dos blocos e CTA. */
function teleprompterLines(job: DbJob, comTextoTela: boolean) {
  const lines: string[] = [];
  if (job.hook) lines.push(job.hook);
  for (const bloco of job.roteiro_blocos ?? []) {
    if (bloco.fala) lines.push(bloco.fala);
  }
  if (comTextoTela && job.texto_tela) lines.push(`(texto na tela) ${job.texto_tela}`);
  if (job.post_cta) lines.push(job.post_cta);
  if (!lines.length && job.script) lines.push(job.script);
  return lines;
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
  const [comTextoTela, setComTextoTela] = useState(true);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const lines = teleprompterLines(job, comTextoTela);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
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
    [],
  );

  useEffect(() => {
    if (!supported) return;
    void startCamera(facing);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, supported, startCamera]);

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
        el.scrollTop += velocidade * delta;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setRolando(false);
      }
      frame = requestAnimationFrame(step);
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
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const recorded = new Blob(chunksRef.current, { type });
      setBlob(recorded);
      setPreviewUrl(URL.createObjectURL(recorded));
      setRecording(false);
      setRolando(false);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    setRecording(true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setRolando(true);
  };

  const stop = () => recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();

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
      toast.success("Gravação salva. O vídeo está na fila de rascunhos.");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["draft-kit", job.id] });
      onClose();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const tempo = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="truncate text-sm font-bold">{job.title || "Gravar vídeo"}</p>
        <button type="button" aria-label="Fechar estúdio" className="rounded-md p-1.5 hover:bg-white/10" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>

      {!supported ? (
        <div className="m-6 rounded-xl bg-white/10 p-6 text-center text-sm text-white">
          Este navegador não permite gravar vídeo. Abra o Shop Studio pelo Chrome ou Safari atualizado, no celular ou no
          computador, para usar o estúdio.
        </div>
      ) : (
        <div className="relative mx-auto w-full max-w-[520px] flex-1 overflow-hidden">
          {previewUrl ? (
            <video src={previewUrl} controls playsInline className="size-full bg-black object-contain" />
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
              >
                <div className="h-24" />
                {lines.map((line, index) => (
                  <p
                    key={index}
                    className="mb-5 font-bold leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                    style={{ fontSize: `${fonte}px`, transform: espelhado ? "scaleX(-1)" : undefined }}
                  >
                    {line}
                  </p>
                ))}
                <div className="h-40" />
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
                <Button variant="secondary" size="sm" onClick={() => setComTextoTela((v) => !v)}>
                  {comTextoTela ? "Ocultar texto na tela" : "Incluir texto na tela"}
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
              <Button size="lg" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                {salvar.isPending ? "Salvando..." : "Salvar gravação"}
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
                  void startCamera(facing);
                }}
              >
                <RefreshCw />
                Gravar de novo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
