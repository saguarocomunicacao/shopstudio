export type RecordingBlock = { tempo: string; orientacao: string; fala: string };

const normalizeSpeech = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Detecta repetição literal ou quase literal sem esconder frases curtas apenas parecidas. */
export function isHookDuplicate(hook: string | null | undefined, speech: string | null | undefined) {
  const normalizedHook = normalizeSpeech(hook ?? "");
  const normalizedSpeech = normalizeSpeech(speech ?? "");
  if (!normalizedHook || !normalizedSpeech) return false;
  if (normalizedHook === normalizedSpeech) return true;

  const shorter = normalizedHook.length <= normalizedSpeech.length ? normalizedHook : normalizedSpeech;
  const longer = normalizedHook.length > normalizedSpeech.length ? normalizedHook : normalizedSpeech;
  if (shorter.length >= 18 && longer.includes(shorter) && shorter.length / longer.length >= 0.78) return true;

  const hookWords = new Set(normalizedHook.split(" "));
  const speechWords = new Set(normalizedSpeech.split(" "));
  if (Math.min(hookWords.size, speechWords.size) < 4) return false;
  const intersection = [...hookWords].filter((word) => speechWords.has(word)).length;
  const union = new Set([...hookWords, ...speechWords]).size;
  return intersection / union >= 0.82;
}

export function withoutDuplicatedHook<T extends RecordingBlock>(hook: string | null | undefined, blocks: T[]) {
  return blocks.filter((block) => !isHookDuplicate(hook, block.fala));
}
