import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  Camera,
  FlipHorizontal,
  Loader2,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  SlidersHorizontal,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { DbJob } from "@/lib/content";
import { createRecordingUploadUrl, finishRecording } from "@/lib/recording.functions";
import { withoutDuplicatedHook } from "@/lib/recording-script";
import { createSkinSmoother, type SkinIntensity, type SkinSmoother } from "@/lib/skin-smoothing";

const INTENSIDADES: { id: SkinIntensity; label: string }[] = [
  { id: "leve", label: "Leve" },
  { id: "medio", label: "Médio" },
  { id: "forte", label: "Forte" },
];

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

const FILTROS = [
  { id: "nenhum", label: "Nenhum", css: "" },
  { id: "natural", label: "Natural", css: "brightness(1.06) contrast(1.06)" },
  { id: "quente", label: "Quente", css: "sepia(0.25) saturate(1.2) brightness(1.04)" },
  { id: "frio", label: "Frio", css: "hue-rotate(15deg) saturate(1.1) brightness(1.03)" },
  { id: "vivido", label: "Vívido", css: "saturate(1.45) contrast(1.1)" },
  { id: "suave", label: "Suave", css: "blur(0.7px) brightness(1.08) saturate(1.05)" },
  { id: "pb", label: "P&B", css: "grayscale(1) contrast(1.12)" },
] as const;

type FiltroId = (typeof FILTROS)[number]["id"];

/** Saída sempre vertical 9:16, pronta para o TikTok. */
const OUT_W = 1080;
const OUT_H = 1920;

/** Recorte central "cover" da câmera para preencher o quadro 9:16 sem tarjas. */
function cropCover(sourceW: number, sourceH: number) {
  const target = OUT_W / OUT_H;
  const source = sourceW / sourceH;
  if (source > target) {
    const sw = sourceH * target;
    return { sx: (sourceW - sw) / 2, sy: 0, sw, sh: sourceH };
  }
  const sh = sourceW / target;
  return { sx: 0, sy: (sourceH - sh) / 2, sw: sourceW, sh };
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

export function RecordingStudio({
  job,
  onClose,
  onSaved,
}: {
  job: DbJob;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const getUploadUrl = useServerFn(createRecordingUploadUrl);
  const finish = useServerFn(finishRecording);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const frameRef = useRef(0);
  const lastScrollFrameRef = useRef(0);
  const scrollingRef = useRef(false);
  const scrollTickRef = useRef<(timestamp: number) => void>(() => undefined);
  const velocidadeRef = useRef(28);
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
  const [filtro, setFiltro] = useState<FiltroId>("nenhum");
  const [reduzirRuido, setReduzirRuido] = useState(true);
  const [suavizar, setSuavizar] = useState(false);
  const [intensidade, setIntensidade] = useState<SkinIntensity>("leve");
  const [suavizarStatus, setSuavizarStatus] = useState<"off" | "carregando" | "ativo">("off");
  const [painel, setPainel] = useState<"ajustes" | "texto" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smootherRef = useRef<SkinSmoother | null>(null);
  const suavizarRef = useRef(false);
  const recordingRef = useRef(false);
  const canvasCleanupRef = useRef<() => void>(() => undefined);
  const filtroCss = FILTROS.find((f) => f.id === filtro)?.css ?? "";

  const teleprompter = teleprompterItems(job);
  recordingRef.current = recording;
  suavizarRef.current = suavizar && suavizarStatus === "ativo";
  velocidadeRef.current = velocidade;

  const cancelScrollFrame = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    lastScrollFrameRef.current = 0;
  }, []);

  const stopScrolling = useCallback(() => {
    scrollingRef.current = false;
    cancelScrollFrame();
    if (mountedRef.current) setRolando(false);
  }, [cancelScrollFrame]);

  scrollTickRef.current = (now: number) => {
    frameRef.current = 0;
    if (!mountedRef.current || !scrollingRef.current) return;

    const el = scrollRef.current;
    if (!el) {
      lastScrollFrameRef.current = now;
      frameRef.current = requestAnimationFrame((timestamp) => scrollTickRef.current(timestamp));
      return;
    }

    const previous = lastScrollFrameRef.current;
    // Ao voltar de uma aba suspensa, o primeiro quadro apenas redefine o relógio.
    const deltaSeconds = previous ? Math.min(0.05, Math.max(0, (now - previous) / 1000)) : 0;
    lastScrollFrameRef.current = now;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const next = Math.min(maxScroll, scrollPositionRef.current + velocidadeRef.current * deltaSeconds);
    scrollPositionRef.current = next;
    el.scrollTop = next;

    if (maxScroll <= 0 || next >= maxScroll - 0.5) {
      stopScrolling();
      return;
    }
    frameRef.current = requestAnimationFrame((timestamp) => scrollTickRef.current(timestamp));
  };

  const startScrolling = useCallback(() => {
    cancelScrollFrame();
    const el = scrollRef.current;
    if (el) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (scrollPositionRef.current >= maxScroll - 2) {
        scrollPositionRef.current = 0;
        el.scrollTop = 0;
      }
    }
    scrollingRef.current = true;
    setRolando(true);
    frameRef.current = requestAnimationFrame((timestamp) => scrollTickRef.current(timestamp));
  }, [cancelScrollFrame]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (mode: "user" | "environment", limparRuido: boolean) => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: limparRuido
            ? { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
            : { noiseSuppression: false, echoCancellation: false, autoGainControl: false },
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
    void startCamera(facing, reduzirRuido);
    return stopStream;
  }, [cameraSession, facing, reduzirRuido, supported, startCamera, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scrollingRef.current = false;
      cancelScrollFrame();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      stopStream();
    };
  }, [cancelScrollFrame, stopStream]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  // Descarta timestamps antigos quando a aba volta, evitando saltos sem matar o loop.
  useEffect(() => {
    const onVisibilityChange = () => {
      lastScrollFrameRef.current = 0;
      if (document.visibilityState === "visible" && scrollingRef.current && !frameRef.current) {
        frameRef.current = requestAnimationFrame((timestamp) => scrollTickRef.current(timestamp));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /** Liga/desliga a rolagem. Se o texto já terminou, recomeça do topo em vez de ficar inerte. */
  const alternarRolagem = useCallback(() => {
    if (scrollingRef.current) stopScrolling();
    else startScrolling();
  }, [startScrolling, stopScrolling]);

  // Pipeline de imagem: recorta o quadro da câmera em 9:16, aplica filtros e alimenta preview e gravação.
  useEffect(() => {
    if (previewUrl || !supported) return;
    let cancelled = false;
    let frame = 0;
    let frames = 0;
    let janela = performance.now();
    let lastDrawAt = 0;

    const loop = (now: number) => {
      if (now - lastDrawAt < 1000 / 30) {
        if (!cancelled) frame = requestAnimationFrame(loop);
        return;
      }
      lastDrawAt = now;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const smoother = smootherRef.current;
      if (video && canvas && video.videoWidth && video.videoHeight) {
        if (canvas.width !== OUT_W) {
          canvas.width = OUT_W;
          canvas.height = OUT_H;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const crop = cropCover(video.videoWidth, video.videoHeight);
          const drawSource = (target: CanvasRenderingContext2D) => {
            target.filter = filtroCss || "none";
            try {
              target.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, OUT_W, OUT_H);
            } catch {
              // quadro ainda indisponível
            }
            target.filter = "none";
          };
          drawSource(ctx);
          if (smoother && suavizarRef.current) {
            try {
              smoother.render(ctx, video, {
                intensity: intensidade,
                timestamp: now,
                drawSource,
                project: (x, y) => ({
                  x: (x * video.videoWidth - crop.sx) * (OUT_W / crop.sw),
                  y: (y * video.videoHeight - crop.sy) * (OUT_H / crop.sh),
                }),
              });
            } catch {
              // segue mostrando o quadro sem suavização
            }
          }
        }
        if (suavizarRef.current) {
          frames += 1;
          const elapsed = performance.now() - janela;
          if (elapsed > 5000) {
            const fps = (frames * 1000) / elapsed;
            frames = 0;
            janela = performance.now();
            if (fps < 10 && !recordingRef.current) {
              toast.warning("Suavizar pele foi desligado: ficou pesado neste aparelho. A gravação segue normal.");
              setSuavizar(false);
            }
          }
        } else {
          frames = 0;
          janela = performance.now();
        }
      }
      if (!cancelled) frame = requestAnimationFrame(loop);
    };

     frame = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [filtroCss, intensidade, previewUrl, supported]);

  // Carrega a suavização de pele só quando a pessoa liga o recurso.
  useEffect(() => {
    if (!suavizar || previewUrl || !supported) {
      setSuavizarStatus("off");
      return;
    }
    let cancelled = false;
    setSuavizarStatus("carregando");
    createSkinSmoother()
      .then((s) => {
        if (cancelled) {
          s.close();
          return;
        }
        smootherRef.current = s;
        setSuavizarStatus("ativo");
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Não foi possível carregar a suavização de pele. Você pode gravar normalmente sem ela.");
        setSuavizar(false);
      });
    return () => {
      cancelled = true;
      smootherRef.current?.close();
      smootherRef.current = null;
    };
  }, [suavizar, previewUrl, supported]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  /** Grava sempre pelo canvas 9:16, então o arquivo salvo tem o mesmo enquadramento e filtros do preview. */
  const buildFilteredStream = (base: MediaStream): MediaStream => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") return base;
    const output = canvas.captureStream(30);
    if (!output.getVideoTracks().length) return base;
    base.getAudioTracks().forEach((audio) => output.addTrack(audio));
    canvasCleanupRef.current = () => {
      output.getVideoTracks().forEach((t) => t.stop());
      canvasCleanupRef.current = () => undefined;
    };
    return output;
  };

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recordingStream = buildFilteredStream(stream);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    } catch {
      canvasCleanupRef.current();
      setError("Este navegador não conseguiu iniciar a gravação. Atualize o Chrome ou Safari e tente novamente.");
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      canvasCleanupRef.current();
      stopStream();
      setRecording(false);
      stopScrolling();
      setError("A gravação foi interrompida pelo navegador. Tente gravar novamente.");
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const recorded = new Blob(chunksRef.current, { type });
      canvasCleanupRef.current();
      stopStream();
      setRecording(false);
      stopScrolling();
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
      canvasCleanupRef.current();
      setError("Não foi possível iniciar a gravação neste aparelho. Verifique as permissões e tente novamente.");
      return;
    }
    setBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    setRecording(true);
    scrollPositionRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    startScrolling();
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
      (onSaved ?? onClose)();
    },
    onError: (e) => toast.error(`Não foi possível salvar. Seu vídeo continua aqui para tentar novamente. ${errMessage(e)}`),
  });

  const tempo = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black">
      {!supported ? (
        <div className="m-6 rounded-xl bg-white/10 p-6 text-center text-sm text-white">
          Este navegador não permite gravar vídeo. Abra o Shop Studio pelo Chrome ou Safari atualizado, no celular ou no
          computador, para usar o estúdio.
        </div>
      ) : (
        <div className="relative aspect-[9/16] h-full max-h-[100dvh] w-auto max-w-full overflow-hidden bg-black">
          {previewUrl ? (
            <video
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              aria-label="Revisão do vídeo gravado"
              className="size-full bg-black object-cover"
            />
          ) : (
            <>
              {/* Fonte da câmera: fica oculta, o que aparece é o quadro 9:16 desenhado no canvas. */}
              <video
                ref={videoRef}
                muted
                playsInline
                className="pointer-events-none absolute inset-0 size-full opacity-0"
              />
              <canvas
                ref={canvasRef}
                className={`size-full bg-black object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
              />
            </>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <p className="min-w-0 truncate pt-2 text-sm font-bold">{job.title || "Gravar vídeo"}</p>
            <Button type="button" variant="ghost" size="icon" aria-label="Fechar estúdio" title="Fechar estúdio" className="pointer-events-auto shrink-0 bg-black/30 text-white backdrop-blur-md hover:bg-black/50 hover:text-white" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </div>

          {error && (
            <div className="absolute inset-x-4 top-20 z-30 rounded-xl bg-black/80 p-4 text-sm text-white backdrop-blur-md">
              {error}
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void startCamera(facing, reduzirRuido)}>
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
            <span className="absolute left-3 top-16 z-20 inline-flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">
              <span className="size-2 animate-pulse rounded-full bg-white" />
              {tempo}
            </span>
          )}

          {!previewUrl ? (
            <>
              <div className="absolute right-3 top-24 z-20 flex flex-col gap-3">
                <Button variant="secondary" size="icon" aria-label="Ajustes da câmera" title="Ajustes da câmera" className="rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/65 hover:text-white" onClick={() => setPainel((p) => p === "ajustes" ? null : "ajustes")}>
                  <SlidersHorizontal />
                </Button>
                <Button variant="secondary" size="icon" aria-label="Ajustes do texto" title="Ajustes do texto" className="rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/65 hover:text-white" onClick={() => setPainel((p) => p === "texto" ? null : "texto")}>
                  <Type />
                </Button>
              </div>

              <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 grid grid-cols-[1fr_auto_1fr] items-end px-4">
                <Button variant="secondary" size="icon" aria-label={rolando ? "Pausar texto" : "Rolar texto"} title={rolando ? "Pausar texto" : "Rolar texto"} className="justify-self-start rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/65 hover:text-white" onClick={alternarRolagem}>
                  {rolando ? <Pause /> : <Play />}
                </Button>
                <Button size="icon" aria-label={recording ? "Parar gravação" : "Iniciar gravação"} title={recording ? "Parar gravação" : "Iniciar gravação"} className={`size-16 rounded-full border-4 border-white shadow-xl ${recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`} disabled={!!error} onClick={() => (recording ? stop() : start())}>
                  {recording ? <Square className="size-6 fill-current" /> : <span className="size-7 rounded-full bg-current" />}
                </Button>
                <span />
              </div>

              {painel && (
                <div className="absolute inset-0 z-30 flex items-end bg-black/35" onPointerDown={() => setPainel(null)}>
                  <section aria-label={painel === "ajustes" ? "Ajustes da câmera" : "Ajustes do texto"} className="max-h-[68%] w-full overflow-y-auto rounded-t-2xl bg-popover/95 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-popover-foreground shadow-2xl backdrop-blur-xl" onPointerDown={(event) => event.stopPropagation()}>
                    <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/35" />
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="font-bold">{painel === "ajustes" ? "Ajustes da câmera" : "Ajustes do texto"}</h2>
                      <Button variant="ghost" size="icon" aria-label="Fechar ajustes" onClick={() => setPainel(null)}><X /></Button>
                    </div>
                    {painel === "ajustes" ? (
                      <div className="grid gap-5">
                        <div>
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">Filtro de imagem</p>
                          <div className="flex flex-wrap gap-2">
                            {FILTROS.map((f) => <Button key={f.id} type="button" size="sm" variant={filtro === f.id ? "default" : "secondary"} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.label}</Button>)}
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Button variant={suavizar ? "default" : "secondary"} size="sm" disabled={recording} aria-pressed={suavizar} onClick={() => setSuavizar((v) => !v)}>
                            {suavizarStatus === "carregando" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            {suavizar ? suavizarStatus === "carregando" ? "Preparando suavização..." : "Suavizar pele: ligado" : "Suavizar pele (beta)"}
                          </Button>
                          {suavizar && <div className="flex flex-wrap gap-2">{INTENSIDADES.map((i) => <Button key={i.id} type="button" size="sm" variant={intensidade === i.id ? "default" : "secondary"} aria-pressed={intensidade === i.id} disabled={recording} onClick={() => setIntensidade(i.id)}>{i.label}</Button>)}</div>}
                          <p className="text-xs text-muted-foreground">Beta. Pode deixar a gravação mais lenta em celulares mais simples. Se travar, desligue.</p>
                        </div>
                        <Button variant={reduzirRuido ? "default" : "secondary"} size="sm" disabled={recording} aria-pressed={reduzirRuido} onClick={() => setReduzirRuido((v) => !v)}>
                          {reduzirRuido ? <Mic /> : <MicOff />}{reduzirRuido ? "Reduzir ruído: ligado" : "Reduzir ruído: desligado"}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={recording} onClick={() => { setFacing((f) => f === "user" ? "environment" : "user"); setPainel(null); }}><Camera />Virar câmera</Button>
                      </div>
                    ) : (
                      <div className="grid gap-5">
                        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2"><span className="text-sm font-semibold">Velocidade: {velocidade}</span><Button variant="secondary" size="icon" aria-label="Diminuir velocidade" onClick={() => setVelocidade((v) => Math.max(8, v - 6))}><Minus /></Button><Button variant="secondary" size="icon" aria-label="Aumentar velocidade" onClick={() => setVelocidade((v) => Math.min(90, v + 6))}><Plus /></Button></div>
                        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2"><span className="text-sm font-semibold">Fonte: {fonte}</span><Button variant="secondary" size="icon" aria-label="Diminuir fonte" onClick={() => setFonte((f) => Math.max(16, f - 3))}><Minus /></Button><Button variant="secondary" size="icon" aria-label="Aumentar fonte" onClick={() => setFonte((f) => Math.min(60, f + 3))}><Plus /></Button></div>
                        <Button variant={espelhado ? "default" : "secondary"} size="sm" aria-pressed={espelhado} onClick={() => setEspelhado((v) => !v)}><FlipHorizontal />{espelhado ? "Texto espelhado" : "Espelhar texto"}</Button>
                        <Button variant="secondary" size="sm" onClick={() => { alternarRolagem(); setPainel(null); }}>{rolando ? <Pause /> : <Play />}{rolando ? "Pausar texto" : "Rolar texto"}</Button>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-x-0 bottom-0 z-20 grid gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16">
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
