/**
 * Encanamento OAuth do TikTok Shop Partner.
 * Tudo aqui roda só no servidor: as chaves do app e os tokens nunca saem daqui.
 */

const SERVICE_ID = "7686814709862418192";
const AUTH_BASE = "https://services.tiktokshop.com/open/authorize";
const TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";

export type TiktokTokens = {
  openId: string | null;
  sellerName: string | null;
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

/** URL de autorização que o usuário abre para aprovar a conta. */
export function authorizeUrl(state: string) {
  return `${AUTH_BASE}?service_id=${SERVICE_ID}&state=${encodeURIComponent(state)}`;
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

/** Chama o endpoint de token do TikTok e normaliza a resposta. */
async function callTokenEndpoint(params: Record<string, string>): Promise<TiktokTokens> {
  const { appKey, appSecret } = appCredentials();
  const url = new URL(TOKEN_URL);
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
  if (!res.ok || (code !== null && code !== 0)) {
    // Nunca logar app_secret: só status, código e mensagem do TikTok.
    console.error(`[tiktok-oauth] token/get falhou http=${res.status} code=${code ?? "-"} message=${message || text.slice(0, 200)}`);
    throw new Error(message || `TikTok recusou a autorização (código ${code ?? res.status}).`);
  }

  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const accessToken = str(data["access_token"]);
  const refreshToken = str(data["refresh_token"]);
  if (!accessToken || !refreshToken) {
    console.error("[tiktok-oauth] resposta sem tokens:", Object.keys(data).join(","));
    throw new Error("O TikTok não devolveu os tokens de acesso.");
  }

  return {
    openId: str(data["open_id"]) ?? str(data["seller_base_region"]),
    sellerName: str(data["seller_name"]),
    accessToken,
    refreshToken,
    accessTokenExpiresAt: toIso(data["access_token_expire_in"]),
    refreshTokenExpiresAt: toIso(data["refresh_token_expire_in"]),
  };
}

/** Troca o auth_code recebido no callback por tokens. */
export function exchangeAuthCode(authCode: string) {
  return callTokenEndpoint({ auth_code: authCode, grant_type: "authorized_code" });
}

/** Renova o access_token a partir do refresh_token. */
export function refreshTokens(refreshToken: string) {
  return callTokenEndpoint({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

/** Grava (ou atualiza) a conexão do perfil. */
export async function saveConnection(profileId: string, tokens: TiktokTokens) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("tiktok_connections").upsert(
    {
      profile_id: profileId,
      open_id: tokens.openId,
      seller_name: tokens.sellerName,
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
  await supabaseAdmin
    .from("tiktok_connections")
    .upsert({ profile_id: profileId, status: "error", last_error: motivo.slice(0, 500) }, { onConflict: "profile_id" });
}

/** Renova as conexões cujo access_token expira dentro de `dias`. */
export async function refreshExpiring(dias = 15, limite = 25) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limite_data = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
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

/** Renova um perfil específico se o token estiver perto de expirar. */
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
