import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do JSON2Video: recebe o vídeo renderizado e conclui o job.
 * A autenticidade é verificada por um token secreto no caminho da URL
 * (o JSON2Video não assina os webhooks — ver doc de Webhooks).
 */
export const Route = createFileRoute("/api/public/json2video-webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = process.env["JSON2VIDEO_WEBHOOK_TOKEN"];
        if (!expected || params.token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown> = {};
        const contentType = request.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("application/x-www-form-urlencoded")) {
            payload = Object.fromEntries(new URLSearchParams(await request.text()));
          } else {
            payload = (await request.json()) as Record<string, unknown>;
          }
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const clientData = (payload["client-data"] ?? {}) as Record<string, unknown>;
        const jobId = typeof clientData["job_id"] === "string" ? clientData["job_id"] : null;
        const renderId = typeof payload["project"] === "string" ? payload["project"] : null;
        if (!jobId && !renderId) return new Response("Missing job reference", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const query = supabaseAdmin.from("jobs").select("id, status, profile_id").limit(1);
        const { data: job } = jobId
          ? await query.eq("id", jobId).maybeSingle()
          : await query.eq("render_id", renderId!).maybeSingle();
        if (!job) return new Response("Job not found", { status: 404 });

        // Consumo da montagem: grava os créditos se vierem, senão registra o evento sem quantidade.
        const consumo = await import("@/lib/consumo.server");
        const credits = consumo.findCredits(payload);
        const { data: jaRegistrado } = await supabaseAdmin
          .from("consumo_eventos")
          .select("id")
          .eq("job_id", job.id)
          .eq("etapa", "montagem_json2video")
          .not("quantidade", "is", null)
          .limit(1)
          .maybeSingle();
        if (!jaRegistrado) {
          await consumo.recordConsumo({
            jobId: job.id,
            profileId: job.profile_id,
            etapa: "montagem_json2video",
            modelo: "json2video",
            quantidade: credits,
            unidade: "credito_montagem",
            metadados:
              credits === null
                ? { origem: "webhook", creditos_nao_retornados: true }
                : { origem: "webhook" },
          });
        }

        const url = typeof payload["url"] === "string" ? payload["url"] : "";
        const thumbnail = typeof payload["thumbnail"] === "string" ? payload["thumbnail"] : null;

        if (url) {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "video_pronto",
              render_stage: null,
              video_url: url,
              video_thumbnail_url: thumbnail,
              render_error: null,
            })
            .eq("id", job.id);
        } else {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "cenas_geradas",
              render_stage: null,
              render_error: "A renderização do vídeo falhou. Tente gerar novamente.",
            })
            .eq("id", job.id);
        }

        return new Response("ok");
      },
    },
  },
});
