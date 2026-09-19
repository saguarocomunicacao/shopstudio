import { createFileRoute } from "@tanstack/react-router";

/**
 * Retorno da autorização do TikTok Shop.
 * Valida o state (CSRF), troca o auth_code por tokens e volta para a tela do perfil.
 */
export const Route = createFileRoute("/auth_/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const authCode = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
        const state = url.searchParams.get("state");

        const back = (path: string, params: Record<string, string>) => {
          const target = new URL(path, url.origin);
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          return Response.redirect(target.toString(), 302);
        };

        if (!state) return back("/app", { tiktok: "error", msg: "Autorização inválida (sem state)." });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pending } = await supabaseAdmin
          .from("tiktok_oauth_states")
          .select("state, profile_id, redirect_to, expires_at")
          .eq("state", state)
          .maybeSingle();

        if (!pending) return back("/app", { tiktok: "error", msg: "Autorização expirada ou inválida. Tente conectar de novo." });
        await supabaseAdmin.from("tiktok_oauth_states").delete().eq("state", state);

        const destino = pending.redirect_to ?? `/app/perfis/${pending.profile_id}/editar`;

        if (new Date(pending.expires_at).getTime() < Date.now()) {
          return back(destino, { tiktok: "error", msg: "A autorização demorou demais. Tente conectar de novo." });
        }

        if (!authCode) {
          const motivo = url.searchParams.get("message") ?? "O TikTok não devolveu o código de autorização.";
          const { markConnectionError } = await import("@/lib/tiktok.server");
          await markConnectionError(pending.profile_id, motivo);
          return back(destino, { tiktok: "error", msg: motivo });
        }

        try {
          const { exchangeAuthCode, saveConnection } = await import("@/lib/tiktok.server");
          const tokens = await exchangeAuthCode(authCode);
          await saveConnection(pending.profile_id, tokens);
          return back(destino, { tiktok: "ok" });
        } catch (e) {
          const motivo = e instanceof Error ? e.message : String(e);
          const { markConnectionError } = await import("@/lib/tiktok.server");
          await markConnectionError(pending.profile_id, motivo);
          return back(destino, { tiktok: "error", msg: motivo });
        }
      },
    },
  },
});
