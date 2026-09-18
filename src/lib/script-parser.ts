type ScriptSection = "gancho" | "cta";

/** Extrai uma seção do roteiro, ignorando o rótulo e marcações como "(0-3s)". */
function extractSectionFromScript(script: string | null | undefined, section: ScriptSection) {
  if (!script) return null;

  const lines = script.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const sectionIndex = lines.findIndex((line) => new RegExp(`^${section}\\b`, "i").test(line));
  if (sectionIndex < 0) return section === "gancho" ? lines.find(Boolean) ?? null : null;

  const sectionLine = lines[sectionIndex] ?? "";
  const inline = sectionLine
    .replace(new RegExp(`^${section}(?:\\s*\\([^)]*\\))?\\s*[:\\-–]?\\s*`, "i"), "")
    .trim();
  const parts = inline ? [inline] : [];
  for (const line of lines.slice(sectionIndex + 1)) {
    if (/^(gancho|corpo|cta)\b/i.test(line)) break;
    if (line) parts.push(line);
  }

  return parts.join(" ").trim() || null;
}

export function extractHookFromScript(script: string | null | undefined) {
  return extractSectionFromScript(script, "gancho");
}

export function extractCtaFromScript(script: string | null | undefined) {
  return extractSectionFromScript(script, "cta");
}