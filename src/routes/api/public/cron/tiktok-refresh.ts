import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada: renova os access_tokens do TikTok Shop que expiram nas próximas 48h.
 * O access_token do criador dura ~7 dias; rodar diariamente mantém todas as contas válidas.
 */
export const Route = createFileRoute("/api/public/cron/tiktok-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { refreshExpiring } = await import("@/lib/tiktok.server");
        try {
          const results = await refreshExpiring(48, 50);
          return Response.json({ ok: true, processados: results.length, results });
        } catch (e) {
          const motivo = e instanceof Error ? e.message : String(e);
          console.error("[tiktok-oauth] renovação agendada falhou:", motivo);
          return Response.json({ ok: false, error: motivo }, { status: 500 });
        }
      },
    },
  },
});
