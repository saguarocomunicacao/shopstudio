import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS_LABELS, type JobStatusKey } from "@/lib/content";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type JobEvento = { id: string; tipo: string; de_status: string | null; para_status: string | null; mensagem: string | null; ator: string | null; created_at: string };

const stLabel = (s: string | null) => (s ? JOB_STATUS_LABELS[s as JobStatusKey] ?? s : "");
function descreverEvento(e: JobEvento) {
  if (e.tipo === "criado") return `Job criado em ${stLabel(e.para_status)}`;
  if (e.tipo === "avancou") return `Avançou de ${stLabel(e.de_status)} para ${stLabel(e.para_status)}`;
  if (e.tipo === "voltou") return `Voltou de ${stLabel(e.de_status)} para ${stLabel(e.para_status)}`;
  if (e.tipo === "tentativa") return e.mensagem ?? "Nova tentativa";
  if (e.tipo === "erro") return "Uma tentativa falhou";
  return e.tipo;
}

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
  const { data: acoes = [] } = useQuery({
    queryKey: ["job-eventos", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_eventos")
        .select("id, tipo, de_status, para_status, mensagem, ator, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = (data ?? []) as JobEvento[];
      const ids = [...new Set(rows.map((r) => r.ator).filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: us } = await supabase.from("app_users").select("id, name, email").in("id", ids);
        for (const u of us ?? []) nomes.set(u.id, u.name || u.email.split("@")[0] || "usuário");
      }
      return rows.map((r) => ({ ...r, quem: r.ator ? nomes.get(r.ator) ?? "outro membro da equipe" : "sistema" }));
    },
    refetchInterval: 10000,
  });

  const FINAL_STATUSES: JobStatusKey[] = ["video_pronto", "publicado"];
  const running = events.some((e) => !e.exited_at && !FINAL_STATUSES.includes(e.status));
  const now = useNow(running);

  if (events.length === 0 && acoes.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Histórico</p>
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
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
              const isFinal = FINAL_STATUSES.includes(e.status);
              const live = !e.exited_at && !isFinal;
              return (
                <TableRow key={e.id}>
                  <TableCell className="px-4 py-3 font-semibold text-foreground">{JOB_STATUS_LABELS[e.status]}</TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">{clock(e.entered_at)}</TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {isFinal ? "—" : e.exited_at ? clock(e.exited_at) : "—"}
                  </TableCell>
                  <TableCell className={live ? "whitespace-nowrap px-4 py-3 text-right font-semibold text-primary" : "whitespace-nowrap px-4 py-3 text-right font-medium text-foreground"}>
                    {isFinal ? "concluído" : live ? `rodando há ${formatDuration(end - start)}` : formatDuration(end - start)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {acoes.length > 0 && (
        <div className="grid gap-1.5 rounded-xl border bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">Ações e tentativas</p>
          <ul className="grid gap-1 text-sm">
            {acoes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={e.tipo === "erro" ? "text-destructive" : "text-foreground"}>{descreverEvento(e)}</span>
                <span className="text-xs text-muted-foreground">{e.quem}  {clock(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
