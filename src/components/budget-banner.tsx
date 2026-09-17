import { AlertTriangle, Ban, Wallet } from "lucide-react";
import { brl } from "@/lib/custo";
import { useGastoMes } from "@/lib/orcamento";
import { useStudio } from "./studio-context";

/** Gasto acumulado do mês + alerta de 80% e bloqueio em 100% do teto. */
export function BudgetBanner() {
  const { activeProfileId } = useStudio();
  const gasto = useGastoMes(activeProfileId);
  if (!gasto) return null;

  const teto = gasto.tetoPerfil ?? gasto.tetoGlobal;
  const tom = gasto.bloqueado
    ? "border-destructive/40 bg-destructive/10"
    : gasto.alerta
      ? "border-primary/40 bg-primary/10"
      : "border-border bg-secondary";
  const Icon = gasto.bloqueado ? Ban : gasto.alerta ? AlertTriangle : Wallet;

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border px-4 py-3 text-sm ${tom}`}>
      <span className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" />
        Gasto do mês
      </span>
      <span className="text-muted-foreground">
        Perfil <strong className="text-foreground">{brl(gasto.perfilBrl)}</strong>
        {" · "}
        Geral <strong className="text-foreground">{brl(gasto.globalBrl)}</strong>
        {teto ? ` · teto ${brl(teto)} (${Math.round(gasto.uso * 100)}%)` : " · sem teto definido"}
      </span>
      {gasto.bloqueado && (
        <span className="font-semibold text-destructive">
          Orçamento do mês atingido: novas gerações de vídeo estão bloqueadas. Um administrador pode aumentar o teto em
          Configurações.
        </span>
      )}
      {gasto.alerta && <span className="font-semibold text-primary">Você já passou de 80% do orçamento do mês.</span>}
    </div>
  );
}
