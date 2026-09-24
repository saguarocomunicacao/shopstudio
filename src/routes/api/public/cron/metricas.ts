import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/** Coleta diária das métricas dos perfis (06:00 Brasília). */
export const Route = createFileRoute("/api/public/cron/metricas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-automation-token") ?? "";
        const esperado = process.env["AUTOMATION_CRON_TOKEN"] ?? "";
        const ok = esperado && token.length === esperado.length && timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const { iniciarColetasDiarias } = await import("@/lib/metricas.server");
          const perfis = await iniciarColetasDiarias();
          const { iniciarColetasDiariasRef } = await import("@/lib/referencias.server");
          const referencias = await iniciarColetasDiariasRef();
          return Response.json({ ok: true, perfis, referencias });
        } catch (e) {
          console.error("[cron metricas]", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
