/**
 * Resolução dos prompts configuráveis: override do perfil quando existir,
 * senão o padrão global do backoffice. Os placeholders {x} são trocados
 * pelos valores reais em runtime.
 */

export const PROMPT_KEYS = ["roteiro", "roteiro_gravacao", "cena", "movimento", "montagem"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

/** Lê o prompt efetivo de um perfil (override > padrão global). */
export async function resolvePrompt(supabase: any, profileId: string, key: PromptKey): Promise<string> {
  const [{ data: template }, { data: override }] = await Promise.all([
    supabase.from("prompt_templates").select("body").eq("key", key).maybeSingle(),
    supabase.from("profile_prompt_overrides").select("body").eq("profile_id", profileId).eq("key", key).maybeSingle(),
  ]);
  const body = (override?.body ?? "").trim() || (template?.body ?? "").trim();
  if (!body) throw new Error("Este prompt ainda não foi configurado. Um administrador pode ajustá-lo em Prompts do sistema.");
  return body;
}

/**
 * Substitui {placeholders}. Linhas cujo único conteúdo variável ficou vazio
 * são descartadas para não enviar frases truncadas à IA.
 */
export function renderPrompt(body: string, vars: Record<string, string | number | null | undefined>): string {
  const value = (name: string) => {
    const raw = vars[name];
    return raw === null || raw === undefined ? "" : String(raw).trim();
  };
  return body
    .split("\n")
    .map((line) => {
      const placeholders = [...line.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]!);
      const filled = line.replace(/\{([a-z0-9_]+)\}/gi, (_m, name: string) => value(name));
      if (placeholders.length && placeholders.every((p) => !value(p)) && /[:\-—]\s*$/.test(filled.trim())) return null;
      return filled;
    })
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MovieSettings = {
  subtitles: boolean;
  style: string;
  fontFamily: string;
  fontSize: number;
  wordsPerLine: number;
  positionY: number;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowOffset: number;
  resize: string;
  transition: number;
};

export const DEFAULT_MOVIE_SETTINGS: MovieSettings = {
  subtitles: true,
  style: "classic-progressive",
  fontFamily: "NotoSans Bold",
  fontSize: 90,
  wordsPerLine: 4,
  positionY: 1510,
  textColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 6,
  shadowColor: "#000000",
  shadowOffset: 4,
  resize: "cover",
  transition: 0.4,
};

/** Lê o prompt de montagem no formato "chave: valor" (uma opção por linha). */
export function parseMovieSettings(body: string): MovieSettings {
  const map = new Map<string, string>();
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*([a-z0-9_]+)\s*:\s*(.+?)\s*$/i);
    if (match) map.set(match[1]!.toLowerCase(), match[2]!);
  }
  const text = (key: string, fallback: string) => map.get(key)?.trim() || fallback;
  const num = (key: string, fallback: number) => {
    const parsed = Number(String(map.get(key) ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const bool = (key: string, fallback: boolean) => {
    const raw = map.get(key)?.trim().toLowerCase();
    if (!raw) return fallback;
    return !["nao", "não", "no", "false", "0", "off"].includes(raw);
  };
  const d = DEFAULT_MOVIE_SETTINGS;
  return {
    subtitles: bool("legendas", d.subtitles),
    style: text("estilo", d.style),
    fontFamily: text("fonte", d.fontFamily),
    fontSize: num("tamanho_fonte", d.fontSize),
    wordsPerLine: num("palavras_por_linha", d.wordsPerLine),
    positionY: num("posicao_y", d.positionY),
    textColor: text("cor_texto", d.textColor),
    outlineColor: text("cor_contorno", d.outlineColor),
    outlineWidth: num("largura_contorno", d.outlineWidth),
    shadowColor: text("cor_sombra", d.shadowColor),
    shadowOffset: num("deslocamento_sombra", d.shadowOffset),
    resize: text("preenchimento", d.resize),
    transition: num("transicao_segundos", d.transition),
  };
}
