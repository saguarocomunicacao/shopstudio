/** Extrai o texto da seção GANCHO, ignorando o rótulo e marcações como "(0-3s)". */
export function extractHookFromScript(script: string | null | undefined) {
  if (!script) return null;

  const lines = script.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const hookIndex = lines.findIndex((line) => /^gancho\b/i.test(line));
  if (hookIndex < 0) return lines.find(Boolean) ?? null;

  const hookLine = lines[hookIndex] ?? "";
  const inline = hookLine
    .replace(/^gancho(?:\s*\([^)]*\))?\s*[:\-–]?\s*/i, "")
    .trim();
  const following = lines
    .slice(hookIndex + 1)
    .filter((line) => line.length > 0)
    .takeWhile?.(() => true);

  const parts = inline ? [inline] : [];
  for (const line of following ?? lines.slice(hookIndex + 1)) {
    if (/^(corpo|cta)\b/i.test(line)) break;
    if (line) parts.push(line);
  }

  return parts.join(" ").trim() || null;
}