import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Eye, Link2, Loader2, Share2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createJobShare, listJobShares, setJobShareActive } from "@/lib/share.functions";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

const shareUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/v/${token}`;

/** Links públicos do vídeo: criar, copiar, revogar e ver aberturas. */
export function SharePanel({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listJobShares);
  const create = useServerFn(createJobShare);
  const setActive = useServerFn(setJobShareActive);
  const [dias, setDias] = useState<string>("nunca");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const shares = useQuery({ queryKey: ["job-shares", jobId], queryFn: () => list({ data: { jobId } }) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["job-shares", jobId] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { jobId, dias: dias === "nunca" ? null : Number(dias) } }),
    onSuccess: async (row) => {
      refresh();
      try {
        await navigator.clipboard.writeText(shareUrl(row.token));
        toast.success("Link público criado e copiado.");
      } catch {
        toast.success("Link público criado.");
      }
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { shareId: string; ativo: boolean }) => setActive({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.ativo ? "Link reativado." : "Link revogado.");
      refresh();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const copy = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedId(id);
      toast.success("Link copiado.");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const rows = shares.data ?? [];

  return (
    <section className="rounded-xl border p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Share2 className="size-4 text-primary" />
        Link público
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Quem receber o link assiste só este vídeo, sem entrar no sistema.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger aria-label="Validade do link">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nunca">Sem expiração</SelectItem>
            <SelectItem value="7">Expira em 7 dias</SelectItem>
            <SelectItem value="30">Expira em 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          {createMut.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
          Gerar link
        </Button>
      </div>

      {shares.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Carregando links...
        </p>
      ) : rows.length ? (
        <ul className="mt-3 grid gap-2">
          {rows.map((s) => {
            const expirado = !!s.expires_at && new Date(s.expires_at).getTime() < Date.now();
            const valido = s.ativo && !expirado;
            return (
              <li key={s.id} className="rounded-lg border p-3">
                <p className={`break-all text-xs font-semibold ${valido ? "" : "text-muted-foreground line-through"}`}>
                  {shareUrl(s.token)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3" />
                    {s.views} {s.views === 1 ? "abertura" : "aberturas"}
                  </span>
                  <span>
                    {expirado
                      ? "expirado"
                      : s.expires_at
                        ? `expira em ${new Date(s.expires_at).toLocaleDateString("pt-BR")}`
                        : "sem expiração"}
                  </span>
                  {!s.ativo && <span className="font-bold text-primary">revogado</span>}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" size="sm" onClick={() => copy(s.id, s.token)} disabled={!valido}>
                    {copiedId === s.id ? <Check /> : <Copy />}
                    Copiar link
                  </Button>
                  <Button
                    variant={s.ativo ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => revokeMut.mutate({ shareId: s.id, ativo: !s.ativo })}
                    disabled={revokeMut.isPending}
                  >
                    <Undo2 />
                    {s.ativo ? "Revogar" : "Reativar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
