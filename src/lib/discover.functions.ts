import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Faixa aceita pela API: "1-1000", ">1" ou "<1000". */
const faixa = z.string().regex(/^(\d+(\.\d+)?-\d+(\.\d+)?|[<>]\d+(\.\d+)?)$/).optional();

const schema = z.object({
  keyword: z.string().max(120).optional(),
  dateRange: z
    .string()
    .regex(/^(lastDay|last7Day|last30Day|\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2})$/)
    .default("last7Day"),
  sortField: z
    .enum(["revenue", "commission_rate", "revenue_growth_rate", "sales_volumn", "unit_price", "video_revenue"])
    .default("revenue"),
  sortType: z.enum(["ASC", "DESC"]).default("DESC"),
  unitPriceRange: faixa,
  commissionRate: faixa,
  revenueRange: faixa,
  launchDate: z.enum(["<3", "<7", "<30", ">30"]).optional(),
  categoryIds: z.array(z.string().min(1)).max(10).optional(),
  deliveryType: z.enum(["local", "global"]).optional(),
  needAll: z.boolean().default(false),
  page: z.number().int().min(1).max(20).default(1),
  profileId: z.string().uuid().nullable().optional(),
  origem: z.enum(["descobrir", "radar"]).optional(),
});

/** O usuário precisa poder visualizar produtos em pelo menos um escopo. */
async function assertCanViewProducts(supabase: any, userId: string) {
  const { data: assignments } = await supabase.from("user_profile_roles").select("role_id").eq("user_id", userId);
  const roleIds = [...new Set((assignments ?? []).map((a: { role_id: string }) => a.role_id))];
  if (!roleIds.length) throw new Error("Sem permissão para ver produtos.");

  const { data: adminRoles } = await supabase.from("roles").select("id").in("id", roleIds).eq("is_admin", true);
  if ((adminRoles ?? []).length) return;

  const { data: perms } = await supabase.from("permissions").select("id").eq("module", "produtos").eq("action", "visualizar");
  const permIds = (perms ?? []).map((p: { id: string }) => p.id);
  if (!permIds.length) throw new Error("Sem permissão para ver produtos.");

  const { data: link } = await supabase
    .from("role_permissions")
    .select("role_id")
    .in("role_id", roleIds)
    .in("permission_id", permIds)
    .limit(1);
  if (!(link ?? []).length) throw new Error("Sem permissão para ver produtos.");
}

export const discoverProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanViewProducts(context.supabase, context.userId);
    // Etapa barata: só trava se o admin optar por bloquear tudo ao estourar o teto.
    if (data.profileId) {
      const { assertOrcamento } = await import("./orcamento.server");
      await assertOrcamento(data.profileId, { barata: true });
      const { assertSaldoPerfil } = await import("./saldo.server");
      await assertSaldoPerfil(data.profileId, { busca_produto: 1 });
    }

    const { activeProductSource } = await import("./product-source.server");
    const { withTenantKeys, tenantIdOfUser } = await import("./api-keys.server");
    const tenantId = await tenantIdOfUser(context.supabase, context.userId);
    const source = activeProductSource();
    const result = await withTenantKeys(tenantId, () => source.search({
      dateRange: data.dateRange,
      sortField: data.sortField,
      sortType: data.sortType,
      needAll: data.needAll,
      page: data.page,
      ...(data.keyword ? { keyword: data.keyword } : {}),
      ...(data.unitPriceRange ? { unitPriceRange: data.unitPriceRange } : {}),
      ...(data.commissionRate ? { commissionRate: data.commissionRate } : {}),
      ...(data.revenueRange ? { revenueRange: data.revenueRange } : {}),
      ...(data.launchDate ? { launchDate: data.launchDate } : {}),
      ...(data.categoryIds?.length ? { categoryIds: data.categoryIds } : {}),
      ...(data.deliveryType ? { deliveryType: data.deliveryType } : {}),
    }));
    // Consumo real da busca: uma linha por evento, com o termo buscado.
    let consumoEventoId: string | null = null;
    if (data.profileId) {
      const rows = Array.isArray((result as { items?: unknown[] }).items)
        ? (result as { items: unknown[] }).items.length
        : 0;
      const { recordConsumo, findCredits } = await import("./consumo.server");
      const credits = findCredits(result);
      consumoEventoId = await recordConsumo({
        jobId: null,
        profileId: data.profileId,
        etapa: "busca_kalodata",
        acao: "busca_produto",
        modelo: source.id,
        quantidade: credits ?? rows,
        unidade: "bloco_linhas_kalodata",
        metadados: {
          termo: data.keyword ?? "",
          pagina: data.page,
          periodo: data.dateRange,
          ordenacao: data.sortField,
          linhas: rows,
          ...(credits !== null ? { creditos_api: credits } : {}),
        },
      });
    }

    // Guarda a busca e os resultados (30 dias) para o histórico e o assistente.
    if (data.profileId) {
      try {
        const { tenantIdOfProfile } = await import("./api-keys.server");
        const tenantPerfil = (await tenantIdOfProfile(context.supabase, data.profileId)) ?? tenantId;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const items = ((result as { items?: Array<Record<string, unknown>> }).items ?? []).slice(0, 50);
        const { profileId: _p, origem, ...filtros } = data;
        await supabaseAdmin.from("buscas_produto").insert({
          tenant_id: tenantPerfil as string, profile_id: data.profileId, user_id: context.userId,
          origem: origem ?? "descobrir", termo: data.keyword ?? null, filtros: filtros as never,
          total: items.length, resultados: items as never, consumo_evento_id: consumoEventoId,
        });
        await supabaseAdmin.from("buscas_produto").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
      } catch (e) {
        console.error("[buscas] falha ao guardar busca", e);
      }
    }

    return { source: source.id, sourceLabel: source.label, ...result };
  });

/**
 * Busca no Kalodata a descrição real, as imagens extras e as métricas atuais
 * dos produtos e guarda no catálogo. Falhas são silenciosas: o produto segue
 * utilizável apenas com nome e foto principal.
 * Com `force`, reprocessa mesmo produtos que já têm descrição.
 */
export const enrichProductDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ productIds: z.array(z.string().uuid()).min(1).max(20), force: z.boolean().default(false) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("products")
      .select(
        "id, name, niche, external_id, image_url, description, description_origem, profile_id, price, commission, sales_volume, growth_rate, revenue",
      )
      .in("id", data.productIds);

    const pending = (rows ?? []).filter(
      (r: { external_id: string | null; description: string | null }) =>
        r.external_id && (data.force || !r.description),
    );
    if (!pending.length) return { enriched: 0, failed: 0 };

    const { fetchProductDetail, hypeScore } = await import("./product-source.server");
    const { withTenantKeys, assertTenantKeys, tenantIdOfUser } = await import("./api-keys.server");
    const tenantId = await tenantIdOfUser(supabase, context.userId);
    // No plano BYOK a atualização de produto exige a chave do Kalodata.
    await assertTenantKeys(tenantId, ["kalodata"]);
    const { assertOrcamento } = await import("./orcamento.server");
    await assertOrcamento(pending[0]?.profile_id ?? null, { barata: true });
    const { assertSaldo } = await import("./saldo.server");
    await assertSaldo(tenantId, { atualizacao_produto: pending.length });

    const { recordConsumo } = await import("./consumo.server");
    let enriched = 0;
    let failed = 0;

    for (const row of pending as {
      id: string;
      name: string;
      niche: string | null;
      external_id: string;
      image_url: string | null;
      description: string | null;
      description_origem: string | null;
      profile_id: string | null;
      price: number | string;
      commission: number | string;
      sales_volume: number;
      growth_rate: number | string;
      revenue: number | string;
    }[]) {
      const detail = await withTenantKeys(tenantId, () => fetchProductDetail(row.external_id));
      await recordConsumo({
        jobId: null,
        profileId: row.profile_id,
        etapa: "busca_kalodata",
        acao: "atualizacao_produto",
        modelo: "kalodata-product-detail",
        // A quantidade em pontos vem da taxa configurada (credito_taxas), não daqui.
        quantidade: null,
        unidade: "bloco_linhas_kalodata",
        metadados: { tipo: "detalhe_produto", produto: row.id, encontrado: !!detail },
      });
      if (!detail) {
        failed += 1;
        continue;
      }

      const images = [...new Set([row.image_url ?? "", ...detail.images].filter(Boolean))].slice(0, 4);
      const salesVolume = detail.salesVolume ?? Number(row.sales_volume ?? 0);
      const growthRate = detail.growthRate ?? Number(row.growth_rate ?? 0);
      const revenue = detail.revenue ?? Number(row.revenue ?? 0);
      // Descrição editada à mão nunca é sobrescrita pelo reprocessamento.
      const manual = row.description_origem === "manual";
      const update = {
        extra_image_urls: images,
        sales_volume: salesVolume,
        growth_rate: growthRate,
        revenue,
        hype: hypeScore(salesVolume, growthRate, revenue),
        updated_at: new Date().toISOString(),
        ...(detail.description && !manual ? { description: detail.description, description_origem: "kalodata" } : {}),
        ...(detail.price !== null && detail.price > 0 ? { price: detail.price } : {}),
        ...(detail.commission !== null && detail.commission > 0 ? { commission: detail.commission } : {}),
        ...(detail.priCateId ? { pri_cate_id: detail.priCateId } : {}),
        ...(detail.secCateId ? { sec_cate_id: detail.secCateId } : {}),
        ...(detail.terCateId ? { ter_cate_id: detail.terCateId } : {}),
      };

      const { error } = await supabase.from("products").update(update).eq("id", row.id);
      if (error) {
        failed += 1;
        continue;
      }
      enriched += 1;

      // Fonte sem descrição: a IA de visão descreve o produto pelas fotos reais.
      const descricaoAtual = (manual ? row.description : detail.description || row.description) ?? "";
      if (!descricaoAtual.trim() && images.length) {
        try {
          const { generateAndSaveDescription } = await import("./product-description.server");
          await generateAndSaveDescription(supabase as never, {
            id: row.id,
            name: row.name,
            niche: row.niche,
            profile_id: row.profile_id,
            image_url: row.image_url,
            extra_image_urls: images,
          });
        } catch {
          // Produto segue utilizável com nome e fotos.
        }
      }
    }

    return { enriched, failed };
  });
