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

        const cols = "id, status, profile_id, formato";
        let job: { id: string; status: string; profile_id: string; formato: string | null } | null = null;
        if (jobId) {
          const { data } = await supabaseAdmin.from("jobs").select(cols).eq("id", jobId).maybeSingle();
          job = data as typeof job;
        } else {
          const { data } = await supabaseAdmin.from("jobs").select(cols).eq("render_id", renderId!).maybeSingle();
          job = data as typeof job;
          if (!job) {
            // Vídeo próprio: a montagem por IA usa a trilha ai_* do job gravado.
            const { data: aiJob } = await supabaseAdmin
              .from("jobs")
              .select(cols)
              .eq("ai_render_id", renderId!)
              .maybeSingle();
            job = aiJob as typeof job;
          }
        }
        if (!job) return new Response("Job not found", { status: 404 });
        const aiTrack = job.formato === "gravacao";

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
          const pronto = {
            status: "video_pronto",
            render_stage: null,
            video_url: url,
            video_thumbnail_url: thumbnail,
            render_error: null,
            video_storage_status: "pendente",
            video_storage_error: null,
          };
          await supabaseAdmin
            .from("jobs")
            .update(
              aiTrack
                ? {
                    ai_status: "video_pronto",
                    ai_render_stage: null,
                    ai_video_url: url,
                    ai_video_thumbnail_url: thumbnail,
                    ai_render_error: null,
                    ai_video_storage_status: "pendente",
                    ai_video_storage_error: null,
                  }
                : { ...pronto, video_storage_updated_at: new Date().toISOString() },
            )
            .eq("id", job.id);

          // O JSON2Video apaga o arquivo em 7 dias: guardamos uma cópia nossa.
          // A cópia roda fora da resposta do webhook; a rotina agendada cobre o que falhar.
          const { ensureJobVideoStoredWithRetry } = await import("@/lib/video-storage.server");
          void ensureJobVideoStoredWithRetry(job.id, 3, aiTrack ? "ia" : "principal").catch((e) => {
            console.error(`[video-storage] cópia em background do job ${job.id} falhou:`, e);
          });
        } else {
          await supabaseAdmin
            .from("jobs")
            .update(
              aiTrack
                ? {
                    ai_status: "cenas_geradas",
                    ai_render_stage: null,
                    ai_render_error: "A renderização do vídeo falhou. Tente gerar novamente.",
                  }
                : {
                    status: "cenas_geradas",
                    render_stage: null,
                    render_error: "A renderização do vídeo falhou. Tente gerar novamente.",
                  },
            )
            .eq("id", job.id);
        }


        return new Response("ok");
      },
    },
  },
});
