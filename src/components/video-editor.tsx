import { Check, Loader2, Pause, Play, RotateCcw, Scissors, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  buildFfmpegArgs,
  EDIT_INPUT,
  keepRanges,
  normalizeCuts,
  resultingDuration,
  type CutOperation,
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
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [mode, setMode] = useState<"trim" | "cut">("trim");
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(0);
  const [cuts, setCuts] = useState<CutOperation[]>([]);
  /** Pilha de estados anteriores: cada corte/aparo entra aqui para o "Desfazer". */
  const [history, setHistory] = useState<{ start: number; end: number; cuts: CutOperation[] }[]>([]);
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
          if (!cancelled) setProgresso(Math.max(0, Math.min(100, Math.round(progress * 100))));
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
      const snapshot = { start, end, cuts };
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

  const aparado = start > 0.05 || end < duration - 0.05;
  const operations: VideoEditOperation[] = [
    ...(aparado ? [{ type: "trim" as const, start, end }] : []),
    ...cuts,
  ];
  /** Trechos que permanecem: o player usa esta lista para pular o que foi cortado. */
  const ranges = duration > 0 ? keepRanges(duration, operations) : [];
  rangesRef.current = ranges;
  const validResult = duration > 0 && ranges.length > 0;

  const addCut = () => {
    if (cutEnd - cutStart < 0.2) return;
    const next = normalizeCuts([...cuts, { type: "cut", start: cutStart, end: cutEnd }], start, end);
    if (!keepRanges(duration, [...(aparado ? [{ type: "trim" as const, start, end }] : []), ...next]).length) {
      setErro("O corte não pode remover o vídeo inteiro.");
      return;
    }
    setHistory((current) => [...current, { start, end, cuts }]);
    setCuts(next);
    setErro(null);
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
    const outputExtension = cuts.length ? "mp4" : inputExtension;
    const input = `${EDIT_INPUT}.${inputExtension}`;
    const output = `saida.${outputExtension}`;
    try {
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(input, await fetchFile(source));
      let exitCode = await ffmpeg.exec(buildFfmpegArgs(operations, input, output, duration, true));
      // Alguns vídeos importados não têm faixa de áudio. Nesse caso, repete o
      // mesmo pipeline apenas com vídeo em vez de tornar a edição indisponível.
      if (exitCode !== 0 && cuts.length) {
        await ffmpeg.deleteFile(output).catch(() => undefined);
        exitCode = await ffmpeg.exec(buildFfmpegArgs(operations, input, output, duration, false));
      }
      if (exitCode !== 0) throw new Error(`ffmpeg ${exitCode}`);
      const data = (await ffmpeg.readFile(output)) as Uint8Array;
      if (!data?.length) throw new Error("vazio");
      const edited = new Blob([data.slice().buffer as ArrayBuffer], { type: `video/${outputExtension}` });
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
    <div className="fixed inset-0 z-[70] grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold sm:text-base">Editar vídeo</p>
          <p className="truncate text-xs text-muted-foreground">O original será preservado</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar editor" onClick={onCancel} disabled={processando}>
          <X />
        </Button>
      </header>

      <main className="flex min-h-0 items-center justify-center overflow-hidden bg-muted/30 p-3 sm:p-5">
        <div className="relative flex size-full min-h-0 items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={url ?? undefined}
            playsInline
            preload="metadata"
            aria-label="Vídeo em edição"
            className="block max-h-full max-w-full object-contain shadow-2xl"
            onClick={() => void togglePlayback()}
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
                setEnd(d);
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
          <Button type="button" size="icon" aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"} className="absolute bottom-3 left-1/2 size-11 -translate-x-1/2 rounded-full shadow-xl" onClick={() => void togglePlayback()}>
            {playing ? <Pause /> : <Play />}
          </Button>
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

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Ferramenta da timeline">
          <Button type="button" size="sm" variant={mode === "trim" ? "default" : "ghost"} aria-pressed={mode === "trim"} onClick={() => setMode("trim")}>
            <RotateCcw /> Aparar pontas
          </Button>
          <Button type="button" size="sm" variant={mode === "cut" ? "default" : "ghost"} aria-pressed={mode === "cut"} onClick={() => {
            setMode("cut");
            const span = Math.max(0.2, end - start);
            setCutStart(start + span * 0.35);
            setCutEnd(start + span * 0.65);
          }}>
            <Scissors /> Tesoura
          </Button>
        </div>

        <div className="min-w-0">
          <div className="mb-2 grid grid-cols-3 items-center gap-2 text-xs font-semibold">
            <span>Início {formatTime(start)}</span>
            <span className="text-center">Final {formatTime(resultingDuration(duration, operations))}</span>
            <span className="text-right">Fim {formatTime(end)}</span>
          </div>
          <div ref={trackRef} data-trim-track className="relative h-14 select-none overflow-visible rounded-md bg-muted" aria-label="Linha do tempo do vídeo" onPointerDown={(event) => seek(timeFromPointer(event.clientX))}>
            <div className="absolute inset-y-0 rounded-md bg-primary/25" style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }} />
            {cuts.map((cut, index) => (
              <div key={`${cut.start}-${cut.end}-${index}`} className="absolute inset-y-0 bg-destructive/65" style={{ left: `${pct(cut.start)}%`, width: `${pct(cut.end - cut.start)}%` }} />
            ))}
            {mode === "cut" && cutEnd > cutStart && (
              <div className="absolute inset-y-0 border-x-2 border-destructive bg-destructive/30" style={{ left: `${pct(cutStart)}%`, width: `${pct(cutEnd - cutStart)}%` }} />
            )}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pct(currentTime)}%` }} />
            {mode === "trim" ? (
              <>
                <Button type="button" variant="default" aria-label="Início do trecho" data-trim-handle="start" className="absolute top-0 h-14 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(start)}%` }} onPointerDown={dragHandle("start")} />
                <Button type="button" variant="default" aria-label="Fim do trecho" data-trim-handle="end" className="absolute top-0 h-14 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(end)}%` }} onPointerDown={dragHandle("end")} />
              </>
            ) : (
              <>
                <Button type="button" variant="destructive" aria-label="Início do corte interno" data-cut-handle="start" className="absolute top-0 h-14 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(cutStart)}%` }} onPointerDown={dragHandle("cutStart")} />
                <Button type="button" variant="destructive" aria-label="Fim do corte interno" data-cut-handle="end" className="absolute top-0 h-14 w-8 -translate-x-1/2 touch-none rounded-md border-2 border-background p-0" style={{ left: `${pct(cutEnd)}%` }} onPointerDown={dragHandle("cutEnd")} />
              </>
            )}
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
                setHistory((current) => [...current, { start, end, cuts }]);
                setCuts((current) => current.filter((_, itemIndex) => itemIndex !== index));
              }}>
                {formatTime(cut.start)}–{formatTime(cut.end)} <Trash2 />
              </Button>
            ))}
          </div>
        )}

        {processando && (
          <div className="grid gap-1">
            <Progress value={progresso} aria-label="Progresso do processamento" />
            <p className="text-xs text-muted-foreground">Processando... {progresso}%</p>
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
