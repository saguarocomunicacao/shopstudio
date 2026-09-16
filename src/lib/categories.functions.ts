import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sincroniza as categorias oficiais do TikTok Shop (nível 1). Somente admin. */
export const syncCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_app_admin_self");
    if (adminError || !isAdmin) throw new Error("Apenas administradores podem atualizar as categorias.");

    const { fetchOfficialCategories } = await import("./product-source.server");
    const categories = await fetchOfficialCategories(1);
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
    return { count: categories.length };
  });
