import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { TikTokIcon } from "./tiktok-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ehLinkTiktok } from "@/lib/metricas-calc";
import { listarVideosNaoVinculados, salvarLinkTiktok, vincularVideoExterno } from "@/lib/metricas.functions";
import { userErrorMessage } from "@/lib/user-error";

const errMsg = (e: unknown) => userErrorMessage(e, "Não foi possível salvar o link.");

/** Aviso âmbar + campo inline para job publicado sem link do TikTok. */
export function TiktokLinkInline({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const salvar = useServerFn(salvarLinkTiktok);
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState("");
  const mut = useMutation({
    mutationFn: () => salvar({ data: { jobId, url: url.trim() } }),
    onSuccess: () => {
      toast.success("Link do TikTok salvo. As métricas aparecem na próxima coleta.");
      setAberto(false);
      setUrl("");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["metricas"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-2 grid gap-2">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setAberto((v) => !v)}
        className="status-orange inline-flex w-fit items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium disabled:cursor-default"
      >
        <AlertTriangle className="size-3" />
        Adicionar link do TikTok
      </button>
      {aberto && canEdit && (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@perfil/video/..." aria-label="Link do vídeo no TikTok" className="h-9" />
            <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !ehLinkTiktok(url)}>
              {mut.isPending ? <Loader2 className="animate-spin" /> : "Salvar"}
            </Button>
          </div>
          {url.trim() && !ehLinkTiktok(url) && <p className="text-xs text-destructive">Cole um link do tiktok.com.</p>}
        </div>
      )}
    </div>
  );
}

/** "Vincular vídeo externo": cria um item só para acompanhar métricas. */
export function VincularExternoDialog({ profileId, open, onOpenChange }: { profileId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const listar = useServerFn(listarVideosNaoVinculados);
  const vincular = useServerFn(vincularVideoExterno);
  const [url, setUrl] = useState("");
  const sug = useQuery({ queryKey: ["videos-nao-vinculados", profileId], queryFn: () => listar({ data: { profileId } }), enabled: open });
  const mut = useMutation({
    mutationFn: (u: string) => vincular({ data: { profileId, url: u } }),
    onSuccess: () => {
      toast.success("Vídeo vinculado. Ele aparece em Publicados e nas Métricas.");
      setUrl("");
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["metricas"] });
      void qc.invalidateQueries({ queryKey: ["videos-nao-vinculados", profileId] });
    },
    onError: (e) => toast.error(userErrorMessage(e, "Não foi possível vincular esse vídeo.")),
  });
  const videos = sug.data?.videos ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular vídeo externo</DialogTitle>
          <DialogDescription>Para acompanhar as métricas de um vídeo publicado fora do Shop Studio.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="ext-url">Link do vídeo no TikTok</Label>
          <Input id="ext-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@perfil/video/..." />
          {url.trim() && !ehLinkTiktok(url) && <p className="text-xs text-destructive">Cole um link do tiktok.com.</p>}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Vídeos do perfil ainda sem vínculo</p>
          {sug.isLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Carregando...</p>
          ) : videos.length ? (
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
              {videos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                    {v.capa && <img src={v.capa} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium">{v.legenda || "Sem legenda"}</p>
                    <p className="text-[11px] text-muted-foreground">{v.publicado_em ? new Date(v.publicado_em).toLocaleDateString("pt-BR") : ""}</p>
                  </div>
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Abrir no TikTok"><TikTokIcon className="size-4" /></a>
                  <Button size="sm" variant="secondary" disabled={mut.isPending} onClick={() => mut.mutate(v.url)}><Link2 />Vincular</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma sugestão ainda. Elas aparecem depois da coleta de métricas do perfil.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate(url.trim())} disabled={mut.isPending || !ehLinkTiktok(url)}>
            {mut.isPending && <Loader2 className="animate-spin" />}
            Vincular link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
