import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/user-error";

/** Provedores cujas chaves podem ser do próprio cliente (plano BYOK). */
export const KEY_PROVIDERS = ["gemini", "json2video", "elevenlabs", "kalodata"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<KeyProvider, string> = {
  gemini: "Gemini (Google)",
  json2video: "JSON2Video",
  elevenlabs: "ElevenLabs",
  kalodata: "Kalodata",
};

export const PROVIDER_USE: Record<KeyProvider, string> = {
  gemini: "gerar as imagens das cenas e animar o vídeo",
  json2video: "montar o vídeo final com legendas e trilha",
  elevenlabs: "gerar a narração em voz",
  kalodata: "buscar produtos e vídeos campeões",
};

const MISSING_KEY_TAG = "MISSING_TENANT_KEY";
export const MISSING_KEY_EVENT = "shopstudio:missing-tenant-key";

/** Reconhece o bloqueio por chave faltando vindo do servidor. */
export function parseMissingKey(error: unknown): KeyProvider | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(new RegExp(`\\[${MISSING_KEY_TAG}:(\\w+)\\]`));
  const provider = match?.[1] as KeyProvider | undefined;
  return provider && (KEY_PROVIDERS as readonly string[]).includes(provider) ? provider : null;
}

/**
 * Mensagem amigável de qualquer erro de ação. Quando o motivo é uma chave de
 * API faltando, abre o aviso dedicado em vez de mostrar texto técnico.
 */
export function actionError(error: unknown, fallback = "Não foi possível concluir a ação."): string {
  const provider = parseMissingKey(error);
  if (provider) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MISSING_KEY_EVENT, { detail: provider }));
    }
    return `Configure sua chave de ${PROVIDER_LABEL[provider]} para continuar.`;
  }
  return userErrorMessage(error, fallback);
}

type TenantKeysInfo = { byok: boolean; missing: KeyProvider[]; configured: KeyProvider[] };

/** Plano do cliente + quais chaves dele já estão cadastradas. */
export function useTenantKeys() {
  return useQuery<TenantKeysInfo>({
    queryKey: ["tenant-keys-status"],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: tenants }, { data: keys }] = await Promise.all([
        supabase.from("tenants").select("id, plans:plan_id ( key_source )").limit(1),
        supabase.from("tenant_api_keys").select("provider"),
      ]);
      const tenant = (tenants ?? [])[0] as { plans?: { key_source?: string } | null } | undefined;
      const byok = tenant?.plans?.key_source === "byok";
      const configured = ((keys ?? []) as { provider: string }[])
        .map((k) => k.provider)
        .filter((p): p is KeyProvider => (KEY_PROVIDERS as readonly string[]).includes(p));
      const missing = byok ? KEY_PROVIDERS.filter((p) => !configured.includes(p)) : [];
      return { byok, missing, configured };
    },
  });
}
