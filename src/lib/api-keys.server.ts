import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Resolvedor único das chaves de API usadas na geração.
 *
 * - Plano com key_source = "shop_studio": usa a chave-mãe do ambiente.
 * - Plano com key_source = "byok": usa a chave do próprio cliente, guardada
 *   cifrada em tenant_api_keys. Se não existir, BLOQUEIA (nunca cai na
 *   chave-mãe).
 *
 * A IA de roteiro/descrição (LOVABLE_API_KEY) não passa por aqui: ela sempre
 * roda na infraestrutura da plataforma.
 */

export type KeyProvider = "gemini" | "json2video" | "elevenlabs" | "kalodata" | "apify";

export const PROVIDER_LABEL: Record<KeyProvider, string> = {
  gemini: "Google (Gemini/Veo)",
  json2video: "JSON2Video",
  elevenlabs: "ElevenLabs",
  kalodata: "Kalodata",
  apify: "Apify",
};

const ENV_BY_PROVIDER: Record<KeyProvider, string> = {
  gemini: "GEMINI_API_KEY",
  json2video: "JSON2VIDEO_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  kalodata: "KALODATA_API_KEY",
  apify: "APIFY_API_KEY",
};

/** Marca usada para o front reconhecer o bloqueio e abrir o modal certo. */
export const MISSING_KEY_TAG = "MISSING_TENANT_KEY";

export class MissingTenantKeyError extends Error {
  provider: KeyProvider;
  code = MISSING_KEY_TAG;
  constructor(provider: KeyProvider) {
    super(
      `[${MISSING_KEY_TAG}:${provider}] A chave de ${PROVIDER_LABEL[provider]} ainda não foi configurada nesta conta.`,
    );
    this.name = "MissingTenantKeyError";
    this.provider = provider;
  }
}

type TenantKeyContext = { tenantId: string; cache: Map<string, string> };

const storage = new AsyncLocalStorage<TenantKeyContext>();

/** Roda um trecho de geração já sabendo de qual cliente ele é. */
export function withTenantKeys<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ tenantId, cache: new Map() }, fn);
}

export function currentTenantIdOrNull(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

async function keySourceOf(tenantId: string): Promise<"shop_studio" | "byok"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("plan_id, plans:plan_id ( key_source )")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const source = (data as { plans?: { key_source?: string } | null } | null)?.plans?.key_source;
  return source === "byok" ? "byok" : "shop_studio";
}

/** Resolve a chave de um provedor para um cliente específico. */
export async function resolveApiKey(tenantId: string, provider: KeyProvider): Promise<string> {
  if (!tenantId) throw new Error("Não foi possível identificar a conta desta ação.");

  if ((await keySourceOf(tenantId)) === "shop_studio") {
    const key = process.env[ENV_BY_PROVIDER[provider]];
    if (!key) throw new Error(`O serviço de ${PROVIDER_LABEL[provider]} não está configurado na plataforma.`);
    return key;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_api_keys")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const encrypted = (data as { encrypted_key?: string } | null)?.encrypted_key;
  if (!encrypted) throw new MissingTenantKeyError(provider);

  const { decryptSecret } = await import("./tenant-keys.server");
  return decryptSecret(encrypted);
}

/**
 * Chave do provedor dentro de um bloco withTenantKeys. Nunca há fallback
 * silencioso: fora de contexto isso é um erro de programação.
 */
export async function providerKey(provider: KeyProvider): Promise<string> {
  const store = storage.getStore();
  if (!store) throw new Error("Contexto da conta ausente nesta geração.");
  const cached = store.cache.get(provider);
  if (cached) return cached;
  const key = await resolveApiKey(store.tenantId, provider);
  store.cache.set(provider, key);
  return key;
}

/** Confere antes de começar se o cliente tem todas as chaves exigidas. */
export async function assertTenantKeys(tenantId: string, providers: KeyProvider[]): Promise<void> {
  for (const provider of providers) {
    await resolveApiKey(tenantId, provider);
  }
}

/** Lista os provedores exigidos que ainda faltam (vazio no plano da plataforma). */
export async function missingTenantKeys(tenantId: string, providers: KeyProvider[]): Promise<KeyProvider[]> {
  const missing: KeyProvider[] = [];
  for (const provider of providers) {
    try {
      await resolveApiKey(tenantId, provider);
    } catch (e) {
      if (e instanceof MissingTenantKeyError) missing.push(provider);
    }
  }
  return missing;
}

type AnySupabase = { from: (t: string) => any };

async function tenantFrom(supabase: AnySupabase, table: string, id: string): Promise<string> {
  const { data, error } = await supabase.from(table).select("tenant_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const tenantId = (data as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) throw new Error("Não foi possível identificar a conta desta ação.");
  return tenantId;
}

export const tenantIdOfUser = (supabase: AnySupabase, userId: string) => tenantFrom(supabase, "app_users", userId);
export const tenantIdOfProfile = (supabase: AnySupabase, profileId: string) => tenantFrom(supabase, "profiles", profileId);

/** Provedores exigidos pelo vídeo completo (ElevenLabs só com voz ElevenLabs). */
export function providersForFullVideo(usesElevenLabs: boolean): KeyProvider[] {
  return usesElevenLabs ? ["gemini", "json2video", "elevenlabs"] : ["gemini", "json2video"];
}
