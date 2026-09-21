import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sincroniza as categorias oficiais do TikTok Shop (nível 1). Somente admin. */
export const syncCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: assignments } = await context.supabase
      .from("user_profile_roles")
      .select("role_id")
      .eq("user_id", context.userId);
    const roleIds = [...new Set((assignments ?? []).map((a: { role_id: string }) => a.role_id))];
    const { data: adminRoles } = roleIds.length
      ? await context.supabase.from("roles").select("id").in("id", roleIds).eq("is_admin", true)
      : { data: [] };
    if (!(adminRoles ?? []).length) throw new Error("Apenas administradores podem atualizar as categorias.");

    const { fetchOfficialCategories } = await import("./product-source.server");
    const { withTenantKeys, tenantIdOfUser } = await import("./api-keys.server");
    const tenantId = await tenantIdOfUser(context.supabase, context.userId);
    const categories = await withTenantKeys(tenantId, () => fetchOfficialCategories(1));
    if (!categories.length) return { count: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").upsert(
      categories.map((c) => ({
        category_id: c.categoryId,
        category_name: c.categoryName,
        level: c.level,
        parent_id: c.parentId,
      })),
      { onConflict: "category_id" },
    );
    if (error) throw new Error(error.message);

    // Consumo global: a atualização de categorias usa a mesma API paga da busca.
    const { recordConsumo } = await import("./consumo.server");
    await recordConsumo({
      jobId: null,
      profileId: null,
      etapa: "busca_kalodata",
      acao: "atualizacao_categorias",
      modelo: "kalodata-product-rank",
      unidade: "bloco_linhas_kalodata",
      quantidade: categories.length,
      metadados: { tipo: "atualizacao_categorias", linhas: categories.length },
    });

    return { count: categories.length };
  });
