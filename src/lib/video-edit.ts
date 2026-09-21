/**
 * Pipeline de edição do vídeo gravado.
 *
 * O arquivo original nunca é alterado: as operações abaixo descrevem o que
 * aplicar sobre ele para gerar uma versão nova. Hoje só o corte de início/fim
 * (trim) está disponível; a lista já está preparada para receber o recorte de
 * quadro (crop) e a remoção de um trecho do meio (tesoura).
 */

export type TrimOperation = { type: "trim"; start: number; end: number };
export type CropOperation = { type: "crop"; x: number; y: number; width: number; height: number };
export type CutOperation = { type: "cut"; start: number; end: number };

export type VideoEditOperation = TrimOperation | CropOperation | CutOperation;

export const EDIT_INPUT = "entrada";
export const EDIT_OUTPUT = "saida";

export function hasOperations(operations: VideoEditOperation[]) {
  return operations.some((op) => (op.type === "trim" ? op.end - op.start > 0.05 : true));
}

/** Duração final estimada depois de aplicar as operações. */
export function resultingDuration(duration: number, operations: VideoEditOperation[]) {
  let total = duration;
  for (const op of operations) {
    if (op.type === "trim") total = Math.max(0, op.end - op.start);
    if (op.type === "cut") total = Math.max(0, total - (op.end - op.start));
  }
  return total;
}

/**
 * Monta a lista de argumentos do ffmpeg para as operações pedidas.
 *
 * Trim isolado usa cópia direta das faixas (rápido, sem recodificar). Assim que
 * crop ou tesoura entrarem na lista, o vídeo precisa ser recodificado, e o
 * builder já trata esse caminho.
 */
export function buildFfmpegArgs(
  operations: VideoEditOperation[],
  input = EDIT_INPUT,
  output = EDIT_OUTPUT,
): string[] {
  const trim = operations.find((op): op is TrimOperation => op.type === "trim");
  const crop = operations.find((op): op is CropOperation => op.type === "crop");
  const cuts = operations.filter((op): op is CutOperation => op.type === "cut");

  const needsReencode = !!crop || cuts.length > 0;
  const args: string[] = [];

  if (trim) args.push("-ss", trim.start.toFixed(3), "-to", trim.end.toFixed(3));
  args.push("-i", input);

  if (!needsReencode) {
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero", output);
    return args;
  }

  const filters: string[] = [];
  if (crop) filters.push(`crop=${Math.round(crop.width)}:${Math.round(crop.height)}:${Math.round(crop.x)}:${Math.round(crop.y)}`);
  if (filters.length) args.push("-vf", filters.join(","));
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-c:a", "aac", "-movflags", "+faststart", output);
  return args;
}
