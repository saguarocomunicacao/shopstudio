import { Check, Crop as CropIcon, Loader2, Pause, Play, RotateCcw, Scissors, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildFfmpegArgs,
  EDIT_INPUT,
  keepRanges,
  normalizeCuts,
  resultingDuration,
  type CutOperation,
  type CropOperation,
  type VideoEditOperation,
  type VideoSourceSize,
} from "@/lib/video-edit";
import { RECORDING_ASPECT_RATIOS, RECORDING_FORMATS, type RecordingAspectRatio } from "@/lib/recording-format";

/** Núcleo do ffmpeg servido pelo próprio app e carregado só quando o editor abre. */
import coreWasmAsset from "@/assets/ffmpeg-core.wasm.asset.json";

type FFmpegLike = {
  on: (event: "progress", cb: (e: { progress: number }) => void) => void;
  load: (opts: { coreURL: string; wasmURL: string; classWorkerURL?: string }) => Promise<boolean>;
  writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
  readFile: (name: string) => Promise<unknown>;
  deleteFile: (name: string) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  terminate: () => void;
};

const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function formatTime(value: number) {
  const total = Math.max(0, Math.round(value * 10) / 10);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

function initialCrop(aspectRatio: RecordingAspectRatio, source: VideoSourceSize, coverage = 1): CropOperation {
  const output = RECORDING_FORMATS[aspectRatio];
  const relativeRatio = (output.width / output.height) / (source.width / source.height);
  const width = relativeRatio >= 1 ? coverage : coverage * relativeRatio;
  const height = relativeRatio >= 1 ? coverage / relativeRatio : coverage;
  return { type: "crop", aspectRatio, x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

type EditorSnapshot = { start: number; end: number; cuts: CutOperation[]; crop: CropOperation | null };

const FILMSTRIP_MIN_FRAMES = 8;
const FILMSTRIP_MAX_FRAMES = 15;

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, resolveEvent);
      video.removeEventListener("error", rejectEvent);
    };
    const resolveEvent = () => {
      cleanup();
      resolve();
    };
    const rejectEvent = () => {
      cleanup();
      reject(new Error("Não foi possível ler um frame do vídeo."));
    };
    video.addEventListener(eventName, resolveEvent, { once: true });
    video.addEventListener("error", rejectEvent, { once: true });
  });
}

/** Tira visual leve, extraída localmente sem alterar nem reencodar o vídeo. */
function VideoFilmstrip({ source, duration }: { source: Blob; duration: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [frameCount, setFrameCount] = useState(FILMSTRIP_MIN_FRAMES);
  const [frames, setFrames] = useState<(string | null)[]>(() => Array(FILMSTRIP_MIN_FRAMES).fill(null));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width <= 0) return;
      setFrameCount(Math.min(FILMSTRIP_MAX_FRAMES, Math.max(FILMSTRIP_MIN_FRAMES, Math.round(width / 72))));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (duration <= 0 || frameCount <= 0) return;
    let cancelled = false;
    const objectUrl = URL.createObjectURL(source);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    setFrames(Array(frameCount).fill(null));

    const extract = async () => {
      try {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          video.load();
          await waitForVideoEvent(video, "loadedmetadata");
        }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await waitForVideoEvent(video, "loadeddata");
        }
        const usableDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
        const canvas = document.createElement("canvas");
        canvas.width = 112;
        canvas.height = 64;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context || !video.videoWidth || !video.videoHeight) return;

        const sourceRatio = video.videoWidth / video.videoHeight;
        const targetRatio = canvas.width / canvas.height;
        const sourceWidth = sourceRatio > targetRatio ? video.videoHeight * targetRatio : video.videoWidth;
        const sourceHeight = sourceRatio > targetRatio ? video.videoHeight : video.videoWidth / targetRatio;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        const sourceY = (video.videoHeight - sourceHeight) / 2;

        for (let index = 0; index < frameCount && !cancelled; index += 1) {
          const target = Math.min(Math.max(0.01, ((index + 0.5) / frameCount) * usableDuration), Math.max(0.01, usableDuration - 0.03));
          if (Math.abs(video.currentTime - target) > 0.01) {
            const seeked = waitForVideoEvent(video, "seeked");
            video.currentTime = target;
            await seeked;
          }
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForVideoEvent(video, "loadeddata");
          if (cancelled) break;
          context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL("image/jpeg", 0.58);
          setFrames((current) => current.map((value, frameIndex) => (frameIndex === index ? frame : value)));
          await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
        }
      } catch (error) {
        if (!cancelled) console.warn("Editor de vídeo: não foi possível gerar a tira de miniaturas", error);
      }
    };

    void extract();
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [duration, frameCount, source]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-0 flex overflow-hidden rounded-md bg-muted" aria-hidden="true">
      {frames.map((frame, index) => (
        <div key={index} className="min-w-0 flex-1 border-r border-background/30 last:border-r-0">
          {frame ? <img src={frame} alt="" className="size-full object-cover" draggable={false} /> : <div className="size-full animate-pulse bg-muted-foreground/15" />}
        </div>
      ))}
    </div>
  );
}

export function VideoEditor({
  source,
  onCancel,
  onApply,
  initialOperations,
}: {
  source: Blob;
  onCancel: (operations: VideoEditOperation[]) => void;
  onApply: (edited: Blob, operations: VideoEditOperation[]) => void;
  /** Edições anteriores: ao reabrir, o editor volta com os mesmos ajustes. */
  initialOperations?: VideoEditOperation[];
}) {
  const initialRef = useRef(initialOperations);
  const initialTrim = initialRef.current?.find((op): op is { type: "trim"; start: number; end: number } => op.type === "trim");
  const trimEndRef = useRef<number | null>(initialTrim?.end ?? null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const ffmpegRef = useRef<FFmpegLike | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoSize, setVideoSize] = useState<VideoSourceSize | null>(null);
  const [start, setStart] = useState(initialTrim?.start ?? 0);
  const [end, setEnd] = useState(0);
  const [mode, setMode] = useState<"trim" | "cut" | "crop">("trim");
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(0);
  const [cuts, setCuts] = useState<CutOperation[]>(() => initialRef.current?.filter((op): op is CutOperation => op.type === "cut") ?? []);
  const [crop, setCrop] = useState<CropOperation | null>(() => initialRef.current?.find((op): op is CropOperation => op.type === "crop") ?? null);
  /** Pilha de estados anteriores: cada corte/aparo entra aqui para o "Desfazer". */
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const rangesRef = useRef<{ start: number; end: number }[]>([]);
  const [engine, setEngine] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);

  // Carrega o ffmpeg.wasm apenas aqui dentro, nunca no boot do aplicativo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const instance = new FFmpeg() as unknown as FFmpegLike;
        instance.on("progress", ({ progress }) => {
          if (!cancelled && Number.isFinite(progress)) {
            // O FFmpeg pode reportar 100% antes de finalizar a escrita do arquivo.
            // Reservamos 100% para depois da leitura e validação da saída.
            setProgresso(Math.max(0, Math.min(99, Math.round(progress * 100))));
          }
        });
        await instance.load({
          coreURL: new URL("/ffmpeg/ffmpeg-core.esm.js", window.location.origin).href,
          wasmURL: new URL(coreWasmAsset.url, window.location.origin).href,
        });
        if (cancelled) {
          instance.terminate();
          return;
        }
        ffmpegRef.current = instance;
        setEngine("pronto");
      } catch (e) {
        console.error("Editor de vídeo: falha ao carregar o ffmpeg", e);
        if (!cancelled) setEngine("erro");
      }
    })();
    return () => {
      cancelled = true;
      ffmpegRef.current?.terminate();
      ffmpegRef.current = null;
    };
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const timeFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  }, [duration]);

  const dragHandle = (handle: "start" | "end" | "cutStart" | "cutEnd") => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!trackRef.current || duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (handle === "start" || handle === "end") {
      const snapshot = { start, end, cuts, crop };
      setHistory((current) => [...current, snapshot]);
    }
    const move = (clientX: number) => {
      const time = timeFromPointer(clientX);
      if (handle === "start") {
        const next = Math.min(time, end - 0.2);
        setStart(Math.max(0, next));
        setCuts((current) => normalizeCuts(current, Math.max(0, next), end));
        seek(Math.max(0, next));
      } else if (handle === "end") {
        const next = Math.max(time, start + 0.2);
        setEnd(Math.min(duration, next));
        setCuts((current) => normalizeCuts(current, start, Math.min(duration, next)));
        seek(Math.min(duration, next));
      } else if (handle === "cutStart") {
        const next = Math.min(Math.max(time, start), cutEnd - 0.2);
        setCutStart(next);
        seek(next);
      } else {
        const next = Math.max(Math.min(time, end), cutStart + 0.2);
        setCutEnd(next);
        seek(next);
      }
    };
    move(event.clientX);
    const onMove = (e: PointerEvent) => move(e.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const selectCropRatio = (aspectRatio: RecordingAspectRatio) => {
    if (!videoSize) return;
    setHistory((current) => [...current, { start, end, cuts, crop }]);
    setCrop(initialCrop(aspectRatio, videoSize));
    setErro(null);
  };

  const dragCrop = (kind: "move" | "nw" | "ne" | "sw" | "se") => (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const frame = videoFrameRef.current;
    if (!frame || !crop || !videoSize) return;
    const rect = frame.getBoundingClientRect();
    const originX = event.clientX;
    const originY = event.clientY;
    const original = { ...crop };
    const format = RECORDING_FORMATS[crop.aspectRatio];
    const normalizedRatio = (format.width / format.height) / (videoSize.width / videoSize.height);
    setHistory((current) => [...current, { start, end, cuts, crop }]);

    const onMove = (moveEvent: PointerEvent) => {
      // Na ferramenta Enquadrar o quadro é desenhado sobre o vídeo original
      // inteiro, então o gesto já corresponde diretamente às coordenadas dele.
      const dx = (moveEvent.clientX - originX) / rect.width;
      const dy = (moveEvent.clientY - originY) / rect.height;
      if (kind === "move") {
        setCrop({
          ...original,
          x: Math.min(1 - original.width, Math.max(0, original.x + dx)),
          y: Math.min(1 - original.height, Math.max(0, original.y + dy)),
        });
        return;
      }
      const fromLeft = kind === "nw" || kind === "sw";
      const fromTop = kind === "nw" || kind === "ne";
      const oppositeX = fromLeft ? original.x + original.width : original.x;
      const oppositeY = fromTop ? original.y + original.height : original.y;
      const pointerX = fromLeft ? original.x + dx : original.x + original.width + dx;
      const pointerY = fromTop ? original.y + dy : original.y + original.height + dy;
      let width = Math.max(Math.abs(oppositeX - pointerX), Math.abs(oppositeY - pointerY) * normalizedRatio);
      const maxWidth = fromLeft ? oppositeX : 1 - oppositeX;
      const maxHeight = fromTop ? oppositeY : 1 - oppositeY;
      width = Math.max(0.12, Math.min(width, maxWidth, maxHeight * normalizedRatio));
      const height = width / normalizedRatio;
      setCrop({ ...original, width, height, x: fromLeft ? oppositeX - width : oppositeX, y: fromTop ? oppositeY - height : oppositeY });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const aparado = start > 0.05 || end < duration - 0.05;
  const operations: VideoEditOperation[] = [
    ...(aparado ? [{ type: "trim" as const, start, end }] : []),
    ...cuts,
    ...(crop ? [crop] : []),
  ];
  /** Trechos que permanecem: o player usa esta lista para pular o que foi cortado. */
  const ranges = duration > 0 ? keepRanges(duration, operations) : [];
  rangesRef.current = ranges;
  const validResult = duration > 0 && ranges.length > 0;

  /** Seleção padrão da tesoura: meio do maior trecho ainda preservado. */
  const cutSelectionFor = (list: { start: number; end: number }[]) => {
    const maior = list.reduce<{ start: number; end: number } | null>(
      (melhor, range) => (!melhor || range.end - range.start > melhor.end - melhor.start ? range : melhor),
      null,
    );
    const base = maior ?? { start, end };
    const span = Math.max(0.2, base.end - base.start);
    return { start: base.start + span * 0.35, end: base.start + span * 0.65 };
  };

  const addCut = () => {
    if (cutEnd - cutStart < 0.2) return;
    const next = normalizeCuts([...cuts, { type: "cut", start: cutStart, end: cutEnd }], start, end);
    const restantes = keepRanges(duration, [...(aparado ? [{ type: "trim" as const, start, end }] : []), ...next]);
    if (!restantes.length) {
      setErro("O corte não pode remover o vídeo inteiro.");
      return;
    }
    setHistory((current) => [...current, { start, end, cuts, crop }]);
    setCuts(next);
    setErro(null);
    // A seleção volta para um trecho ainda preservado, pronta para o próximo corte.
    const selecao = cutSelectionFor(restantes);
    setCutStart(selecao.start);
    setCutEnd(selecao.end);
    // O corte vale na hora: se o cursor estava dentro dele, pula para a continuação.
    const video = videoRef.current;
    if (video && video.currentTime >= cutStart && video.currentTime < cutEnd) seek(Math.min(cutEnd, end));
  };


  const desfazer = () => {
    setHistory((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      setStart(previous.start);
      setEnd(previous.end);
      setCuts(previous.cuts);
      setCrop(previous.crop);
      setErro(null);
      return current.slice(0, -1);
    });
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const list = rangesRef.current;
    const first = list[0];
    const dentro = list.some((range) => video.currentTime >= range.start && video.currentTime < range.end - 0.05);
    if (first && !dentro) seek(first.start);
    await video.play().catch(() => undefined);
  };

  const aplicar = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !operations.length) return;
    setProcessando(true);
    setProgresso(0);
    setErro(null);
    const inputExtension = source.type.includes("mp4") ? "mp4" : "webm";
    const outputExtension = cuts.length || crop ? "mp4" : inputExtension;
    const input = `${EDIT_INPUT}.${inputExtension}`;
    const output = `saida.${outputExtension}`;
    try {
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(input, await fetchFile(source));
      let exitCode = await ffmpeg.exec(buildFfmpegArgs(operations, input, output, duration, true, videoSize ?? undefined));
      // Alguns vídeos importados não têm faixa de áudio. Nesse caso, repete o
      // mesmo pipeline apenas com vídeo em vez de tornar a edição indisponível.
      if (exitCode !== 0 && operations.some((operation) => operation.type !== "trim")) {
        await ffmpeg.deleteFile(output).catch(() => undefined);
        exitCode = await ffmpeg.exec(buildFfmpegArgs(operations, input, output, duration, false, videoSize ?? undefined));
      }
      if (exitCode !== 0) throw new Error(`ffmpeg ${exitCode}`);
      const data = (await ffmpeg.readFile(output)) as Uint8Array;
      if (!data?.length) throw new Error("vazio");
      const edited = new Blob([data.slice().buffer as ArrayBuffer], { type: `video/${outputExtension}` });
      await ffmpeg.deleteFile(input).catch(() => undefined);
      await ffmpeg.deleteFile(output).catch(() => undefined);
      setProgresso(100);
      // Mantém o estado concluído visível antes de retornar à revisão.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 250));
        });
      });
      onApply(edited, operations);
    } catch {
      setErro("Não foi possível aplicar o corte neste aparelho. Tente novamente ou salve o vídeo sem editar.");
    } finally {
      setProcessando(false);
    }
  };

  const pct = (value: number) => (duration > 0 ? (value / duration) * 100 : 0);
  // Fora da ferramenta Enquadrar, o preview composto mostra o resultado do
  // crop. Em Enquadrar, o vídeo original permanece imóvel sob a moldura.
  const adjustingCrop = mode === "crop";
  const previewFormat = crop && !adjustingCrop ? RECORDING_FORMATS[crop.aspectRatio] : null;
  const previewTransform = crop && !adjustingCrop
    ? {
        width: `${100 / crop.width}%`,
        height: `${100 / crop.height}%`,
        left: `${(-crop.x / crop.width) * 100}%`,
        top: `${(-crop.y / crop.height) * 100}%`,
      }
    : undefined;

  if (processando) {
    const circumference = 2 * Math.PI * 48;
    const progressOffset = circumference * (1 - progresso / 100);

    return (
      <div className="dark fixed inset-0 z-[80] grid h-screen w-screen place-items-center overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] text-foreground supports-[height:100dvh]:h-[100dvh]">
        <div className="grid justify-items-center gap-7 text-center" role="status" aria-live="polite" aria-label={`Aplicando edição, ${progresso}% concluído`}>
          <div className="relative grid size-36 place-items-center">
            <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="48" fill="none" strokeWidth="8" className="stroke-muted" />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
                className="stroke-brand-cyan transition-[stroke-dashoffset] duration-300"
              />
            </svg>
            <span className="text-2xl font-bold tabular-nums">{progresso}%</span>
          </div>
          <div className="grid gap-2">
            <h2 className="text-xl font-bold">Aplicando edição...</h2>
            <p className="max-w-xs text-sm text-muted-foreground">Mantenha esta tela aberta até o vídeo ficar pronto.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] grid h-screen w-screen min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground supports-[height:100dvh]:h-[100dvh] max-sm:box-border max-sm:pl-[env(safe-area-inset-left)] max-sm:pr-[env(safe-area-inset-right)]">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold sm:text-base">Editar vídeo</p>
          <p className="truncate text-xs text-muted-foreground">O original será preservado</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar editor" onClick={() => onCancel(operations)} disabled={processando}>
          <X />
        </Button>
      </header>

      <main className="flex min-h-0 items-center justify-center overflow-hidden bg-muted/30 p-3 sm:p-5">
        <div className="grid size-full min-h-0 place-items-center overflow-hidden [container-type:size]">
          <div
            ref={videoFrameRef}
            className="relative overflow-hidden bg-background shadow-2xl"
            style={videoSize ? {
              aspectRatio: previewFormat ? `${previewFormat.width} / ${previewFormat.height}` : `${videoSize.width} / ${videoSize.height}`,
              width: `min(100cqw, calc(100cqh * ${previewFormat ? previewFormat.width / previewFormat.height : videoSize.width / videoSize.height}))`,
              height: `min(100cqh, calc(100cqw * ${previewFormat ? previewFormat.height / previewFormat.width : videoSize.height / videoSize.width}))`,
            } : undefined}
          >
            <video
            ref={videoRef}
            src={url ?? undefined}
            playsInline
            preload="metadata"
            aria-label="Vídeo em edição"
             className={`block object-fill ${crop && !adjustingCrop ? "absolute max-w-none" : "size-full"}`}
            style={previewTransform}
            onClick={() => void togglePlayback()}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoSize({ width: video.videoWidth, height: video.videoHeight });
            }
            const d = video.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration(d);
              setEnd(trimEndRef.current ?? d);
              return;
            }
            // Gravações do navegador costumam vir sem duração: forçamos o cálculo.
            video.currentTime = 1e6;
          }}
          onDurationChange={(event) => {
            const d = event.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration((atual) => (atual > 0 ? atual : d));
              setEnd((atual) => (atual > 0 ? atual : (trimEndRef.current ?? d)));
              if (event.currentTarget.currentTime > d) event.currentTarget.currentTime = 0;
            }
          }}
          onSeeked={(event) => {
            const d = event.currentTarget.duration;
            if (duration <= 0 && Number.isFinite(d) && d > 0) {
              setDuration(d);
              setEnd(trimEndRef.current ?? d);
              event.currentTarget.currentTime = 0;
            }
          }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(event) => {
            const video = event.currentTarget;
            setCurrentTime(video.currentTime);
            const d = video.duration;
            if (duration <= 0) {
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                setEnd(trimEndRef.current ?? d);
                video.currentTime = 0;
              }
              return;
            }
            // Reprodução já com os cortes: pula os trechos removidos na hora.
            const list = rangesRef.current;
            if (!list.length) return;
            const t = video.currentTime;
            const dentro = list.some((range) => t >= range.start - 0.02 && t < range.end);
            if (dentro) return;
            const proximo = list.find((range) => range.start > t);
            if (proximo) {
              video.currentTime = proximo.start;
              setCurrentTime(proximo.start);
              return;
            }
            video.pause();
            const inicio = list[0]?.start ?? 0;
            video.currentTime = inicio;
            setCurrentTime(inicio);
          }}
            />
            {adjustingCrop && crop && (
              <div className="absolute inset-0 z-10" aria-label="Moldura de reenquadramento">
                <div className="pointer-events-none absolute left-0 right-0 top-0 bg-background/70" style={{ height: `${crop.y * 100}%` }} />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-background/70" style={{ top: `${(crop.y + crop.height) * 100}%` }} />
                <div className="pointer-events-none absolute left-0 bg-background/70" style={{ top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.height * 100}%` }} />
                <div className="pointer-events-none absolute right-0 bg-background/70" style={{ top: `${crop.y * 100}%`, left: `${(crop.x + crop.width) * 100}%`, height: `${crop.height * 100}%` }} />
                <div
                  className="absolute touch-none border-2 border-brand-cyan"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                >
                  <div role="button" tabIndex={0} aria-label="Arrastar moldura" className="absolute inset-3 cursor-move touch-none" onPointerDown={dragCrop("move")} />
                  {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                    <Button
                      key={corner}
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label={`Redimensionar moldura ${corner}`}
                      className={`absolute size-8 touch-none rounded-full border-2 border-brand-cyan p-0 ${corner.includes("n") ? "-top-4" : "-bottom-4"} ${corner.includes("w") ? "-left-4" : "-right-4"}`}
                      onPointerDown={dragCrop(corner)}
                    />
                  ))}
                </div>
              </div>
            )}
            <Button type="button" size="icon" aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"} className="absolute bottom-3 left-1/2 z-20 size-11 -translate-x-1/2 rounded-full shadow-xl" onClick={() => void togglePlayback()}>
              {playing ? <Pause /> : <Play />}
            </Button>
          </div>
        </div>
      </main>

      <section className="max-h-[52dvh] shrink-0 overflow-y-auto border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:max-h-[46dvh] sm:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-3">
        {engine === "carregando" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparando o editor pela primeira vez. Pode levar alguns segundos.
          </p>
        )}
        {engine === "erro" && (
          <p className="text-xs text-destructive">Não foi possível carregar o editor. Verifique sua conexão e abra novamente.</p>
        )}
        {isMobile() && (
          <p className="text-xs text-muted-foreground">No celular, o processamento pode demorar. Mantenha a tela aberta até terminar.</p>
        )}

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Ferramenta de edição">
          <Button type="button" size="sm" variant={mode === "trim" ? "default" : "ghost"} aria-pressed={mode === "trim"} onClick={() => setMode("trim")}>
            <RotateCcw /> Aparar pontas
          </Button>
          <Button type="button" size="sm" variant={mode === "cut" ? "default" : "ghost"} aria-pressed={mode === "cut"} onClick={() => {
            setMode("cut");
            const selecao = cutSelectionFor(ranges);
            setCutStart(selecao.start);
            setCutEnd(selecao.end);
          }}>

            <Scissors /> Tesoura
          </Button>
          <Button type="button" size="sm" variant={mode === "crop" ? "default" : "ghost"} aria-pressed={mode === "crop"} onClick={() => {
            setMode("crop");
            if (!crop && videoSize) selectCropRatio("9:16");
          }}>
            <CropIcon /> Enquadrar
          </Button>
        </div>

        {mode === "crop" && (
          <div className="grid gap-2">
            <div className="grid grid-cols-4 gap-1" role="group" aria-label="Proporção do enquadramento">
              {RECORDING_ASPECT_RATIOS.map((ratio) => (
                <Button key={ratio} type="button" size="sm" variant={crop?.aspectRatio === ratio ? "default" : "outline"} onClick={() => selectCropRatio(ratio)} disabled={!videoSize}>
                  {ratio}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Arraste a moldura para mover e use os cantos para redimensionar.</p>
            {crop && crop.width * crop.height < 0.35 && (
              <p className="text-xs text-destructive">Esta seleção será ampliada e pode perder nitidez.</p>
            )}
          </div>
        )}

        <div className="min-w-0">
          <div className="mb-2 grid grid-cols-3 items-center gap-2 text-xs font-semibold">
            <span>Início {formatTime(start)}</span>
            <span className="text-center">Final {formatTime(resultingDuration(duration, operations))}</span>
            <span className="text-right">Fim {formatTime(end)}</span>
          </div>
          <div ref={trackRef} data-trim-track className="relative h-16 select-none overflow-visible rounded-md bg-muted ring-1 ring-border" aria-label="Linha do tempo do vídeo" onPointerDown={(event) => seek(timeFromPointer(event.clientX))}>
            <VideoFilmstrip source={source} duration={duration} />
            {mode === "trim" && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] rounded-l-md bg-background/70" style={{ width: `${pct(start)}%` }} />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] rounded-r-md bg-background/70" style={{ width: `${100 - pct(end)}%` }} />
                <div className="pointer-events-none absolute inset-y-0 z-[6] border-y-2 border-primary" style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }} />
              </>
            )}
            {cuts.map((cut, index) => (
              <div key={`${cut.start}-${cut.end}-${index}`} className="pointer-events-none absolute inset-y-0 z-10 bg-destructive/65" style={{ left: `${pct(cut.start)}%`, width: `${pct(cut.end - cut.start)}%` }} />
            ))}
            {mode === "cut" && cutEnd > cutStart && (
              <div className="pointer-events-none absolute inset-y-0 z-10 border-x-2 border-destructive bg-destructive/35" style={{ left: `${pct(cutStart)}%`, width: `${pct(cutEnd - cutStart)}%` }} />
            )}
            <div className="pointer-events-none absolute -inset-y-1 z-30 w-0.5 bg-foreground shadow-sm" style={{ left: `${pct(currentTime)}%` }} />
            {mode === "trim" ? (
              <>
                <Button type="button" variant="default" aria-label="Início do trecho" data-trim-handle="start" className="absolute top-0 z-20 h-16 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(start)}%` }} onPointerDown={dragHandle("start")} />
                <Button type="button" variant="default" aria-label="Fim do trecho" data-trim-handle="end" className="absolute top-0 z-20 h-16 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(end)}%` }} onPointerDown={dragHandle("end")} />
              </>
            ) : mode === "cut" ? (
              <>
                <Button type="button" variant="destructive" aria-label="Início do corte interno" data-cut-handle="start" className="absolute top-0 z-20 h-16 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(cutStart)}%` }} onPointerDown={dragHandle("cutStart")} />
                <Button type="button" variant="destructive" aria-label="Fim do corte interno" data-cut-handle="end" className="absolute top-0 z-20 h-16 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(cutEnd)}%` }} onPointerDown={dragHandle("cutEnd")} />
              </>

            ) : null}
          </div>
        </div>

        {mode === "cut" && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <p className="min-w-0 text-xs text-muted-foreground">Trecho a remover: {formatTime(cutStart)}–{formatTime(cutEnd)}</p>
            <Button type="button" size="sm" variant="destructive" onClick={addCut} disabled={cutEnd - cutStart < 0.2}>
              <Scissors /> Cortar
            </Button>
          </div>
        )}

        {cuts.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Cortes internos adicionados">
            {cuts.map((cut, index) => (
            <Button key={`${cut.start}-${cut.end}-${index}`} type="button" size="sm" variant="secondary" aria-label={`Remover corte ${index + 1}`} onClick={() => {
                setHistory((current) => [...current, { start, end, cuts, crop }]);
                setCuts((current) => current.filter((_, itemIndex) => itemIndex !== index));
              }}>
                {formatTime(cut.start)}–{formatTime(cut.end)} <Trash2 />
              </Button>
            ))}
          </div>
        )}

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={processando || history.length === 0}
            onClick={desfazer}
          >
            <RotateCcw />
            Desfazer
          </Button>
          <Button size="lg" disabled={processando || engine !== "pronto" || !operations.length || !validResult} onClick={() => void aplicar()}>
            {processando ? <Loader2 className="animate-spin" /> : operations.length ? <Scissors /> : <Check />}
            {processando ? "Processando..." : "Aplicar edição"}
          </Button>
        </div>
        </div>
      </section>
    </div>
  );
}
