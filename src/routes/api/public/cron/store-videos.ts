import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada: varre jobs com vídeo pronto sem cópia local e salva um lote
 * pequeno por execução. Garante que nenhum vídeo se perca nos 7 dias do JSON2Video.
 */
export const Route = createFileRoute("/api/public/cron/store-videos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { sweepPendingVideos } = await import("@/lib/video-storage.server");
        try {
          const results = await sweepPendingVideos(3);
          return Response.json({ ok: true, processados: results.length, results });
        } catch (e) {
          const motivo = e instanceof Error ? e.message : String(e);
          console.error("[video-storage] varredura falhou:", motivo);
          return Response.json({ ok: false, error: motivo }, { status: 500 });
        }
      },
    },
  },
});
