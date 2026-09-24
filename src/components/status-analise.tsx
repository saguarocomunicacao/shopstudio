import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, ExternalLink, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Mapa único de status de análise (Analisar vídeo e Perfis de referência). */
export type StatusAnaliseValor = "na_fila" | "enviando" | "baixando" | "analisando" | "pronto" | "erro";

const ETAPA: Record<string, string> = { enviando: "Enviando à IA", processando_no_gemini: "IA processando", gerando: "Gerando análise" };

export function StatusAnaliseBadge({ id, status, etapa, erro, semAnalise }: { id?: string | undefined; status?: string | null | undefined; etapa?: string | null | undefined; erro?: string | null | undefined; semAnalise?: string }) {
  if (!status) return <span className="text-xs text-muted-foreground">{semAnalise ?? "Não analisada"}</span>;
  const base = "inline-flex items-center gap-1 text-xs font-semibold";
  if (status === "na_fila") return <span className={`${base} text-muted-foreground`}><Clock className="size-3" />Na fila</span>;
  if (status === "pronto") {
    return id
      ? <Link to="/app/analises/$id" params={{ id }} onClick={(e) => e.stopPropagation()} className={`${base} text-cyan-ink underline`}>Pronta <ExternalLink className="size-3" /></Link>
      : <span className={`${base} text-cyan-ink`}>Pronta</span>;
  }
  if (status === "erro") {
    const inner = <span className={`${base} text-primary`}><AlertTriangle className="size-3" />Erro</span>;
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            {id ? <Link to="/app/analises/$id" params={{ id }} onClick={(e) => e.stopPropagation()} className="underline decoration-dotted">{inner}</Link> : <span>{inner}</span>}
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{erro || "Não foi possível analisar este vídeo."}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const label = status === "baixando" ? "Baixando" : status === "enviando" ? "Enviando" : (etapa && ETAPA[etapa]) || "Analisando";
  return <span className={`${base} text-primary`}><Loader2 className="size-3 animate-spin" />{label}</span>;
}
