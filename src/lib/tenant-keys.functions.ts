import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cadastro das chaves de API do cliente (BYOK). Nesta etapa as chaves apenas
 * ficam guardadas: a geração continua usando as chaves da plataforma.
 */

const SUPER_ADMIN_EMAIL = "saguaro.comunicacao@gmail.com";
const providerSchema = z.enum(["gemini", "json2video", "elevenlabs", "kalodata", "apify"]);

type Ctx = { supabase: { from: (t: string) => any; rpc: (n: string, a?: unknown) => any }; userId: string };

/** Só o admin do cliente (ou o super admin) mexe no cofre. */
async function requireTenantAdmin(context: Ctx) {
  const { data: me, error } = await context.supabase
    .from("app_users")
    .select("id, email, tenant_id, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!me?.tenant_id) throw new Error("Sua conta ainda não está vinculada a um cliente.");

  const isSuper = String(me.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;
  if (!isSuper) {
    if (me.status !== "aprovado") throw new Error("Sua conta ainda não foi liberada.");
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_profile_roles")
      .select("roles:role_id ( is_admin )")
      .eq("user_id", context.userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const isAdmin = (roles ?? []).some((r: { roles?: { is_admin?: boolean } | null }) => r.roles?.is_admin);
    if (!isAdmin) throw new Error("Apenas o administrador da conta pode gerenciar as chaves de API.");
  }
  return { tenantId: me.tenant_id as string };
}

export const saveTenantApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ provider: providerSchema, apiKey: z.string().trim().min(8).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await requireTenantAdmin(context as unknown as Ctx);
    const { encryptSecret } = await import("./tenant-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const encrypted = await encryptSecret(data.apiKey);
    const { error } = await supabaseAdmin
      .from("tenant_api_keys")
      .upsert(
        {
          tenant_id: tenantId,
          provider: data.provider,
          encrypted_key: encrypted,
          status: "configurada",
          last_tested_at: null,
          last_test_ok: null,
        },
        { onConflict: "tenant_id,provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTenantApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ provider: providerSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { tenantId } = await requireTenantAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenant_api_keys")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testTenantApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ provider: providerSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { tenantId } = await requireTenantAdmin(context as unknown as Ctx);
    const { decryptSecret, testProviderKey } = await import("./tenant-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("tenant_api_keys")
      .select("encrypted_key")
      .eq("tenant_id", tenantId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Nenhuma chave cadastrada para este provedor.");

    const result = await testProviderKey(data.provider, await decryptSecret(row.encrypted_key));
    await supabaseAdmin
      .from("tenant_api_keys")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: result.ok })
      .eq("tenant_id", tenantId)
      .eq("provider", data.provider);
    return result;
  });
