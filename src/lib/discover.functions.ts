import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  keyword: z.string().max(120).optional(),
  dateRange: z.enum(["lastDay", "last7Day", "last30Day"]).default("last7Day"),
  sortField: z.enum(["revenue", "sales_volumn", "revenue_growth_rate"]).default("revenue"),
  page: z.number().int().min(1).max(20).default(1),
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
    const { activeProductSource } = await import("./product-source.server");
    const source = activeProductSource();
    const result = await source.search({
      dateRange: data.dateRange,
      sortField: data.sortField,
      page: data.page,
      ...(data.keyword ? { keyword: data.keyword } : {}),
    });
    return { source: source.id, sourceLabel: source.label, ...result };
  });
