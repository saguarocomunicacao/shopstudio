import { Check, Loader2, RotateCcw, Scissors, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  buildFfmpegArgs,
  EDIT_INPUT,
  resultingDuration,
  type VideoEditOperation,
} from "@/lib/video-edit";

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

export function VideoEditor({
  source,
  onCancel,
  onApply,
}: {
  source: Blob;
  onCancel: () => void;
  onApply: (edited: Blob, operations: VideoEditOperation[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const ffmpegRef = useRef<FFmpegLike | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
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
          if (!cancelled) setProgresso(Math.max(0, Math.min(100, Math.round(progress * 100))));
        });
        await instance.load({
          coreURL: new URL("/ffmpeg/ffmpeg-core.js", window.location.origin).href,
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
    if (video) video.currentTime = time;
  }, []);

  const dragHandle = (handle: "start" | "end") => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const time = ratio * duration;
      if (handle === "start") {
        const next = Math.min(time, end - 0.2);
        setStart(Math.max(0, next));
        seek(Math.max(0, next));
      } else {
        const next = Math.max(time, start + 0.2);
        setEnd(Math.min(duration, next));
        seek(Math.min(duration, next));
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

  const aparado = start > 0.05 || end < duration - 0.05;
  const operations: VideoEditOperation[] = aparado ? [{ type: "trim", start, end }] : [];

  const aplicar = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !operations.length) return;
    setProcessando(true);
    setProgresso(0);
    setErro(null);
    const extension = source.type.includes("mp4") ? "mp4" : "webm";
    const input = `${EDIT_INPUT}.${extension}`;
    const output = `saida.${extension}`;
    try {
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(input, await fetchFile(source));
      await ffmpeg.exec(buildFfmpegArgs(operations, input, output));
      const data = (await ffmpeg.readFile(output)) as Uint8Array;
      if (!data?.length) throw new Error("vazio");
      const edited = new Blob([data.slice().buffer as ArrayBuffer], { type: source.type || `video/${extension}` });
      await ffmpeg.deleteFile(input).catch(() => undefined);
      await ffmpeg.deleteFile(output).catch(() => undefined);
      onApply(edited, operations);
    } catch {
      setErro("Não foi possível aplicar o corte neste aparelho. Tente novamente ou salve o vídeo sem editar.");
    } finally {
      setProcessando(false);
    }
  };

  const pct = (value: number) => (duration > 0 ? (value / duration) * 100 : 0);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm font-bold">Editar vídeo</p>
        <Button variant="ghost" size="icon" aria-label="Fechar editor" className="text-white hover:bg-white/15 hover:text-white" onClick={onCancel} disabled={processando}>
          <X />
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center px-3 py-2">
        <video
          ref={videoRef}
          src={url ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label="Vídeo em edição"
          className="max-h-full w-auto max-w-full rounded-xl bg-black"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const d = video.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration(d);
              setEnd(d);
              return;
            }
            // Gravações do navegador costumam vir sem duração: forçamos o cálculo.
            video.currentTime = 1e6;
          }}
          onDurationChange={(event) => {
            const d = event.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration((atual) => (atual > 0 ? atual : d));
              setEnd((atual) => (atual > 0 ? atual : d));
              if (event.currentTarget.currentTime > d) event.currentTarget.currentTime = 0;
            }
          }}
          onSeeked={(event) => {
            const d = event.currentTarget.duration;
            if (duration <= 0 && Number.isFinite(d) && d > 0) {
              setDuration(d);
              setEnd(d);
              event.currentTarget.currentTime = 0;
            }
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            const d = video.duration;
            if (duration <= 0) {
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                setEnd(d);
                video.currentTime = 0;
              }
              return;
            }
            if (video.currentTime > end) video.pause();
          }}
        />
      </div>

      <div className="grid gap-3 bg-black/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {engine === "carregando" && (
          <p className="flex items-center gap-2 text-xs text-white/80">
            <Loader2 className="size-4 animate-spin" />
            Preparando o editor pela primeira vez. Pode levar alguns segundos.
          </p>
        )}
        {engine === "erro" && (
          <p className="text-xs text-destructive">Não foi possível carregar o editor. Verifique sua conexão e abra novamente.</p>
        )}
        {isMobile() && (
          <p className="text-xs text-white/70">No celular, o processamento pode demorar. Mantenha a tela aberta até terminar.</p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span>Início {formatTime(start)}</span>
            <span>Duração final {formatTime(resultingDuration(duration, operations))}</span>
            <span>Fim {formatTime(end)}</span>
          </div>
          <div ref={trackRef} data-trim-track className="relative h-12 select-none rounded-lg bg-white/15" aria-label="Linha do tempo do vídeo">
            <div className="absolute inset-y-0 rounded-lg bg-primary/35" style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }} />
            <button
              type="button"
              aria-label="Início do trecho"
              data-trim-handle="start"
              className="absolute top-0 h-12 w-6 -translate-x-1/2 touch-none rounded-md border-2 border-white bg-primary"
              style={{ left: `${pct(start)}%` }}
              onPointerDown={dragHandle("start")}
            />
            <button
              type="button"
              aria-label="Fim do trecho"
              data-trim-handle="end"
              className="absolute top-0 h-12 w-6 -translate-x-1/2 touch-none rounded-md border-2 border-white bg-primary"
              style={{ left: `${pct(end)}%` }}
              onPointerDown={dragHandle("end")}
            />
          </div>
        </div>

        {processando && (
          <div className="grid gap-1">
            <Progress value={progresso} aria-label="Progresso do processamento" />
            <p className="text-xs text-white/80">Processando... {progresso}%</p>
          </div>
        )}
        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={processando || !aparado}
            onClick={() => {
              setStart(0);
              setEnd(duration);
              seek(0);
            }}
          >
            <RotateCcw />
            Desfazer
          </Button>
          <Button size="lg" disabled={processando || engine !== "pronto" || !aparado} onClick={() => void aplicar()}>
            {processando ? <Loader2 className="animate-spin" /> : aparado ? <Scissors /> : <Check />}
            {processando ? "Processando..." : "Aplicar corte"}
          </Button>
        </div>
      </div>
    </div>
  );
}
