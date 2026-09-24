import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Cron de 1 min: confere downloads de links (Apify) e segue para a análise. */
export const Route = createFileRoute("/api/public/cron/analise-downloads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-automation-token");
        const esperado = process.env["AUTOMATION_CRON_TOKEN"];
        if (!(token && esperado && token === esperado)) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        try {
          const { verificarDownloads } = await import("@/lib/video-analise.server");
          const results = await verificarDownloads(3);
          return Response.json({ ok: true, results });
        } catch (e) {
          console.error("[analise] cron falhou", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
