import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Webhook do Apify: avisa quando o download de um link terminou. */
export const Route = createFileRoute("/api/public/apify-webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const esperado = process.env["AUTOMATION_CRON_TOKEN"];
        if (!esperado || params.token !== esperado) return new Response("Unauthorized", { status: 401 });
        const body = z
          .object({ resource: z.object({ id: z.string().min(5).max(64) }).passthrough() })
          .passthrough()
          .safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Bad request", { status: 400 });
        try {
          const { concluirDownload } = await import("@/lib/video-analise.server");
          const r = await concluirDownload(body.data.resource.id);
          return Response.json({ ok: true, r });
        } catch (e) {
          console.error("[apify-webhook]", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
