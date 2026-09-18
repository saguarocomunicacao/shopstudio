import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Prompts do perfil no modelo "cópia no nascimento": o texto padrão do sistema
 * é lido aqui no servidor (o cliente nunca tem acesso a ele) e gravado como
 * cópia inicial do perfil. A escrita usa o cliente do usuário, então a RLS
 * continua exigindo permissão de edição naquele perfil.
 */

type TemplateRow = { key: string; body: string; updated_at: string };

async function lerPadroes(): Promise<TemplateRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("prompt_templates")
    .select("key, body, updated_at")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateRow[];
}

/** Cria as cópias iniciais dos prompts que o perfil ainda não tem. */
export const seedProfilePrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const templates = await lerPadroes();
    if (!templates.length) return { criados: 0 };

    const { data: existentes, error: readError } = await context.supabase
      .from("profile_prompt_overrides")
      .select("key")
      .eq("profile_id", data.profileId);
    if (readError) throw new Error(readError.message);

    const jaTem = new Set((existentes ?? []).map((row) => row.key));
    const novos = templates
      .filter((t) => !jaTem.has(t.key))
      .map((t) => ({
        profile_id: data.profileId,
        key: t.key,
        body: t.body,
        origem: "copiado_do_padrao",
        origem_versao: t.updated_at,
      }));
    if (!novos.length) return { criados: 0 };

    const { error } = await context.supabase.from("profile_prompt_overrides").insert(novos);
    if (error) throw new Error(error.message);
    return { criados: novos.length };
  });

/** Recopia o texto atual do padrão do sistema para um prompt do perfil. */
export const restoreProfilePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string; key: string }) =>
    z.object({ profileId: z.string().uuid(), key: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const template = (await lerPadroes()).find((t) => t.key === data.key);
    if (!template) throw new Error("Este prompt não existe mais no padrão do sistema.");

    const { error } = await context.supabase.from("profile_prompt_overrides").upsert(
      {
        profile_id: data.profileId,
        key: data.key,
        body: template.body,
        origem: "copiado_do_padrao",
        origem_versao: template.updated_at,
      },
      { onConflict: "profile_id,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
