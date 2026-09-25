import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { TikTokIcon } from "./tiktok-icon";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actionError } from "@/lib/api-keys";
import {
  disconnectTiktok,
  getTiktokConnection,
  refreshTiktokToken,
  startTiktokAuth,
  type TiktokConnectionView,
} from "@/lib/tiktok.functions";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Bloco "TikTok Shop" da aba Integrações do perfil. */
export function TiktokIntegrationCard({ profileId, canEdit }: { profileId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const fetchConnection = useServerFn(getTiktokConnection);
  const startAuth = useServerFn(startTiktokAuth);
  const disconnect = useServerFn(disconnectTiktok);
  const refreshToken = useServerFn(refreshTiktokToken);

  const { data: conexao, isLoading } = useQuery<TiktokConnectionView | null>({
    queryKey: ["tiktok-connection", profileId],
    queryFn: () => fetchConnection({ data: { profileId } }),
  });

  // Mensagem de retorno do callback (?tiktok=ok | ?tiktok=error&msg=...)
  useEffect(() => {
    const url = new URL(window.location.href);
    const resultado = url.searchParams.get("tiktok");
    if (!resultado) return;
    if (resultado === "ok") toast.success("Conta TikTok conectada.");
    else toast.error(url.searchParams.get("msg") ?? "Não foi possível conectar a conta TikTok.");
    url.searchParams.delete("tiktok");
    url.searchParams.delete("msg");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void qc.invalidateQueries({ queryKey: ["tiktok-connection", profileId] });
  }, [profileId, qc]);

  const conectar = useMutation({
    mutationFn: async () => {
      const redirectTo = `${window.location.pathname}${window.location.search}`;
      return startAuth({ data: { profileId, redirectTo } });
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const desconectar = useMutation({
    mutationFn: () => disconnect({ data: { profileId } }),
    onSuccess: () => {
      toast.success("Conta TikTok desconectada.");
      void qc.invalidateQueries({ queryKey: ["tiktok-connection", profileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const renovar = useMutation({
    mutationFn: () => refreshToken({ data: { profileId } }),
    onSuccess: () => {
      toast.success("Autorização renovada.");
      void qc.invalidateQueries({ queryKey: ["tiktok-connection", profileId] });
    },
    onError: (e) => {
      toast.error(errMessage(e));
      void qc.invalidateQueries({ queryKey: ["tiktok-connection", profileId] });
    },
  });

  const status = conexao?.status ?? "disconnected";
  const conectado = status === "connected";
  const comErro = status === "error";
  const ocupado = conectar.isPending || desconectar.isPending || renovar.isPending;

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold">TikTok Shop</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte a conta de criador afiliado deste perfil para o Shop Studio agir em nome dela nos próximos recursos.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
            conectado ? "status-lime" : comErro ? "status-orange" : "status-neutral"
          }`}
        >
          {conectado ? "Conectada" : comErro ? "Com erro" : "Não conectada"}
        </span>
      </div>

      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Verificando a conexão...
        </p>
      ) : (
        <>
          {conectado && (
            <div className="mt-4 grid gap-2 rounded-lg bg-secondary px-4 py-3 text-xs">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                Conta de criador conectada
              </p>
              {conexao?.openId && <p className="text-muted-foreground">Identificador: {conexao.openId}</p>}
              {conexao?.grantedScopes?.length ? (
                <p className="text-muted-foreground">Permissões: {conexao.grantedScopes.join(", ")}</p>
              ) : null}
              <p className="text-muted-foreground">Autorização válida até {formatDate(conexao?.accessTokenExpiresAt ?? null)}</p>
            </div>
          )}

          {comErro && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary px-4 py-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{conexao?.lastError || "A última tentativa de autorização falhou."}</span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            {!conectado && (
              <Button onClick={() => conectar.mutate()} disabled={!canEdit || ocupado}>
                {conectar.isPending ? <Loader2 className="animate-spin" /> : <TikTokIcon className="size-4" />}
                {comErro ? "Reconectar conta TikTok" : "Conectar conta TikTok"}
              </Button>
            )}
            {conectado && (
              <>
                <Button variant="secondary" onClick={() => renovar.mutate()} disabled={!canEdit || ocupado}>
                  {renovar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Renovar autorização
                </Button>
                <Button variant="ghost" onClick={() => desconectar.mutate()} disabled={!canEdit || ocupado}>
                  {desconectar.isPending ? <Loader2 className="animate-spin" /> : <Unlink />}
                  Desconectar
                </Button>
              </>
            )}
          </div>

          {!canEdit && (
            <p className="mt-3 text-xs text-muted-foreground">Você não tem permissão para alterar a conexão deste perfil.</p>
          )}
        </>
      )}
    </div>
  );
}
