import { brl, useBuscaCustos } from "@/lib/custo";
import { useStudio } from "./studio-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History } from "lucide-react";

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Buscas recentes do perfil ativo em um botão discreto que abre um modal-tabela. */
export function SearchCostHistory({ onRepeat }: { onRepeat?: (termo: string) => void }) {
  const { activeProfileId, isBackoffice, can } = useStudio();
  const podeVer = isBackoffice || can("custos", "visualizar", activeProfileId);
  const { data: buscas = [] } = useBuscaCustos(podeVer ? activeProfileId : null);
  if (!podeVer || !buscas.length) return null;

  const total = buscas.reduce((acc, b) => acc + b.valorBrl, 0);
  const podeRepetir = typeof onRepeat === "function";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <History className="size-4" />
          Buscas recentes ({buscas.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Buscas recentes</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Termo</TableHead>
                <TableHead className="w-20 text-right">Linhas</TableHead>
                <TableHead className="w-28">Data/hora</TableHead>
                <TableHead className="w-28 text-right">Custo R$</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buscas.map((b) => (
                <TableRow
                  key={b.id}
                  className={podeRepetir ? "cursor-pointer" : undefined}
                  onClick={podeRepetir ? () => onRepeat!(b.termo) : undefined}
                >
                  <TableCell className="truncate font-semibold text-foreground max-w-[16rem]">{b.termo}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.linhas}</TableCell>
                  <TableCell className="text-muted-foreground">{quando(b.created_at)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {b.semTarifa ? "sem tarifa" : brl(b.valorBrl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-sm font-semibold">
            {buscas.length} {buscas.length === 1 ? "busca" : "buscas"} · {brl(total)}
          </p>
          {podeRepetir && (
            <p className="text-xs text-muted-foreground">Clique numa linha para repetir a busca.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
