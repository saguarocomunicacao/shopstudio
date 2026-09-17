import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS_LABELS, type JobStatusKey } from "@/lib/content";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table className="min-w-[620px]">
          <TableHeader className="bg-secondary/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-xs font-semibold">Etapa</TableHead>
              <TableHead className="px-4 text-xs font-semibold">Início</TableHead>
              <TableHead className="px-4 text-xs font-semibold">Fim</TableHead>
              <TableHead className="px-4 text-right text-xs font-semibold">Duração</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const start = new Date(e.entered_at).getTime();
              const end = e.exited_at ? new Date(e.exited_at).getTime() : now;
              const live = !e.exited_at;
              return (
                <TableRow key={e.id}>
                  <TableCell className="px-4 py-3 font-semibold text-foreground">{JOB_STATUS_LABELS[e.status]}</TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">{clock(e.entered_at)}</TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">{e.exited_at ? clock(e.exited_at) : "—"}</TableCell>
                  <TableCell className={live ? "whitespace-nowrap px-4 py-3 text-right font-semibold text-primary" : "whitespace-nowrap px-4 py-3 text-right font-medium text-foreground"}>
                    {live ? `rodando há ${formatDuration(end - start)}` : formatDuration(end - start)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
