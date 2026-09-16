import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS_LABELS, type JobStatusKey } from "@/lib/content";

type StageEvent = {
  id: string;
  status: JobStatusKey;
  entered_at: string;
  exited_at: string | null;
};

/** Formata uma duração em milissegundos como "8s", "1min12s" ou "2h04min". */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min < 60) return sec ? `${min}min${String(sec).padStart(2, "0")}s` : `${min}min`;
  const hours = Math.floor(min / 60);
  return `${hours}h${String(min % 60).padStart(2, "0")}min`;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function JobTimeline({ jobId }: { jobId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["job-stages", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_stage_events")
        .select("id, status, entered_at, exited_at")
        .eq("job_id", jobId)
        .order("entered_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as StageEvent[];
    },
    refetchInterval: 10000,
  });

  const running = events.some((e) => !e.exited_at);
  const now = useNow(running);

  if (events.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Histórico</p>
      <ul className="grid gap-1.5 rounded-xl bg-secondary px-4 py-3 text-sm">
        {events.map((e) => {
          const start = new Date(e.entered_at).getTime();
          const end = e.exited_at ? new Date(e.exited_at).getTime() : now;
          const live = !e.exited_at;
          return (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-semibold text-foreground">{JOB_STATUS_LABELS[e.status]}</span>
              <span className="text-xs text-muted-foreground">
                {clock(e.entered_at)}
                {e.exited_at ? ` → ${clock(e.exited_at)}` : ""}
              </span>
              <span className={live ? "text-xs font-semibold text-primary" : "text-xs font-semibold text-foreground"}>
                {live ? `rodando há ${formatDuration(end - start)}` : formatDuration(end - start)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
