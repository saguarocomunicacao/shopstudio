import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { opcoesReferencia } from "@/lib/referencias.functions";
import { actionError } from "@/lib/api-keys";

/** Liga/desliga a coleta diária de um @ sem apagar os dados. */
export function AcompanharButton({ refId, handle, acompanhar, compacto, onDone }: { refId: string; handle: string; acompanhar: boolean; compacto?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const opcoes = useServerFn(opcoesReferencia);
  const m = useMutation({
    mutationFn: () => opcoes({ data: { refId, acompanhar: !acompanhar } }),
    onSuccess: () => {
      toast.success(acompanhar ? `@${handle} pausado. Os dados continuam salvos.` : `Voltando a acompanhar @${handle}.`);
      void qc.invalidateQueries({ queryKey: ["referencias"] });
      void qc.invalidateQueries({ queryKey: ["referencia"] });
      void qc.invalidateQueries({ queryKey: ["radar"] });
      onDone?.();
    },
    onError: (e) => toast.error(actionError(e, "Não foi possível salvar.")),
  });
  const label = acompanhar ? "Deixar de acompanhar" : "Voltar a acompanhar";
  const Icon = acompanhar ? EyeOff : Eye;
  if (compacto) {
    return <Button size="icon" variant="ghost" aria-label={label} title={label} disabled={m.isPending} onClick={(e) => { e.stopPropagation(); m.mutate(); }}><Icon className="size-4" /></Button>;
  }
  return <Button size="sm" variant="secondary" disabled={m.isPending} onClick={() => m.mutate()}><Icon />{label}</Button>;
}
