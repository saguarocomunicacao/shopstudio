/**
 * Download de vídeos de links (TikTok, YouTube, Instagram) via Apify.
 *
 * - Plano shop_studio: usa a conexão Apify da plataforma (via gateway do Lovable).
 * - Plano BYOK: usa a chave Apify do próprio cliente direto na API do Apify.
 */
import { resolveApiKey } from "./api-keys.server";

export type Rede = "tiktok" | "youtube" | "instagram";

export const ATOR_PADRAO: Record<Rede, string> = {
  tiktok: "clockworks/tiktok-scraper",
  youtube: "streamers/youtube-video-downloader",
  instagram: "apify/instagram-reel-scraper",
};

export function detectarRede(url: string): Rede | null {
  let host = "";
  let path = "";
  try {
    const u = new URL(url.trim());
    host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    path = u.pathname;
  } catch {
    return null;
  }
  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") return "youtube";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host === "instagram.com" && /^\/(reel|reels|p)\//.test(path)) return "instagram";
  return null;
}

const GATEWAY = "https://connector-gateway.lovable.dev/apify";
const DIRETO = "https://api.apify.com/v2";
const WEBHOOK_BASE = "https://project--c5a0c6dd-28ab-4eee-a22b-3c59cd2e5a81.lovable.app";

async function keySource(tenantId: string): Promise<"shop_studio" | "byok"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("tenants").select("plans:plan_id ( key_source )").eq("id", tenantId).maybeSingle();
  return (data as { plans?: { key_source?: string } | null } | null)?.plans?.key_source === "byok" ? "byok" : "shop_studio";
}

/** Chamada à API do Apify com a credencial certa para o cliente. */
export async function apifyFetch(tenantId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if ((await keySource(tenantId)) === "shop_studio") {
    const lovable = process.env["LOVABLE_API_KEY"];
    const conn = process.env["APIFY_API_KEY"];
    if (!lovable || !conn) throw new Error("O serviço de download de links não está configurado na plataforma.");
    headers.set("Authorization", `Bearer ${lovable}`);
    headers.set("X-Connection-Api-Key", conn);
    return fetch(`${GATEWAY}${path}`, { ...init, headers });
  }
  const key = await resolveApiKey(tenantId, "apify");
  headers.set("Authorization", `Bearer ${key}`);
  return fetch(`${DIRETO}${path}`, { ...init, headers });
}

async function atorDe(rede: Rede): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_config").select("value_text").eq("key", `apify_actor_${rede}`).maybeSingle();
  return (data?.value_text || ATOR_PADRAO[rede]).trim();
}

function inputDoAtor(rede: Rede, url: string) {
  if (rede === "tiktok")
    return { postURLs: [url], shouldDownloadVideos: true, resultsPerPage: 1, commentsPerPost: 0, scrapeRelatedVideos: false };
  if (rede === "youtube")
    return { videos: [{ url }], storeInKVStore: true, preferredFormat: "mp4", preferredQuality: "720p" };
  return { username: [url], resultsLimit: 1, includeDownloadedVideo: true };
}

/** Inicia o run e devolve o id (não espera terminar). */
export async function iniciarDownload(tenantId: string, rede: Rede, url: string): Promise<string> {
  const ator = (await atorDe(rede)).replace("/", "~");
  const token = process.env["AUTOMATION_CRON_TOKEN"];
  const hook = token
    ? Buffer.from(
        JSON.stringify([
          {
            eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
            requestUrl: `${WEBHOOK_BASE}/api/public/apify-webhook/${token}`,
          },
        ]),
      ).toString("base64")
    : "";
  // timeout=600: o próprio Apify encerra o run em 10 min e avisa pelo webhook.
  const res = await apifyFetch(tenantId, `/acts/${ator}/runs?timeout=600&maxItems=1${hook ? `&webhooks=${encodeURIComponent(hook)}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputDoAtor(rede, url)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[apify] iniciar", res.status, body.slice(0, 400));
    if (res.status === 402) throw new Error("A conta de download de links está sem saldo. Avise o suporte.");
    throw new Error("Não foi possível começar o download desse link.");
  }
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) throw new Error("Não foi possível começar o download desse link.");
  return json.data.id;
}

export type RunInfo = { status: string; datasetId?: string; custoUsd: number };

export async function lerRun(tenantId: string, runId: string): Promise<RunInfo> {
  const res = await apifyFetch(tenantId, `/actor-runs/${runId}`);
  if (!res.ok) {
    console.error("[apify] run", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return { status: "UNKNOWN", custoUsd: 0 };
  }
  const d = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {};
  return {
    status: String(d["status"] ?? "UNKNOWN"),
    datasetId: d["defaultDatasetId"] as string | undefined,
    custoUsd: Number(d["usageTotalUsd"] ?? 0) || 0,
  };
}

export async function abortarRun(tenantId: string, runId: string) {
  await apifyFetch(tenantId, `/actor-runs/${runId}/abort`, { method: "POST" }).catch(() => null);
}

export async function lerItem(tenantId: string, datasetId: string): Promise<Record<string, unknown> | null> {
  const res = await apifyFetch(tenantId, `/datasets/${datasetId}/items?limit=1&clean=true`);
  if (!res.ok) return null;
  const arr = (await res.json().catch(() => [])) as Record<string, unknown>[];
  return arr[0] ?? null;
}

/** Procura no item o link do MP4 salvo no armazenamento do Apify. */
export function acharMp4(item: Record<string, unknown>): string | null {
  const achados: string[] = [];
  const visitar = (v: unknown, d: number) => {
    if (d > 5 || v == null) return;
    if (typeof v === "string") {
      if (/^https?:\/\//.test(v)) achados.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => visitar(x, d + 1));
    else if (typeof v === "object") Object.values(v as object).forEach((x) => visitar(x, d + 1));
  };
  visitar(item, 0);
  return (
    achados.find((u) => /api\.apify\.com\/v2\/key-value-stores\/[^/]+\/records\//.test(u) && !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) ??
    null
  );
}

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) {
    const parts = k.split(".");
    let v: unknown = o;
    for (const p of parts) v = v && typeof v === "object" ? (v as Record<string, unknown>)[p] : undefined;
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
const n = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export type RedeMeta = {
  rede: Rede;
  titulo: string | null;
  autor: string | null;
  duracao: number | null;
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  publicado_em: string | null;
};

export function extrairMeta(rede: Rede, item: Record<string, unknown>): RedeMeta {
  const autorRaw = pick(item, "authorMeta.name", "ownerUsername", "channelUsername", "uploader", "channelName", "author");
  let publicado = pick(item, "createTimeISO", "timestamp", "uploadDate", "date", "publishedAt");
  if (typeof publicado === "number") publicado = new Date(publicado * (publicado < 1e12 ? 1000 : 1)).toISOString();
  return {
    rede,
    titulo: (pick(item, "title", "text", "caption") as string | undefined)?.toString().slice(0, 200) ?? null,
    autor: autorRaw ? String(autorRaw).replace(/^@/, "") : null,
    duracao: n(pick(item, "videoMeta.duration", "videoDuration", "duration", "lengthSeconds")),
    thumb: (pick(item, "videoMeta.coverUrl", "thumbnailUrl", "displayUrl", "thumbnail") as string | undefined) ?? null,
    views: n(pick(item, "playCount", "videoPlayCount", "viewCount", "videoViewCount", "views")),
    likes: n(pick(item, "diggCount", "likesCount", "likes")),
    comentarios: n(pick(item, "commentCount", "commentsCount")),
    compartilhamentos: n(pick(item, "shareCount", "sharesCount")),
    publicado_em: publicado ? String(publicado) : null,
  };
}

/** Baixa o MP4 do Apify (com credencial se preciso). */
export async function baixarArquivo(tenantId: string, url: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  let res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    const path = url.replace(/^https?:\/\/api\.apify\.com\/v2/, "");
    res = await apifyFetch(tenantId, path);
  }
  if (!res.ok) throw new Error(`download ${res.status}`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > 200 * 1024 * 1024) throw new Error("grande demais");
  return { bytes, mime: mime.startsWith("video/") ? mime : "video/mp4" };
}
