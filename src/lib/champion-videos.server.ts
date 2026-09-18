/**
 * "Roteiro alimentado por campeões": busca no Kalodata os vídeos que mais
 * venderam na categoria do produto e usa os títulos como referência de gancho
 * para o roteirista. O resultado fica em cache por 24 h por categoria, porque
 * cada busca tem custo de API.
 */

const VIDEO_RANK_ENDPOINT = "https://www.kalodata.com/openapi/v1/tiktok/video/rank";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REFS = 8;

export type ChampionVideo = {
  videoId: string;
  title: string;
  views: number;
  revenue: number;
  creator: string;
  url: string;
};

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number.parseFloat(value.replace(/[^\d.-]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Liga/desliga global da referência de campeões (Configurações do sistema). */
export async function championRefsEnabled(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("value_num")
      .eq("key", "roteiro_usar_campeoes")
      .maybeSingle();
    // Sem registro = ligado (padrão).
    return data?.value_num === null || data?.value_num === undefined ? true : Number(data.value_num) > 0;
  } catch {
    return false;
  }
}

/**
 * Categoria REAL do produto no TikTok Shop, da mais específica para a mais
 * ampla. Quando o catálogo ainda não tem os ids, busca no detalhe do Kalodata
 * e guarda. Sem categoria confiável devolve null — melhor nenhuma referência
 * do que referência de categoria errada.
 */
export async function productCategoryId(
  supabase: { from: (t: string) => any },
  productId: string | null,
): Promise<string | null> {
  if (!productId) return null;
  try {
    const { data: row } = await supabase
      .from("products")
      .select("external_id, pri_cate_id, sec_cate_id, ter_cate_id")
      .eq("id", productId)
      .maybeSingle();
    if (!row) return null;

    const pick = (r: Record<string, unknown>) =>
      [r["ter_cate_id"], r["sec_cate_id"], r["pri_cate_id"]]
        .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
        .find((v) => v && v !== "0") ?? null;

    const known = pick(row as Record<string, unknown>);
    if (known) return known;

    if (!row.external_id) return null;
    const { fetchProductDetail } = await import("./product-source.server");
    const detail = await fetchProductDetail(String(row.external_id));
    if (!detail) return null;
    const update = {
      pri_cate_id: detail.priCateId,
      sec_cate_id: detail.secCateId,
      ter_cate_id: detail.terCateId,
    };
    if (!update.pri_cate_id && !update.sec_cate_id && !update.ter_cate_id) return null;
    await supabase.from("products").update(update).eq("id", productId);
    return detail.terCateId ?? detail.secCateId ?? detail.priCateId ?? null;
  } catch (e) {
    console.error("[campeoes] falha ao resolver categoria do produto", e);
    return null;
  }
}

async function fetchFromKalodata(categoryId: string): Promise<ChampionVideo[]> {
  const apiKey = process.env["KALODATA_API_KEY"];
  if (!apiKey) return [];

  const response = await fetch(VIDEO_RANK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "secret-key": apiKey },
    body: JSON.stringify({
      region: "BR",
      language: "pt-BR",
      currency: "BRL",
      date_range: "last30Day",
      sort_field: { field: "revenue", type: "DESC" },
      page: 1,
      category_ids: [categoryId],
    }),
  });
  if (!response.ok) throw new Error(`video/rank respondeu ${response.status}`);

  const payload = (await response.json()) as { success?: boolean; data?: unknown; message?: string };
  if (payload.success === false) throw new Error(payload.message || "video/rank recusou a busca");
  const rows = Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>[])
    : Array.isArray((payload.data as { list?: unknown } | undefined)?.list)
      ? (payload.data as { list: Record<string, unknown>[] }).list
      : [];

  return rows
    .map((row): ChampionVideo => {
      const videoId = String(row["video_id"] ?? "");
      const creator = String(row["belonged_creator_handle"] ?? "");
      return {
        videoId,
        title: String(row["video_title"] ?? "").trim(),
        views: Math.round(num(row["views"])),
        revenue: num(row["revenue"]),
        creator,
        url: creator && videoId ? `https://www.tiktok.com/@${creator}/video/${videoId}` : "",
      };
    })
    .filter((v) => v.videoId && v.title)
    .slice(0, MAX_REFS);
}

/**
 * Vídeos campeões da categoria, do cache (24 h) ou da API.
 * Qualquer falha devolve lista vazia: o roteiro segue sem referência.
 */
export async function getChampionVideos(
  categoryId: string | null,
  profileId: string | null,
): Promise<ChampionVideo[]> {
  // Sem categoria específica do produto não buscamos nada: referência de
  // categoria errada atrapalha mais o roteirista do que a ausência dela.
  if (!categoryId) return [];
  const cacheKey = categoryId;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cached } = await supabaseAdmin
      .from("kalodata_video_refs")
      .select("videos, fetched_at")
      .eq("category_id", cacheKey)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return (cached.videos as unknown as ChampionVideo[]) ?? [];
    }

    const videos = await fetchFromKalodata(categoryId);
    if (!videos.length) return (cached?.videos as unknown as ChampionVideo[]) ?? [];

    await supabaseAdmin
      .from("kalodata_video_refs")
      .upsert(
        { category_id: cacheKey, videos: videos as never, fetched_at: new Date().toISOString() },
        { onConflict: "category_id" },
      );

    const { recordConsumo } = await import("./consumo.server");
    await recordConsumo({
      jobId: null,
      profileId,
      etapa: "busca_kalodata",
      modelo: "kalodata-video-rank",
      quantidade: videos.length,
      unidade: "bloco_linhas_kalodata",
      metadados: { tipo: "video_rank", categoria: cacheKey, videos: videos.length },
    });

    return videos;
  } catch (e) {
    console.error("[campeoes] falha ao buscar vídeos de referência", e);
    return [];
  }
}

/** Bloco de referência anexado ao prompt do roteirista. */
export function championPromptBlock(videos: ChampionVideo[]): string {
  const list = videos
    .filter((v) => v.title)
    .slice(0, MAX_REFS)
    .map((v) => `- "${v.title}"`)
    .join("\n");
  if (!list) return "";
  return [
    "",
    "GANCHOS QUE ESTÃO VENDENDO nesta categoria agora (use como inspiração de estrutura e ângulo, NÃO copie literalmente):",
    list,
    "",
    "Analise o padrão desses ganchos vencedores (perguntas, promessas, urgência, dor, curiosidade) e escreva um gancho ORIGINAL no mesmo espírito do que converte, mantendo o tom do perfil e a fidelidade ao produto. Nunca reproduza o título de ninguém nem cite esses criadores.",
  ].join("\n");
}
