import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MISSING_KEY_EVENT, PROVIDER_LABEL, PROVIDER_USE, useTenantKeys, type KeyProvider } from "@/lib/api-keys";
import { useStudio } from "./studio-context";

/** Aviso amigável quando a geração parou por falta de uma chave do cliente. */
export function MissingKeyDialog() {
  const [provider, setProvider] = useState<KeyProvider | null>(null);

  useEffect(() => {
    const handler = (event: Event) => setProvider((event as CustomEvent<KeyProvider>).detail);
    window.addEventListener(MISSING_KEY_EVENT, handler);
    return () => window.removeEventListener(MISSING_KEY_EVENT, handler);
  }, []);

  if (!provider) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && setProvider(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Configure sua chave de {PROVIDER_LABEL[provider]}</AlertDialogTitle>
          <AlertDialogDescription>
            No seu plano, a geração usa as suas próprias contas. Cadastre a chave de {PROVIDER_LABEL[provider]} para{" "}
            {PROVIDER_USE[provider]} e tente de novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Agora não</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Link to="/app/apis" onClick={() => setProvider(null)}>
              <KeyRound className="size-4" />
              Ir para Minhas APIs
            </Link>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Faixa fixa avisando que faltam chaves obrigatórias no plano do cliente. */
export function PendingKeysBanner() {
  const { isAdmin, isSuperAdmin } = useStudio();
  const { data } = useTenantKeys();
  if (!data?.byok || !data.missing.length) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" />
        Você tem chaves de API pendentes
      </span>
      <span className="text-muted-foreground">
        Falta configurar: {data.missing.map((p) => PROVIDER_LABEL[p]).join(", ")}. Sem elas, a geração fica bloqueada.
      </span>
      {(isAdmin || isSuperAdmin) && (
        <Link to="/app/apis" className="font-semibold text-primary underline-offset-4 hover:underline">
          Configurar agora
        </Link>
      )}
    </div>
  );
}
