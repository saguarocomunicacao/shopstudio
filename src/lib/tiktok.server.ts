/**
 * Encanamento OAuth do TikTok Shop — fluxo de CRIADOR (Affiliate Creator).
 * Tudo aqui roda só no servidor: as chaves do app e os tokens nunca saem daqui.
 */

const CREATOR_AUTH_BASE = "https://shop.tiktok.com/alliance/creator/auth";
const TOKEN_GET_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const TOKEN_REFRESH_URL = "https://auth.tiktok-shops.com/api/v2/token/refresh";

/** Escopos exigidos pelas Affiliate Creator APIs. */
export const REQUIRED_SCOPES = ["creator.affiliate_collaboration.read", "creator.affiliate.info"];

export type TiktokTokens = {
  openId: string | null;
  userType: number | null;
  grantedScopes: string[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
};

function appCredentials() {
  const appKey = process.env["TIKTOK_APP_KEY"];
  const appSecret = process.env["TIKTOK_APP_SECRET"];
  if (!appKey || !appSecret) {
    throw new Error("Credenciais do app TikTok Shop ausentes no servidor (TIKTOK_APP_KEY / TIKTOK_APP_SECRET).");
  }
  return { appKey, appSecret };
}

/** URL de autorização do criador (usa app_key + state, nunca service_id). */
export function authorizeUrl(state: string) {
  const { appKey } = appCredentials();
  return `${CREATOR_AUTH_BASE}?app_key=${encodeURIComponent(appKey)}&state=${encodeURIComponent(state)}`;
}

/** Epoch em segundos (ou ms) -> ISO. */
function toIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const ms = value > 1e12 ? value : value * 1000;
  return new Date(ms).toISOString();
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  const raw = str(value);
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Chama /token/get ou /token/refresh e normaliza + valida a resposta. */
async function callTokenEndpoint(endpoint: string, params: Record<string, string>): Promise<TiktokTokens> {
  const { appKey, appSecret } = appCredentials();
  const url = new URL(endpoint);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  const text = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // resposta não-JSON
  }

  const code = typeof payload["code"] === "number" ? payload["code"] : null;
  const message = str(payload["message"]) ?? "";
  if (!res.ok || code !== 0) {
    // Nunca logar app_secret: só status, código e mensagem do TikTok.
    console.error(
      `[tiktok-oauth] ${endpoint.endsWith("refresh") ? "token/refresh" : "token/get"} falhou http=${res.status} code=${code ?? "-"} message=${message || text.slice(0, 200)}`,
    );
    throw new Error("O TikTok recusou a autorização. Revise a conexão e tente novamente.");
  }

  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const accessToken = str(data["access_token"]);
  const refreshToken = str(data["refresh_token"]);
  if (!accessToken || !refreshToken) {
    console.error("[tiktok-oauth] resposta sem tokens:", Object.keys(data).join(","));
    throw new Error("O TikTok não devolveu os tokens de acesso.");
  }

  const userType = typeof data["user_type"] === "number" ? data["user_type"] : null;
  if (userType !== 1) {
    throw new Error("Essa conta não é um criador do TikTok Shop. Entre com a conta de criador afiliado.");
  }

  const grantedScopes = parseScopes(data["granted_scopes"]);
  const faltando = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
  if (faltando.length) {
    throw new Error(`A autorização não liberou as permissões necessárias: ${faltando.join(", ")}.`);
  }

  return {
    openId: str(data["open_id"]),
    userType,
    grantedScopes,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: toIso(data["access_token_expire_in"]),
    refreshTokenExpiresAt: toIso(data["refresh_token_expire_in"]),
  };
}

/** Troca o auth_code recebido no callback por tokens (grant_type exato: authorized_code). */
export function exchangeAuthCode(authCode: string) {
  return callTokenEndpoint(TOKEN_GET_URL, { auth_code: authCode, grant_type: "authorized_code" });
}

/** Renova o access_token a partir do refresh_token. */
export function refreshTokens(refreshToken: string) {
  return callTokenEndpoint(TOKEN_REFRESH_URL, { refresh_token: refreshToken, grant_type: "refresh_token" });
}

/** Tenant do perfil dono da conexão (o insert roda sem sessão). */
async function tenantOfProfile(profileId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("profiles").select("tenant_id").eq("id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.tenant_id) throw new Error("Perfil sem tenant definido.");
  return data.tenant_id;
}

/** Grava (ou atualiza) a conexão do perfil. */
export async function saveConnection(profileId: string, tokens: TiktokTokens) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tenantId = await tenantOfProfile(profileId);
  const { error } = await supabaseAdmin.from("tiktok_connections").upsert(
    {
      tenant_id: tenantId,
      profile_id: profileId,
      open_id: tokens.openId,
      user_type: tokens.userType,
      granted_scopes: tokens.grantedScopes,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_token_expires_at: tokens.accessTokenExpiresAt,
      refresh_token_expires_at: tokens.refreshTokenExpiresAt,
      status: "connected",
      last_error: null,
    },
    { onConflict: "profile_id" },
  );
  if (error) throw new Error(error.message);
}

/** Marca a conexão com erro, preservando o motivo para a tela do perfil. */
export async function markConnectionError(profileId: string, motivo: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tenantId = await tenantOfProfile(profileId);
  await supabaseAdmin
    .from("tiktok_connections")
    .upsert(
      { tenant_id: tenantId, profile_id: profileId, status: "error", last_error: motivo.slice(0, 500) },
      { onConflict: "profile_id" },
    );
}

/** Renova as conexões cujo access_token expira dentro de `horas` (padrão 48h). */
export async function refreshExpiring(horas = 48, limite = 50) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limite_data = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("tiktok_connections")
    .select("profile_id, refresh_token, access_token_expires_at")
    .eq("status", "connected")
    .not("refresh_token", "is", null)
    .lte("access_token_expires_at", limite_data)
    .limit(limite);
  if (error) throw new Error(error.message);

  const results: { profileId: string; ok: boolean; motivo?: string }[] = [];
  for (const row of rows ?? []) {
    try {
      const tokens = await refreshTokens(row.refresh_token!);
      await saveConnection(row.profile_id, tokens);
      results.push({ profileId: row.profile_id, ok: true });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[tiktok-oauth] refresh falhou para o perfil ${row.profile_id}: ${motivo}`);
      await markConnectionError(row.profile_id, motivo);
      results.push({ profileId: row.profile_id, ok: false, motivo });
    }
  }
  return results;
}

/** Renova um perfil específico. */
export async function refreshProfile(profileId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("tiktok_connections")
    .select("refresh_token, status")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!row?.refresh_token) throw new Error("Este perfil não tem uma conta TikTok conectada.");
  const tokens = await refreshTokens(row.refresh_token);
  await saveConnection(profileId, tokens);
  return tokens;
}
