/**
 * Cofre das chaves de API de cada cliente (BYOK).
 * O valor é cifrado com AES-256-GCM usando APP_ENCRYPTION_KEY e só é
 * decifrado dentro do servidor. Nunca volta em claro para o navegador.
 */

export type KeyProvider = "gemini" | "json2video" | "elevenlabs" | "kalodata";

async function aesKey(): Promise<CryptoKey> {
  const raw = process.env["APP_ENCRYPTION_KEY"];
  if (!raw) throw new Error("O cofre de chaves não está configurado.");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const [version, iv, payload] = stored.split(".");
  if (version !== "v1" || !iv || !payload) throw new Error("Chave guardada em formato inválido.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(payload));
  return new TextDecoder().decode(plain);
}

/** Teste mais leve possível de cada provedor. Nunca gera mídia. */
export async function testProviderKey(provider: KeyProvider, key: string): Promise<{ ok: boolean; detalhe: string }> {
  try {
    if (provider === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      return res.ok ? { ok: true, detalhe: "Chave do Google aceita." } : { ok: false, detalhe: "O Google recusou esta chave." };
    }
    if (provider === "elevenlabs") {
      const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      return res.ok ? { ok: true, detalhe: "Chave da ElevenLabs aceita." } : { ok: false, detalhe: "A ElevenLabs recusou esta chave." };
    }
    if (provider === "json2video") {
      const res = await fetch("https://api.json2video.com/v2/movies", { headers: { "x-api-key": key } });
      if (res.status === 401 || res.status === 403) return { ok: false, detalhe: "O JSON2Video recusou esta chave." };
      return res.ok || res.status === 400
        ? { ok: true, detalhe: "Chave do JSON2Video aceita." }
        : { ok: false, detalhe: `O JSON2Video respondeu com erro (${res.status}).` };
    }
    if (provider === "apify") {
      const res = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${key}` } });
      return res.ok ? { ok: true, detalhe: "Chave do Apify aceita." } : { ok: false, detalhe: "O Apify recusou esta chave." };
    }
    const res = await fetch("https://www.kalodata.com/openapi/v1/tiktok/category/rank", {
      method: "POST",
      headers: { "Content-Type": "application/json", "secret-key": key },
      body: JSON.stringify({
        region: "BR",
        language: "pt-BR",
        currency: "BRL",
        date_range: "last30Day",
        category_level: 1,
        sort_field: { field: "revenue", type: "DESC" },
        page_size: 1,
        page_number: 1,
        page: 1,
      }),
    });
    if (!res.ok) return { ok: false, detalhe: "O Kalodata recusou esta chave." };
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
    if (body && typeof body.code === "number" && body.code !== 0) {
      return { ok: false, detalhe: body.msg ? `Kalodata: ${body.msg}` : "O Kalodata recusou esta chave." };
    }
    return { ok: true, detalhe: "Chave do Kalodata aceita." };
  } catch (e) {
    console.error("[tenant-keys] falha no teste", provider, e instanceof Error ? e.message : e);
    return { ok: false, detalhe: "Não foi possível falar com o provedor agora." };
  }
}
