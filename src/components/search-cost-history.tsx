import { brl, useBuscaCustos } from "@/lib/custo";
import { useStudio } from "./studio-context";

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Buscas recentes do perfil ativo com o custo de cada chamada. */
export function SearchCostHistory() {
  const { activeProfileId } = useStudio();
  const { data: buscas = [] } = useBuscaCustos(activeProfileId);
  if (!buscas.length) return null;

  const total = buscas.reduce((acc, b) => acc + b.valorBrl, 0);

  return (
    <div className="mt-6 grid gap-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Buscas recentes</p>
        <p className="text-xs text-muted-foreground">
          {buscas.length} {buscas.length === 1 ? "busca" : "buscas"} · {brl(total)}
        </p>
      </div>
      <ul className="grid gap-1.5 rounded-xl bg-secondary px-4 py-3 text-sm">
        {buscas.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="truncate font-semibold text-foreground">{b.termo}</span>
            <span className="text-xs text-muted-foreground">
              {b.linhas} {b.linhas === 1 ? "linha" : "linhas"} · {quando(b.created_at)}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {b.semTarifa ? "sem tarifa" : brl(b.valorBrl)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
