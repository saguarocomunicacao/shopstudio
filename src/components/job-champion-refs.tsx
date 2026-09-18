import { useState } from "react";
import { ChevronDown, ExternalLink, Trophy } from "lucide-react";
import { brl } from "@/lib/custo";
import type { ChampionRef } from "@/lib/content";

const MAX_VISIVEL = 5;

const compact = (value: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

/** Mostra os vídeos campeões que serviram de inspiração para o roteiro. */
export function JobChampionRefs({ refs }: { refs?: ChampionRef[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  const list = (refs ?? [])
    .filter((r) => r?.title?.trim())
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    .slice(0, MAX_VISIVEL);

  if (!list.length) {
    return (
      <div className="w-full rounded-xl border border-border bg-muted/30 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Trophy className="size-4 shrink-0" />
          Nenhuma referência de vídeo para esta categoria
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-primary/25 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-primary">
          <Trophy className="size-4 shrink-0" />
          Referências que inspiraram
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-primary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            O roteiro foi inspirado no padrão destes vídeos que mais venderam na categoria. Informativo, você não precisa fazer nada.
          </p>
          {list.map((ref) => (
            <div
              key={ref.videoId}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{ref.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
                  {compact(ref.views)} views · {brl(ref.revenue)}
                  {ref.creator ? ` · @${ref.creator}` : ""}
                </p>
              </div>
              {ref.url ? (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Abrir<ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
