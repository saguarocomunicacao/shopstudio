import { ExternalLink, Trophy } from "lucide-react";
import { brl } from "@/lib/custo";
import type { ChampionRef } from "@/lib/content";

const compact = (value: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

/** Mostra os vídeos campeões que serviram de inspiração para o roteiro. */
export function JobChampionRefs({ refs }: { refs?: ChampionRef[] | null }) {
  const list = (refs ?? []).filter((r) => r?.title);
  if (!list.length) return null;

  return (
    <section className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-black text-primary">
          <Trophy className="size-4" />
          Referências que inspiraram
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vídeos que mais venderam nesta categoria nos últimos 30 dias. Serviram só como sinal de abordagem — o roteiro é original.
        </p>
      </div>
      <ul className="grid gap-2">
        {list.map((ref) => (
          <li key={ref.videoId} className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{ref.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {compact(ref.views)} views · {brl(ref.revenue)}
                {ref.creator ? ` · @${ref.creator}` : ""}
              </p>
            </div>
            {ref.url ? (
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Abrir<ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
