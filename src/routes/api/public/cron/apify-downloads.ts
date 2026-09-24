import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/** Rede de segurança do webhook do Apify: roda a cada 5 min. */
export const Route = createFileRoute("/api/public/cron/apify-downloads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-automation-token") ?? "";
        const esperado = process.env["AUTOMATION_CRON_TOKEN"] ?? "";
        const ok = esperado && token.length === esperado.length && timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const { varrerDownloadsParados, varrerAnalises } = await import("@/lib/video-analise.server");
          const results = await varrerDownloadsParados(10);
          const analises = await varrerAnalises(3);
          const { varrerColetas } = await import("@/lib/metricas.server");
          const metricas = await varrerColetas(10);
          const { varrerReferencias } = await import("@/lib/referencias.server");
          const referencias = await varrerReferencias(10);
          return Response.json({ ok: true, results, analises, metricas, referencias });
        } catch (e) {
          console.error("[cron apify-downloads]", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
