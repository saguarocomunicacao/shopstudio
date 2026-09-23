import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import type { DbJob } from "@/lib/content";
import { advanceJobVideo } from "@/lib/video.functions";

/**
 * Empurra a produção dos vídeos em andamento uma etapa por vez.
 * Cada etapa é idempotente no servidor, então reabrir a tela retoma de onde parou.
 */
export function useVideoDriver(jobs: DbJob[]) {
  const advance = useServerFn(advanceJobVideo);
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    const pending = jobs.filter((j) =>
      // Vídeo próprio: a versão por IA roda na trilha ai_*, com as mesmas pausas de aprovação.
      j.formato === "gravacao"
        ? (j.status === "gerando_cenas" || j.status === "gerando_video") &&
          !!j.ai_render_stage &&
          j.ai_render_stage !== "render"
        : (j.status === "gerando_cenas" || j.status === "gerando_video") &&
          !!j.render_stage &&
          j.render_stage !== "render",
    );


    if (!pending.length || running.current) return;
    running.current = true;
    void (async () => {
      for (const job of pending) {
        try {
          await advance({ data: { jobId: job.id } });
        } catch {
          // o erro já foi gravado no job; a tela mostra a mensagem
        }
      }
      running.current = false;
      qc.invalidateQueries({ queryKey: ["jobs"] });
    })();
  }, [jobs, advance, qc]);
}
