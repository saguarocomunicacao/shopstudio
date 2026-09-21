export const RECORDING_ASPECT_RATIOS = ["9:16", "1:1", "4:5", "16:9"] as const;

export type RecordingAspectRatio = (typeof RECORDING_ASPECT_RATIOS)[number];

export const DEFAULT_RECORDING_ASPECT_RATIO: RecordingAspectRatio = "9:16";

export const RECORDING_FORMATS: Record<
  RecordingAspectRatio,
  { label: string; width: number; height: number; frameClass: string; mediaClass: string }
> = {
  "9:16": {
    label: "9:16 (vertical, TikTok/Reels/Shorts)",
    width: 1080,
    height: 1920,
    frameClass: "h-[100dvh] w-[min(100vw,56.25dvh)]",
    mediaClass: "aspect-[9/16]",
  },
  "1:1": {
    label: "1:1 (quadrado)",
    width: 1080,
    height: 1080,
    frameClass: "size-[min(100vw,100dvh)]",
    mediaClass: "aspect-square",
  },
  "4:5": {
    label: "4:5 (retrato do feed)",
    width: 1080,
    height: 1350,
    frameClass: "h-[min(100dvh,125vw)] w-[min(100vw,80dvh)]",
    mediaClass: "aspect-[4/5]",
  },
  "16:9": {
    label: "16:9 (horizontal)",
    width: 1920,
    height: 1080,
    frameClass: "h-[min(100dvh,56.25vw)] w-[min(100vw,177.78dvh)]",
    mediaClass: "aspect-video",
  },
};

export function normalizeRecordingAspectRatio(value: string | null | undefined): RecordingAspectRatio {
  return RECORDING_ASPECT_RATIOS.includes(value as RecordingAspectRatio)
    ? (value as RecordingAspectRatio)
    : DEFAULT_RECORDING_ASPECT_RATIO;
}

/** Recorte central que preenche qualquer proporção de saída sem tarjas. */
export function cropCover(sourceW: number, sourceH: number, targetW: number, targetH: number) {
  const target = targetW / targetH;
  const source = sourceW / sourceH;
  if (source > target) {
    const sw = sourceH * target;
    return { sx: (sourceW - sw) / 2, sy: 0, sw, sh: sourceH };
  }
  const sh = sourceW / target;
  return { sx: 0, sy: (sourceH - sh) / 2, sw: sourceW, sh };
}