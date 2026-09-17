import { supabase } from "@/integrations/supabase/client";

/** Evento disparado quando a sessao expirou de verdade (refresh token invalido). */
export const SESSION_EXPIRED_EVENT = "shop-studio:session-expired";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let refreshing: Promise<boolean> | null = null;
let expired = false;

function emitExpired() {
  if (expired) return;
  expired = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** Renova a sessao uma unica vez por vez; devolve true se agora existe sessao valida. */
export async function refreshSessionOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) return false;
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Renova antecipadamente quando falta pouco para o token expirar. */
export async function ensureFreshSession() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return;
  const ok = await refreshSessionOnce();
  if (!ok) emitExpired();
}

const isAuthFailure = (status: number, body: string) =>
  status === 401 || (status === 403 && /jwt|token/i.test(body));

/**
 * Intercepta requisicoes ao backend: em 401/JWT expirado tenta renovar a sessao
 * uma vez e repetir; se a renovacao falhar, avisa que a sessao expirou.
 */
function installFetchInterceptor() {
  const original = window.fetch.bind(window);
  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const watched = Boolean(
      (supabaseUrl && url.startsWith(supabaseUrl) && !url.includes("/auth/v1/")) ||
        url.includes("/_serverFn/"),
    );
    if (!watched) return original(input as RequestInfo, init);

    const request = new Request(input as RequestInfo, init);
    const retryable = request.clone();
    const response = await original(request);
    if (response.status !== 401 && response.status !== 403) return response;

    const probe = response.clone();
    const body = await probe.text().catch(() => "");
    if (!isAuthFailure(response.status, body)) return response;

    const ok = await refreshSessionOnce();
    if (!ok) {
      emitExpired();
      return response;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(retryable.headers);
    if (token && headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return original(new Request(retryable, { headers }));
  };
}

let installed = false;

/** Liga o controle de sessao: refresh proativo no foco/aba visivel + retry de 401. */
export function installSessionGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  installFetchInterceptor();

  const onWake = () => {
    if (document.visibilityState !== "visible") return;
    void ensureFreshSession();
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  void ensureFreshSession();
}

/** Limpa o estado de "expirada" apos um novo login. */
export function resetSessionExpired() {
  expired = false;
}
