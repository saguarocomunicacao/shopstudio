/**
 * Pipeline de edição do vídeo gravado.
 *
 * O arquivo original nunca é alterado: as operações abaixo descrevem o que
 * aplicar sobre ele para gerar uma versão nova. Aparar pontas (trim) e remover
 * trechos internos (cut) e reenquadramento (crop) são combinados em uma única
 * geração final a partir do original.
 */

import { RECORDING_FORMATS, type RecordingAspectRatio } from "@/lib/recording-format";

export type TrimOperation = { type: "trim"; start: number; end: number };
/** Coordenadas normalizadas (0–1) relativas aos pixels do vídeo original. */
export type CropOperation = {
  type: "crop";
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: RecordingAspectRatio;
};
export type CutOperation = { type: "cut"; start: number; end: number };

export type VideoEditOperation = TrimOperation | CropOperation | CutOperation;

export const EDIT_INPUT = "entrada";
export const EDIT_OUTPUT = "saida";
const MIN_SEGMENT_SECONDS = 0.08;

export type TimeRange = { start: number; end: number };
export type VideoSourceSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Ordena, limita ao trim e une cortes internos sobrepostos. */
export function normalizeCuts(cuts: CutOperation[], trimStart: number, trimEnd: number): CutOperation[] {
  const valid = cuts
    .map((cut) => ({
      type: "cut" as const,
      start: clamp(cut.start, trimStart, trimEnd),
      end: clamp(cut.end, trimStart, trimEnd),
    }))
    .filter((cut) => cut.end - cut.start >= MIN_SEGMENT_SECONDS)
    .sort((a, b) => a.start - b.start);

  const merged: CutOperation[] = [];
  for (const cut of valid) {
    const previous = merged.at(-1);
    if (previous && cut.start <= previous.end + MIN_SEGMENT_SECONDS) {
      previous.end = Math.max(previous.end, cut.end);
    } else {
      merged.push({ ...cut });
    }
  }
  return merged;
}

/** Intervalos do original que permanecem depois do trim e das tesouras. */
export function keepRanges(duration: number, operations: VideoEditOperation[]): TimeRange[] {
  const trim = operations.find((op): op is TrimOperation => op.type === "trim");
  const start = clamp(trim?.start ?? 0, 0, duration);
  const end = clamp(trim?.end ?? duration, start, duration);
  const cuts = normalizeCuts(
    operations.filter((op): op is CutOperation => op.type === "cut"),
    start,
    end,
  );
  const ranges: TimeRange[] = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.start - cursor >= MIN_SEGMENT_SECONDS) ranges.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (end - cursor >= MIN_SEGMENT_SECONDS) ranges.push({ start: cursor, end });
  return ranges;
}

export function hasOperations(operations: VideoEditOperation[]) {
  return operations.some((op) => (op.type === "trim" ? op.end - op.start > 0.05 : true));
}

/** Duração final estimada depois de aplicar as operações. */
export function resultingDuration(duration: number, operations: VideoEditOperation[]) {
  return keepRanges(duration, operations).reduce((total, range) => total + range.end - range.start, 0);
}

function evenFloor(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/** Converte o crop relativo em pixels pares, limitados ao quadro original. */
export function cropPixels(crop: CropOperation, source: VideoSourceSize) {
  if (source.width <= 0 || source.height <= 0) throw new Error("Dimensões inválidas do vídeo original.");
  const width = evenFloor(clamp(crop.width, 0.01, 1) * source.width);
  const height = evenFloor(clamp(crop.height, 0.01, 1) * source.height);
  const maxX = Math.max(0, source.width - width);
  const maxY = Math.max(0, source.height - height);
  const x = Math.min(evenFloor(clamp(crop.x, 0, 1) * source.width), evenFloor(maxX));
  const y = Math.min(evenFloor(clamp(crop.y, 0, 1) * source.height), evenFloor(maxY));
  return { x, y, width, height };
}

/**
 * Monta a lista de argumentos do ffmpeg para as operações pedidas.
 *
 * Trim isolado usa cópia direta das faixas (rápido, sem recodificar). Crop e
 * tesoura recodificam e concatenam todos os intervalos preservados.
 */
export function buildFfmpegArgs(
  operations: VideoEditOperation[],
  input = EDIT_INPUT,
  output = EDIT_OUTPUT,
  duration = 0,
  hasAudio = true,
  sourceSize?: VideoSourceSize,
): string[] {
  const trim = operations.find((op): op is TrimOperation => op.type === "trim");
  const crop = operations.find((op): op is CropOperation => op.type === "crop");
  const cuts = operations.filter((op): op is CutOperation => op.type === "cut");

  const needsReencode = !!crop || cuts.length > 0;
  const args: string[] = [];

  if (!needsReencode) {
    if (trim) args.push("-ss", trim.start.toFixed(3), "-to", trim.end.toFixed(3));
    args.push("-i", input);
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero", output);
    return args;
  }

  args.push("-i", input);
  const ranges = keepRanges(duration, operations);
  if (!ranges.length) throw new Error("A edição removeria o vídeo inteiro.");

  let spatialFilter = "";
  if (crop) {
    if (!sourceSize) throw new Error("O reenquadramento precisa das dimensões do vídeo original.");
    const pixels = cropPixels(crop, sourceSize);
    const outputSize = RECORDING_FORMATS[crop.aspectRatio];
    spatialFilter = `,crop=${pixels.width}:${pixels.height}:${pixels.x}:${pixels.y},scale=${outputSize.width}:${outputSize.height}`;
  }

  const graph: string[] = [];
  ranges.forEach((range, index) => {
    graph.push(`[0:v]trim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},setpts=PTS-STARTPTS${spatialFilter}[v${index}]`);
    if (hasAudio) graph.push(`[0:a]atrim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const inputs = ranges.map((_, index) => `[v${index}]${hasAudio ? `[a${index}]` : ""}`).join("");
  graph.push(`${inputs}concat=n=${ranges.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? "[aout]" : ""}`);
  args.push("-filter_complex", graph.join(";"), "-map", "[vout]");
  if (hasAudio) args.push("-map", "[aout]");
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "24");
  if (hasAudio) args.push("-c:a", "aac");
  args.push("-movflags", "+faststart", output);
  return args;
}
