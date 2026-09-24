import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "./studio-context";
import { adicionarReferenciaFn } from "@/lib/referencias.functions";
import { actionError } from "@/lib/api-keys";

/** "Adicionar a Perfis de referência": cria o @ no perfil atual, com acompanhamento diário e primeira coleta. */
export function AddReferenciaButton({ handle, jaAcompanhado, size = "sm", compacto }: { handle: string; jaAcompanhado?: boolean; size?: "sm" | "default"; compacto?: boolean }) {
  const { activeProfileId, isBackoffice, can } = useStudio();
  const qc = useQueryClient();
  const adicionar = useServerFn(adicionarReferenciaFn);
  const [feito, setFeito] = useState(false);
  const podeEditar = isBackoffice || can("pipeline", "editar", activeProfileId) || can("pipeline", "criar", activeProfileId);
  const h = handle.replace(/^@/, "");
  const mut = useMutation({
    mutationFn: () => adicionar({ data: { profileId: activeProfileId!, handle: h, qtd: 20, acompanhar: true } }),
    onSuccess: () => { setFeito(true); toast.success(`@${h} adicionado. A primeira coleta começou.`); void qc.invalidateQueries({ queryKey: ["referencias"] }); },
    onError: (e) => {
      const msg = actionError(e, "Não foi possível adicionar o @.");
      if (/já está na lista/i.test(msg)) setFeito(true);
      toast.error(msg);
    },
  });
  if (!h) return null;
  if (jaAcompanhado || feito) return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"><Check className="size-3" />Já acompanhado</span>;
  if (!podeEditar || !activeProfileId) return null;
  return (
    <Button size={size} variant="secondary" disabled={mut.isPending} onClick={(e) => { e.stopPropagation(); mut.mutate(); }} title="Adicionar a Perfis de referência">
      {mut.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}{compacto ? "Acompanhar" : "Adicionar a Perfis de referência"}
    </Button>
  );
}
