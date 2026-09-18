import { AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { brl } from "@/lib/custo";
import { useSaldosBaixos } from "@/lib/investimento";
import { useStudio } from "./studio-context";

/** Aviso de saldo baixo nos fornecedores. Saldo é dado interno: só backoffice vê. */
export function SupplierBalanceBanner() {
  const { isBackoffice } = useStudio();
  const baixos = useSaldosBaixos();
  if (!isBackoffice || !baixos.length) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold text-primary">
        <AlertTriangle className="size-4" />
        Saldo do fornecedor baixo
      </span>
      <span className="text-muted-foreground">
        {baixos
          .map((c) =>
            c.def.tipo === "assinatura" && c.ciclo
              ? `${c.def.nome}: ${c.def.unidadeLabel(Math.max(0, c.ciclo.cota - c.ciclo.usados))} no ciclo`
              : `${c.def.nome}: ${brl(c.saldoBrl ?? 0)}`,
          )
          .join(" · ")}
      </span>
      <Link to="/app/investimento" className="font-semibold text-primary underline-offset-2 hover:underline">
        Registrar aporte
      </Link>
    </div>
  );
}
