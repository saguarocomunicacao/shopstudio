import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { opcoesReferencia } from "@/lib/referencias.functions";
import { actionError } from "@/lib/api-keys";

/** Liga/desliga a coleta diária de um @ sem apagar os dados. */
export function AcompanharButton({ refId, handle, acompanhar, compacto, onDone }: { refId: string; handle: string; acompanhar: boolean; compacto?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const opcoes = useServerFn(opcoesReferencia);
  const [confirmando, setConfirmando] = useState(false);
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
  // Olho aberto e verde quando acompanhando; fechado e cinza quando pausado.
  const Icon = acompanhar ? Eye : EyeOff;
  const cor = acompanhar ? "text-cyan-ink" : "text-muted-foreground";

  const disparar = () => setConfirmando(true);

  if (compacto) {
    return (
      <>
        <Button size="icon" variant="ghost" aria-label={label} title={label} disabled={m.isPending} onClick={(e) => { e.stopPropagation(); disparar(); }}>
          <Icon className={`size-4 ${cor}`} />
        </Button>
        <DialogConfirma
          open={confirmando}
          onOpenChange={setConfirmando}
          acompanhar={acompanhar}
          handle={handle}
          disabled={m.isPending}
          onConfirm={() => m.mutate()}
        />
      </>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" disabled={m.isPending} onClick={disparar}>
        <Icon className={cor} />{label}
      </Button>
      <DialogConfirma
        open={confirmando}
        onOpenChange={setConfirmando}
        acompanhar={acompanhar}
        handle={handle}
        disabled={m.isPending}
        onConfirm={() => m.mutate()}
      />
    </>
  );
}

function DialogConfirma({ open, onOpenChange, acompanhar, handle, disabled, onConfirm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  acompanhar: boolean;
  handle: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{acompanhar ? `Pausar @${handle}?` : `Voltar a acompanhar @${handle}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {acompanhar
              ? "A coleta diária é desligada, mas o @ e os dados coletados continuam salvos. Você pode religar quando quiser."
              : "A coleta diária volta a rodar às 06:00 junto com as Métricas."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={disabled}
          >
            {disabled ? <Loader2 className="size-4 animate-spin" /> : null}
            {acompanhar ? "Pausar" : "Voltar a acompanhar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
