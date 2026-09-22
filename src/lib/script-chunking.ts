/**
 * Divisão de textos grandes em pedaços ("chunks") antes de mandar para a IA,
 * para não estourar o contexto do modelo. A divisão respeita parágrafos e,
 * quando um parágrafo é gigante, frases.
 */

export const MAX_CHUNK_CHARS = 6000;
/** Teto prático: acima disso avisamos em linguagem simples em vez de tentar processar. */
export const MAX_TEXT_CHARS = 120_000;

function splitLongPiece(piece: string, maxChars: number) {
  const sentences = piece.match(/[^.!?\n]+[.!?]*\s*/g) ?? [piece];
  const out: string[] = [];
  let atual = "";
  for (const frase of sentences) {
    if (frase.length > maxChars) {
      if (atual.trim()) out.push(atual.trim());
      atual = "";
      for (let i = 0; i < frase.length; i += maxChars) out.push(frase.slice(i, i + maxChars).trim());
      continue;
    }
    if ((atual + frase).length > maxChars && atual.trim()) {
      out.push(atual.trim());
      atual = frase;
    } else {
      atual += frase;
    }
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}

export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const limpo = text.replace(/\r\n/g, "\n").trim();
  if (!limpo) return [];
  if (limpo.length <= maxChars) return [limpo];

  const paragrafos = limpo.split(/\n{2,}/);
  const chunks: string[] = [];
  let atual = "";
  for (const paragrafo of paragrafos) {
    if (paragrafo.length > maxChars) {
      if (atual.trim()) {
        chunks.push(atual.trim());
        atual = "";
      }
      chunks.push(...splitLongPiece(paragrafo, maxChars));
      continue;
    }
    if ((atual ? `${atual}\n\n${paragrafo}` : paragrafo).length > maxChars) {
      chunks.push(atual.trim());
      atual = paragrafo;
    } else {
      atual = atual ? `${atual}\n\n${paragrafo}` : paragrafo;
    }
  }
  if (atual.trim()) chunks.push(atual.trim());
  return chunks;
}

/** Ritmo médio de fala em português para estimar a duração de cada bloco. */
const PALAVRAS_POR_SEGUNDO = 2.6;

export function segundosDaFala(fala: string) {
  const palavras = fala.trim().split(/\s+/).filter(Boolean).length;
  if (!palavras) return 3;
  return Math.max(3, Math.round(palavras / PALAVRAS_POR_SEGUNDO));
}

/** Recalcula as faixas de tempo em sequência, começando logo após o gancho (3s). */
export function recalcularTempos<T extends { fala: string; tempo: string }>(blocos: T[], inicio = 3): T[] {
  let cursor = inicio;
  return blocos.map((bloco) => {
    const fim = cursor + segundosDaFala(bloco.fala);
    const tempo = `${cursor}-${fim}s`;
    cursor = fim;
    return { ...bloco, tempo };
  });
}
