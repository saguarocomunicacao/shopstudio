import { AlertTriangle } from "lucide-react";
import { ETAPA_LABELS, UNIDADE_LABELS, brl, useJobCustos, type CustoEtapa, type CustoJob, type EtapaConsumo } from "@/lib/custo";
import { useStudio } from "./studio-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const unidadeDaEtapa: Record<EtapaConsumo, "imagem" | "segundo_video" | "credito_montagem" | "bloco_linhas_kalodata" | "token_input" | "mil_caracteres"> = {
  cena_gemini: "imagem",
  animacao_veo: "segundo_video",
  montagem_json2video: "credito_montagem",
  busca_kalodata: "bloco_linhas_kalodata",
  roteiro_texto: "token_input",
  narracao_elevenlabs: "mil_caracteres",
};

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

const consumoDaEtapa = (etapa: CustoEtapa) => {
  const unidade = unidadeDaEtapa[etapa.etapa];
  const base = UNIDADE_LABELS[unidade](etapa.quantidade);
  const flags = [etapa.estimado ? "estimado" : null, etapa.semTarifa ? "sem tarifa" : null].filter(Boolean).join(" · ");
  return flags ? `${base} · ${flags}` : base;
};

/** Quebra por etapa no detalhe do job. */
export function JobCostSummary({ jobId }: { jobId: string }) {
  const custo = useJobCusto(jobId);
  if (!custo || custo.etapas.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Custo</p>
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
          <TableHeader className="bg-secondary/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-xs font-semibold">Etapa</TableHead>
              <TableHead className="px-4 text-xs font-semibold">Consumo</TableHead>
              <TableHead className="px-4 text-right text-xs font-semibold">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {custo.etapas.map((etapa) => (
              <TableRow key={etapa.etapa}>
                <TableCell className="px-4 py-3 font-semibold text-foreground">{ETAPA_LABELS[etapa.etapa]}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{consumoDaEtapa(etapa)}</TableCell>
                <TableCell className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">{brl(etapa.valorBrl)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent">
              <TableCell className="px-4 py-3 font-bold text-foreground">Total do job</TableCell>
              <TableCell className="px-4 py-3" />
              <TableCell className="whitespace-nowrap px-4 py-3 text-right font-bold text-primary">{brl(custo.totalBrl)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
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
