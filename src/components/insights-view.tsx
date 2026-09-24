import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImageLightbox } from "./image-lightbox";
import { PADRAO_CHAVES, PADRAO_LABEL, type InsightsV2 } from "@/lib/insights-schema";
import { mediasReferencia } from "@/lib/referencias-calc";
import type { VideoRef } from "@/lib/referencias-dados";
import type { VideoSnap } from "@/lib/metricas-calc";
import { enviarRecomendacoesRef } from "@/lib/referencias.functions";
import { actionError } from "@/lib/api-keys";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const titulo = (l: { legenda: string | null }) => (l.legenda ?? "").trim() || "Vídeo sem legenda";

type Props = {
  refId: string; handle: string; v: InsightsV2;
  analises: { id: string; status: string; video_id: string | null }[];
  videos: (VideoRef & { capaUrl: string | null })[]; snaps: VideoSnap[]; podeEditar: boolean;
};

export function InsightsV2View({ refId, handle, v, analises, videos, snaps, podeEditar }: Props) {
  const enviar = useServerFn(enviarRecomendacoesRef);
  const [confirmar, setConfirmar] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const m = useMemo(() => mediasReferencia(videos, snaps), [videos, snaps]);
  const linhaPor = new Map(m.linhas.map((l) => [l.tiktok_video_id, l]));
  const capaPor = new Map(videos.map((x) => [x.tiktok_video_id, x.capaUrl]));
  const analisePor = new Map(analises.filter((a) => a.status === "pronto" && a.video_id).map((a) => [a.video_id!, a.id]));
  const considerados = m.linhas.filter((l) => analisePor.has(l.tiktok_video_id)).sort((a, b) => b.views - a.views);
  const melhores = considerados.slice(0, 5);
  const piores = considerados.length > 5 ? considerados.slice(-5).reverse() : [];
  const ganchos = v.ganchos.map((g) => ({ ...g, linha: linhaPor.get(g.video_id) })).filter((g) => g.linha);
  const itensLightbox = ganchos.filter((g) => capaPor.get(g.video_id)).map((g) => ({ id: g.video_id, src: capaPor.get(g.video_id)!, title: titulo(g.linha!) }));

  const mut = useMutation({
    mutationFn: () => enviar({ data: { refId } }),
    onSuccess: () => { toast.success("Recomendações salvas na Identidade do perfil. O roteirista passa a usar."); setConfirmar(false); },
    onError: (e) => toast.error(actionError(e, "Não foi possível enviar ao roteirista.")),
  });

  const padroes = PADRAO_CHAVES.map((k) => v.padroes.find((p) => p.chave === k)).filter(Boolean) as InsightsV2["padroes"];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-background p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo em 3 frases</p>
        <div className="space-y-2 font-display text-[18px] leading-snug">{v.resumo.map((f, i) => <p key={i}>{f}</p>)}</div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-base font-semibold">Padrões</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {padroes.map((p) => (
            <div key={p.chave} className="panel flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{PADRAO_LABEL[p.chave]}</p>
                {p.posicao !== "neutro" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.posicao === "acima" ? "status-lime" : "status-pink"}`}>{p.posicao === "acima" ? "acima da mediana" : "abaixo da mediana"}</span>}
              </div>
              <p className="text-sm text-muted-foreground">{p.achado}</p>
            </div>
          ))}
        </div>
      </section>

      {ganchos.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base font-semibold">Ganchos que mais funcionaram</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {ganchos.map((g) => {
              const l = g.linha!;
              const capa = capaPor.get(g.video_id);
              const aid = analisePor.get(g.video_id);
              return (
                <div key={g.video_id} className="panel flex gap-3 p-3">
                  <button type="button" className="h-[100px] w-14 shrink-0 overflow-hidden rounded-md bg-muted" aria-label="Ver capa" disabled={!capa} onClick={() => setLightbox(itensLightbox.findIndex((i) => i.id === g.video_id))}>
                    {capa && <img src={capa} alt="" className="size-full object-cover" />}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm font-semibold">{titulo(l)}</p>
                    <p className="text-xs text-muted-foreground">{fmt(l.views)} views · {pct(l.engajamentoPct)} engajamento</p>
                    <p className="text-sm italic">“{g.gancho}”</p>
                    {g.por_que && <p className="text-xs text-muted-foreground">{g.por_que}</p>}
                    {aid && <Link to="/app/analises/$id" params={{ id: aid }} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-ink underline">Ver análise <ExternalLink className="size-3" /></Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Recomendações para o meu perfil</h3>
          {podeEditar && <Button size="sm" variant="secondary" onClick={() => setConfirmar(true)}><Send />Enviar para o roteirista</Button>}
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {v.recomendacoes.map((r, i) => <li key={i}><strong>{r.titulo}.</strong> {r.explicacao}</li>)}
        </ol>
      </section>

      {v.comparativo.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base font-semibold">5 melhores vs 5 piores</h3>
          <div className="panel overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 text-xs font-semibold">Aspecto</TableHead>
                  <TableHead className="bg-success-soft px-3 text-xs font-semibold text-cyan-ink"><CabecalhoColuna titulo="5 melhores" itens={melhores.map((l) => capaPor.get(l.tiktok_video_id) ?? null)} /></TableHead>
                  <TableHead className="bg-danger-soft px-3 text-xs font-semibold text-primary"><CabecalhoColuna titulo="5 piores" itens={piores.map((l) => capaPor.get(l.tiktok_video_id) ?? null)} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.comparativo.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-3 text-sm font-medium">{c.aspecto}</TableCell>
                    <TableCell className="bg-success-soft/50 px-3 text-sm">{c.melhores}</TableCell>
                    <TableCell className="bg-danger-soft/50 px-3 text-sm">{c.piores}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="panel p-0">
        <p className="p-4 text-sm font-semibold">Vídeos considerados ({considerados.length})</p>
        <div className="border-t">
          {considerados.map((l) => {
            const aid = analisePor.get(l.tiktok_video_id);
            return (
              <div key={l.tiktok_video_id} className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-0">
                <span className="line-clamp-1 flex-1">{titulo(l)}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(l.views)} views</span>
                {aid && <Link to="/app/analises/$id" params={{ id: aid }} className="text-xs font-semibold text-cyan-ink underline">Ver análise</Link>}
              </div>
            );
          })}
        </div>
      </section>

      <ImageLightbox items={itensLightbox} index={lightbox} onIndexChange={setLightbox} />

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar recomendações para o roteirista?</AlertDialogTitle>
            <AlertDialogDescription>As {v.recomendacoes.length} recomendações de @{handle} entram nas observações de estilo do perfil (aba Identidade). Se já tiver enviado antes deste @, o bloco antigo é substituído.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); mut.mutate(); }} disabled={mut.isPending}>{mut.isPending && <Loader2 className="animate-spin" />}Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CabecalhoColuna({ titulo: t, itens }: { titulo: string; itens: (string | null)[] }) {
  return (
    <div className="space-y-1.5 py-2">
      <p>{t}</p>
      <div className="flex gap-1">{itens.map((src, i) => <span key={i} className="h-10 w-[22px] overflow-hidden rounded bg-muted">{src && <img src={src} alt="" className="size-full object-cover" />}</span>)}</div>
    </div>
  );
}
