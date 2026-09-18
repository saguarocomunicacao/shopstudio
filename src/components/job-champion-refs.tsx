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
      <section className="grid w-full min-w-0 gap-1 overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Trophy className="size-4" />
          Nenhuma referência para esta categoria
        </p>
      </section>
    );
  }

  return (
    <section className="grid w-full min-w-0 gap-2 overflow-hidden rounded-xl border border-primary/25 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-black text-primary">
          <Trophy className="size-4" />
          Referências que inspiraram
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="grid min-w-0 gap-2">
          <p className="text-xs text-muted-foreground">
            O roteiro abaixo foi inspirado no padrão destes vídeos. Você não precisa fazer nada com eles.
          </p>
          <ul className="grid max-h-64 min-w-0 gap-2 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
            {list.map((ref) => (
              <li
                key={ref.videoId}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
