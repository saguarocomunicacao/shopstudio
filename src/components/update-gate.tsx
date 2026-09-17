import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { forceReload, useAppVersionWatcher } from "@/lib/app-version";

/** Modal bloqueante: quando sai uma versao nova, o usuario precisa recarregar. */
export function UpdateGate() {
  const updateAvailable = useAppVersionWatcher();
  const [reloading, setReloading] = useState(false);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-background/85 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm text-center">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
          <RefreshCw className="h-5 w-5" />
        </span>
        <h2 className="text-xl font-black">Nova versão disponível</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Uma atualização foi publicada. Recarregue para continuar com a versão mais recente.
        </p>
        <Button
          className="mt-6 w-full"
          disabled={reloading}
          onClick={() => { setReloading(true); void forceReload(); }}
        >
          {reloading ? "Atualizando..." : "Atualizar agora"}
        </Button>
      </div>
    </div>
  );
}
