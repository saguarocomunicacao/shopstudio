import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** (Re)gera a descrição de um produto por IA de visão, a partir das fotos reais. */
export const generateProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("products")
      .select("id, name, niche, profile_id, image_url, extra_image_urls")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Produto não encontrado ou sem permissão de acesso.");

    const { generateAndSaveDescription } = await import("./product-description.server");
    const description = await generateAndSaveDescription(supabase as never, row as never);
    return { description };
  });
