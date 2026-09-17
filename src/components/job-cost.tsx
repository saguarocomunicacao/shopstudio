import { AlertTriangle } from "lucide-react";
import { ETAPA_LABELS, UNIDADE_LABELS, brl, useJobCustos, type CustoJob } from "@/lib/custo";
import { useStudio } from "./studio-context";

const unidadeDaEtapa = {
  cena_gemini: "imagem",
  animacao_veo: "segundo_video",
  montagem_json2video: "credito_montagem",
  busca_kalodata: "bloco_linhas_kalodata",
} as const;

export function useJobCusto(jobId: string): CustoJob | null {
  const { activeProfileId } = useStudio();
  const { data } = useJobCustos(activeProfileId);
  return data?.get(jobId) ?? null;
}

/** Valor curto para o card do kanban. */
export function JobCostBadge({ jobId }: { jobId: string }) {
  const custo = useJobCusto(jobId);
  if (!custo || custo.totalBrl <= 0) return null;
  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
      {brl(custo.totalBrl)}
      {(custo.estimado || custo.semTarifa) && <AlertTriangle className="size-3 text-muted-foreground" />}
    </span>
  );
}

/** Quebra por etapa no detalhe do job. */
export function JobCostSummary({ jobId }: { jobId: string }) {
  const custo = useJobCusto(jobId);
  if (!custo || custo.etapas.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Custo</p>
      <ul className="grid gap-1.5 rounded-xl bg-secondary px-4 py-3 text-sm">
        {custo.etapas.map((etapa) => (
          <li key={etapa.etapa} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="font-semibold text-foreground">{ETAPA_LABELS[etapa.etapa]}</span>
            <span className="text-xs text-muted-foreground">
              {UNIDADE_LABELS[unidadeDaEtapa[etapa.etapa]](etapa.quantidade)}
              {etapa.estimado && " · estimado"}
              {etapa.semTarifa && " · sem tarifa"}
            </span>
            <span className="text-xs font-semibold text-foreground">{brl(etapa.valorBrl)}</span>
          </li>
        ))}
        <li className="mt-1 flex items-baseline justify-between border-t pt-2">
          <span className="font-bold">Total do job</span>
          <span className="font-bold text-primary">{brl(custo.totalBrl)}</span>
        </li>
      </ul>
      {(custo.regeneracoes > 0 || custo.takesDescartados > 0 || custo.estimado || custo.semTarifa) && (
        <p className="text-xs text-muted-foreground">
          {[
            custo.regeneracoes > 0 ? `inclui ${custo.regeneracoes} ${custo.regeneracoes === 1 ? "regeneração" : "regenerações"}` : null,
            custo.takesDescartados > 0 ? `${custo.takesDescartados} ${custo.takesDescartados === 1 ? "take descartado" : "takes descartados"}` : null,
            custo.estimado ? "algum valor é estimado" : null,
            custo.semTarifa ? "há consumo sem tarifa cadastrada" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
