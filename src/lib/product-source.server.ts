// Fonte de dados de produtos (adaptador plugável).
// Hoje: Kalodata. Para trocar de provedor, basta criar outro objeto que
// implemente ProductSource e registrá-lo em PRODUCT_SOURCES.

export type DiscoveredProduct = {
  externalId: string;
  source: string;
  name: string;
  price: number;
  commission: number;
  salesVolume: number;
  growthRate: number;
  revenue: number;
  imageUrl: string;
  sellerName: string;
  skuCount: number;
  category: string;
  productUrl: string;
  hype: number;
};

export type SortField =
  | "revenue"
  | "commission_rate"
  | "revenue_growth_rate"
  | "sales_volumn"
  | "unit_price"
  | "video_revenue";

export type DiscoverQuery = {
  keyword?: string;
  /** "lastDay" | "last7Day" | "last30Day" ou intervalo "yyyy-MM-dd~yyyy-MM-dd". */
  dateRange: string;
  sortField: SortField;
  sortType?: "ASC" | "DESC";
  categoryIds?: string[];
  /** Faixas no formato aceito pela API: "1-1000", ">1", "<1000". */
  unitPriceRange?: string;
  commissionRate?: string;
  revenueRange?: string;
  /** "<3" | "<7" | "<30" | ">30" */
  launchDate?: string;
  /** "local" | "global" */
  deliveryType?: string;
  needAll?: boolean;
  page: number;
};

export type ProductSource = {
  id: string;
  label: string;
  search: (query: DiscoverQuery) => Promise<{ items: DiscoveredProduct[]; hasMore: boolean }>;
};

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number.parseFloat(value.replace(/[^\d.-]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Hype score (0-100): média ponderada de três sinais normalizados por escala
 * logarítmica (valores absolutos variam em ordens de grandeza):
 *  - vendas (peso 0,4): log10(vendas) saturando em 100 mil unidades;
 *  - crescimento de receita (peso 0,35): 0% -> 0, 200% ou mais -> 1;
 *  - receita (peso 0,25): log10(receita) saturando em R$ 1 milhão.
 */
export function hypeScore(salesVolume: number, growthRate: number, revenue: number): number {
  const logNorm = (value: number, max: number) =>
    Math.min(1, Math.max(0, Math.log10(Math.max(0, value) + 1) / Math.log10(max + 1)));
  const growthNorm = Math.min(1, Math.max(0, growthRate / 200));
  const score = 0.4 * logNorm(salesVolume, 100_000) + 0.35 * growthNorm + 0.25 * logNorm(revenue, 1_000_000);
  return Math.round(score * 100);
}

const KALODATA_ENDPOINT = "https://www.kalodata.com/openapi/v1/tiktok/product/rank";
// A API devolve 10 itens por página e só aceita o parâmetro "page".
const PAGE_SIZE = 10;

// Rate limit do Kalodata: 10 req/10s. Serializamos as chamadas e garantimos
// um intervalo mínimo de 1s entre elas (nunca em paralelo).
let lastCall = 0;
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = 1000 - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastCall = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

const kalodata: ProductSource = {
  id: "kalodata",
  label: "Kalodata",
  search: (query) =>
    serialize(async () => {
      const apiKey = process.env["KALODATA_API_KEY"];
      if (!apiKey) throw new Error("A chave da fonte de produtos não está configurada.");

      const body: Record<string, unknown> = {
        region: "BR",
        language: "pt-BR",
        currency: "BRL",
        date_range: query.dateRange,
        sort_field: { field: query.sortField, type: query.sortType ?? "DESC" },
        is_affiliate: 1,
        page: query.page,
        need_image: 1,
        need_extra: true,
        need_all: query.needAll ?? false,
      };
      if (query.keyword?.trim()) body["keyword"] = query.keyword.trim();
      if (query.categoryIds?.length) body["category_ids"] = query.categoryIds;
      if (query.unitPriceRange) body["unit_price_range"] = query.unitPriceRange;
      if (query.commissionRate) body["commission_rate"] = query.commissionRate;
      if (query.revenueRange) body["revenue_range"] = query.revenueRange;
      if (query.launchDate) body["launch_date"] = query.launchDate;
      if (query.deliveryType) body["delivery_type"] = query.deliveryType;

      const response = await fetch(KALODATA_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "secret-key": apiKey },
        body: JSON.stringify(body),
      });

      if (response.status === 429) throw new Error("A fonte de produtos limitou as buscas. Tente de novo em alguns segundos.");
      if (response.status === 401 || response.status === 403) throw new Error("A chave da fonte de produtos foi recusada.");
      if (!response.ok) throw new Error(`A fonte de produtos respondeu com erro (${response.status}).`);

      const payload = (await response.json()) as { success?: boolean; data?: unknown; message?: string };
      if (payload.success === false) throw new Error(payload.message || "A fonte de produtos recusou a busca.");
      const rows = Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>[])
        : Array.isArray((payload.data as { list?: unknown } | undefined)?.list)
          ? ((payload.data as { list: Record<string, unknown>[] }).list)
          : [];

      const items = rows.map((row): DiscoveredProduct => {
        const salesVolume = Math.round(num(row["sales_volumn"] ?? row["sales_volume"]));
        const growthRate = num(row["revenue_growth_rate"]);
        const revenue = num(row["revenue"]);
        return {
          externalId: String(row["product_id"] ?? ""),
          source: "kalodata",
          name: String(row["product_name"] ?? "Produto sem nome"),
          price: num(row["unit_price"]),
          commission: num(row["commission_rate"]),
          salesVolume,
          growthRate,
          revenue,
          imageUrl: String(row["master_image_url"] ?? ""),
          sellerName: String(row["seller_name"] ?? row["shop_name"] ?? ""),
          skuCount: Math.round(num(row["sku_count"])),
          category: String(row["category_name"] ?? row["category"] ?? ""),
          productUrl: `https://shop.tiktok.com/view/product/${String(row["product_id"] ?? "")}`,
          hype: hypeScore(salesVolume, growthRate, revenue),
        };
      }).filter((item) => item.externalId);

      return { items, hasMore: rows.length >= PAGE_SIZE };
    }),
};

const KALODATA_CATEGORY_ENDPOINT = "https://www.kalodata.com/openapi/v1/tiktok/category/rank";

export type OfficialCategory = { categoryId: string; categoryName: string; level: number; parentId: string | null };

/** Categorias oficiais do TikTok Shop (nível 1) vindas do Kalodata. */
export function fetchOfficialCategories(level = 1): Promise<OfficialCategory[]> {
  return serialize(async () => {
    const apiKey = process.env["KALODATA_API_KEY"];
    if (!apiKey) throw new Error("A chave da fonte de produtos não está configurada.");

    const response = await fetch(KALODATA_CATEGORY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "secret-key": apiKey },
      body: JSON.stringify({
        region: "BR",
        language: "pt-BR",
        currency: "BRL",
        date_range: "last30Day",
        category_level: level,
        sort_field: { field: "revenue", type: "DESC" },
        page_size: 100,
        page_number: 1,
        page: 1,
      }),
    });

    if (response.status === 429) throw new Error("A fonte limitou as requisições. Tente de novo em alguns segundos.");
    if (response.status === 401 || response.status === 403) throw new Error("A chave da fonte de produtos foi recusada.");
    if (!response.ok) throw new Error(`A fonte de categorias respondeu com erro (${response.status}).`);

    const payload = (await response.json()) as { success?: boolean; data?: unknown; message?: string };
    if (payload.success === false) throw new Error(payload.message || "A fonte recusou a busca de categorias.");
    const rows = Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>[])
      : Array.isArray((payload.data as { list?: unknown } | undefined)?.list)
        ? (payload.data as { list: Record<string, unknown>[] }).list
        : [];

    return rows
      .map((row): OfficialCategory => ({
        categoryId: String(row["category_id"] ?? row["id"] ?? ""),
        categoryName: String(row["category_name"] ?? row["name"] ?? ""),
        level,
        parentId: row["parent_id"] ? String(row["parent_id"]) : null,
      }))
      .filter((c) => c.categoryId && c.categoryName);
  });
}

export const PRODUCT_SOURCES: Record<string, ProductSource> = { kalodata };
export const ACTIVE_SOURCE_ID = "kalodata";
export const activeProductSource = (): ProductSource => PRODUCT_SOURCES[ACTIVE_SOURCE_ID]!;
