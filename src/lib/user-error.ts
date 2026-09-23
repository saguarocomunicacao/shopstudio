type ValidationIssue = { message?: unknown; path?: unknown; code?: unknown };

const TECHNICAL_MESSAGE = /(?:\b(?:zod|postgrest|postgres|supabase|sqlstate|stack trace|typeerror|referenceerror|syntaxerror|fetch failed|networkerror|failed to fetch|internal server error)\b|\bPGRST\w*\b|\bSQLSTATE\b|row-level security|violates? (?:foreign key|unique|check|not-null)|duplicate key|relation ["']|column ["']|at\s+\S+\s+\([^)]*:\d+:\d+\)|<html|<!doctype|"(?:code|path|issues|details|hint)"\s*:)/i;

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/password should be at least/i, "A senha deve ter pelo menos 8 caracteres."],
  [/same password|different from the old password/i, "Escolha uma senha diferente da atual."],
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
  [/user already registered/i, "Este e-mail já está cadastrado."],
  [/rate limit|too many requests/i, "Muitas tentativas seguidas. Aguarde um pouco e tente novamente."],
  [/session.*(?:expired|missing)|refresh token/i, "Sua sessão expirou. Entre novamente para continuar."],
];

const firstIssueMessage = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const issue of value as ValidationIssue[]) {
      if (typeof issue?.message === "string" && issue.message.trim()) return issue.message.trim();
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const issues = Array.isArray(record["issues"])
    ? record["issues"]
    : Array.isArray(record["errors"])
      ? record["errors"]
      : null;
  if (issues) {
    for (const issue of issues as ValidationIssue[]) {
      if (typeof issue?.message === "string" && issue.message.trim()) return issue.message.trim();
    }
  }
  return null;
};

const parseSerialized = (message: string): unknown => {
  const trimmed = message.replace(/^Error:\s*/i, "").trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

/**
 * Converte qualquer falha que possa chegar à interface em texto seguro.
 * O erro original deve continuar sendo registrado no ponto em que ocorreu.
 */
export function userErrorMessage(error: unknown, fallback = "Algo deu errado, tente novamente."): string {
  const directIssue = firstIssueMessage(error);
  if (directIssue) return TECHNICAL_MESSAGE.test(directIssue) ? fallback : directIssue;

  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
          ? String((error as { message: string }).message)
          : "";
  const message = raw.trim();
  if (!message) return fallback;

  const serialized = parseSerialized(message);
  const serializedIssue = firstIssueMessage(serialized);
  if (serializedIssue) return TECHNICAL_MESSAGE.test(serializedIssue) ? fallback : serializedIssue;

  const authMatch = AUTH_MESSAGES.find(([pattern]) => pattern.test(message));
  if (authMatch) return authMatch[1];

  if (message.length > 320 || TECHNICAL_MESSAGE.test(message) || /^[\[{]/.test(message)) return fallback;

  // Mensagens de negócio do sistema são escritas em português. Mensagens
  // externas não reconhecidas ficam ocultas pelo fallback específico da ação.
  const looksUserFacing = /[áàâãéêíóôõúç]|\b(?:não|foi|para|por|com|sem|saldo|plano|perfil|vídeo|cena|roteiro|chave|conta|permissão|limite|tente|informe|escolha|configure|aguarde|produto|voz|arquivo|foto|agenda|papel|usuário)\b/i.test(message);
  return looksUserFacing ? message : fallback;
}
