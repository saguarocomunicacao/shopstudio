import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Conexão da conta TikTok Shop por perfil.
 * Os tokens ficam só no servidor — estas funções devolvem apenas status e dados públicos.
 */

export type TiktokConnectionView = {
  status: "connected" | "disconnected" | "error";
  openId: string | null;
  sellerName: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

const profileInput = (data: unknown) => z.object({ profileId: z.string().uuid() }).parse(data);

/** Confere se o usuário pode ver/editar este perfil. */
async function assertAccess(
  supabase: { rpc: (fn: "can_edit_profile" | "can_view_profile", args: { _profile_id: string }) => PromiseLike<{ data: unknown }> },
  profileId: string,
  modo: "ver" | "editar",
) {
  const fn = modo === "editar" ? "can_edit_profile" : "can_view_profile";
  const { data } = await supabase.rpc(fn, { _profile_id: profileId });
  if (data !== true) throw new Error("Você não tem permissão para esta conta.");
}

/** Estado da conexão mostrado na aba Integrações. */
export const getTiktokConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(profileInput)
  .handler(async ({ data, context }): Promise<TiktokConnectionView | null> => {
    await assertAccess(context.supabase, data.profileId, "ver");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tiktok_connections")
      .select("status, open_id, seller_name, access_token_expires_at, refresh_token_expires_at, last_error, updated_at")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      status: (row.status as TiktokConnectionView["status"]) ?? "disconnected",
      openId: row.open_id,
      sellerName: row.seller_name,
      accessTokenExpiresAt: row.access_token_expires_at,
      refreshTokenExpiresAt: row.refresh_token_expires_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  });

/** Gera o state anti-CSRF e devolve a URL de autorização do TikTok. */
export const startTiktokAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid(), redirectTo: z.string().max(300).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.profileId, "editar");
    const { authorizeUrl } = await import("@/lib/tiktok.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const redirectTo =
      data.redirectTo && data.redirectTo.startsWith("/") ? data.redirectTo : `/app/perfis/${data.profileId}/editar`;

    const { error } = await supabaseAdmin.from("tiktok_oauth_states").insert({
      state,
      profile_id: data.profileId,
      user_id: context.userId,
      redirect_to: redirectTo,
    });
    if (error) throw new Error(error.message);

    return { url: authorizeUrl(state) };
  });

/** Desconecta a conta e apaga os tokens guardados. */
export const disconnectTiktok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(profileInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.profileId, "editar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tiktok_connections")
      .update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        last_error: null,
      })
      .eq("profile_id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Renova o token manualmente (útil para conferir se a conexão continua válida). */
export const refreshTiktokToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(profileInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.profileId, "editar");
    const { refreshProfile, markConnectionError } = await import("@/lib/tiktok.server");
    try {
      const tokens = await refreshProfile(data.profileId);
      return { ok: true, accessTokenExpiresAt: tokens.accessTokenExpiresAt };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await markConnectionError(data.profileId, motivo);
      throw new Error(motivo);
    }
  });
