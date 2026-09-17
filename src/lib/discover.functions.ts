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
  deliveryType: z.enum(["local", "global"]).optional(),
  needAll: z.boolean().default(false),
  page: z.number().int().min(1).max(20).default(1),
  profileId: z.string().uuid().nullable().optional(),
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
    }

    const { activeProductSource } = await import("./product-source.server");
    const source = activeProductSource();
    const result = await source.search({
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
      ...(data.deliveryType ? { deliveryType: data.deliveryType } : {}),
    });
    // Consumo real da busca: uma linha por evento, com o termo buscado.
    if (data.profileId) {
      const rows = Array.isArray((result as { items?: unknown[] }).items)
        ? (result as { items: unknown[] }).items.length
        : 0;
      const { recordConsumo, findCredits } = await import("./consumo.server");
      const credits = findCredits(result);
      await recordConsumo({
        jobId: null,
        profileId: data.profileId,
        etapa: "busca_kalodata",
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

    return { source: source.id, sourceLabel: source.label, ...result };
  });
