const MAX_KEYWORDS = 36;
const MAX_REPLACEMENTS = 24;
const MAX_VALUE_LENGTH = 900;

const ENGLISH_COMMERCE_TERMS = new Set([
  "beauty", "blush", "brush", "clean", "cleaner", "cream", "fashion", "glow", "hair", "kit",
  "lifting", "lip", "makeup", "mask", "oil", "serum", "shine", "skin", "skincare", "spray", "stick",
  "waterproof",
]);

const SENTENCE_WORDS = new Set(["a", "agora", "com", "da", "de", "do", "e", "esse", "essa", "este", "esta", "mais", "na", "no", "o", "olha", "para", "por", "seu", "sua", "um", "uma"]);

/** Variações fonéticas recorrentes que o português costuma produzir no STT. */
const TRANSCRIPTION_ALIASES: Record<string, string[]> = {
  brush: ["brus", "brux"],
  skincare: ["skin care", "skin quer"],
  makeup: ["make up", "meikap"],
  waterproof: ["water proof"],
};

/** Erros observados em marcas cuja pronúncia não é preservada pelo STT. */
const BRAND_TRANSCRIPTION_ALIASES: Record<string, string[]> = {
  oceane: ["oceane", "ossiane", "ociane", "da"],
};

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();
const stripPunctuation = (value: string) => value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'+-]+$/gu, "");
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function addUnique(target: string[], seen: Set<string>, value: string) {
  const clean = normalizeSpace(value);
  const key = clean.toLocaleLowerCase("pt-BR");
  if (clean.length < 2 || seen.has(key)) return;
  seen.add(key);
  target.push(clean);
}

function usefulNarrationTerms(text: string): string[] {
  const tokens = text.match(/[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'+-]*/gu) ?? [];
  return tokens
    .map(stripPunctuation)
    .filter((token) => {
      const lower = fold(token).toLocaleLowerCase("pt-BR");
      return (
        ENGLISH_COMMERCE_TERMS.has(lower) ||
        (/[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,}/u.test(token) && !SENTENCE_WORDS.has(lower)) ||
        /[a-záàâãéêíóôõúç][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/u.test(token) ||
        /[A-Z]{2,}/u.test(token)
      );
    });
}

export type SubtitleVocabulary = {
  keywords: string;
  replace: string;
  keywordList: string[];
  replacementList: string[];
};

/**
 * Monta o vocabulário contextual aceito pelo JSON2Video. `keywords` orienta
 * o reconhecimento e `replace` corrige variações previsíveis depois do STT.
 */
export function buildSubtitleVocabulary(input: {
  productName?: string | null;
  sellerName?: string | null;
  narrations: string[];
}): SubtitleVocabulary {
  const keywordList: string[] = [];
  const keywordSeen = new Set<string>();
  const canonicalTerms: string[] = [];
  const canonicalSeen = new Set<string>();

  for (const value of [input.productName, input.sellerName]) {
    if (!value) continue;
    addUnique(keywordList, keywordSeen, value);
    for (const token of usefulNarrationTerms(value)) addUnique(canonicalTerms, canonicalSeen, token);
  }

  const narrationText = input.narrations.join("\n");
  for (const term of usefulNarrationTerms(narrationText)) addUnique(canonicalTerms, canonicalSeen, term);
  for (const term of canonicalTerms) addUnique(keywordList, keywordSeen, term);

  // Inclui pares adjacentes relevantes, como "Silicone Brush", além das palavras.
  const allText = [input.productName, input.sellerName, narrationText].filter(Boolean).join("\n");
  for (const line of allText.split(/\n+/)) {
    const words = line.split(/\s+/).map(stripPunctuation).filter(Boolean);
    for (let index = 0; index < words.length - 1; index += 1) {
      const pair = `${words[index]} ${words[index + 1]}`;
      if (words.slice(index, index + 2).some((word) => canonicalSeen.has(word.toLocaleLowerCase("pt-BR")))) {
        addUnique(keywordList, keywordSeen, pair);
      }
    }
  }

  const replacementList: string[] = [];
  const replacementSeen = new Set<string>();
  const addReplacement = (from: string, to: string) => {
    const source = normalizeSpace(from);
    if (!source || source === to) return;
    addUnique(replacementList, replacementSeen, `${source}: ${to}`);
  };

  for (const canonical of canonicalTerms) {
    const lower = canonical.toLocaleLowerCase("pt-BR");
    const ascii = fold(canonical);
    if (ascii !== canonical) {
      addReplacement(ascii, canonical);
      addReplacement(ascii.toLocaleLowerCase("pt-BR"), canonical);
    }
    for (const alias of TRANSCRIPTION_ALIASES[fold(lower)] ?? []) addReplacement(alias, canonical);
  }

  // Uma variação curta de marca (ex.: "da") nunca é substituída sozinha.
  // Ela só vale dentro da frase em que a marca aparece na narração.
  for (const canonical of canonicalTerms) {
    const aliases = BRAND_TRANSCRIPTION_ALIASES[fold(canonical).toLocaleLowerCase("pt-BR")];
    if (!aliases?.length) continue;
    const words = narrationText.split(/\s+/).map(stripPunctuation).filter(Boolean);
    for (let index = 0; index < words.length; index += 1) {
      if (fold(words[index] ?? "").toLocaleLowerCase("pt-BR") !== fold(canonical).toLocaleLowerCase("pt-BR")) continue;
      const prefix = words.slice(Math.max(0, index - 3), index).join(" ");
      if (!prefix) continue;
      for (const alias of aliases) addReplacement(`${prefix} ${alias}`, `${prefix} ${canonical}`);
    }
  }

  const boundedKeywords = keywordList.slice(0, MAX_KEYWORDS);
  const boundedReplacements = replacementList.slice(0, MAX_REPLACEMENTS);
  const fit = (values: string[]) => {
    const kept: string[] = [];
    for (const value of values) {
      if ([...kept, value].join(", ").length > MAX_VALUE_LENGTH) break;
      kept.push(value);
    }
    return kept;
  };
  const fittedKeywords = fit(boundedKeywords);
  const fittedReplacements = fit(boundedReplacements);

  return {
    keywords: fittedKeywords.join(", "),
    replace: fittedReplacements.join(", "),
    keywordList: fittedKeywords,
    replacementList: fittedReplacements,
  };
}