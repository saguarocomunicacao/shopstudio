import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Pin, Plus, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import { PageHeader } from "./page-header";
import { useStudio } from "./studio-context";
import { CurvaViews, GraficoMetricas } from "./metricas-graficos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adicionarReferenciaFn, analisarVideosRef, atualizarReferencia, avancarReferencia, gerarInsightsRef, getReferencia, listarReferencias, opcoesReferencia, removerReferenciaFn } from "@/lib/referencias.functions";
import { mediasReferencia } from "@/lib/referencias-calc";
import { diaMenos, hojeBr, resumirMetricas, type PerfilSnap, type VideoSnap } from "@/lib/metricas-calc";
import type { VideoRef } from "@/lib/referencias-dados";
import { brl } from "@/lib/custo";
import { actionError } from "@/lib/api-keys";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const USD_BRL = 5.4;
/** Estimativas exibidas antes de rodar (o custo real é registrado depois). */
const estColetaUsd = (qtd: number) => 0.005 + qtd * 0.0004;
const estAnaliseUsd = (dur: number | null) => 0.01 + ((dur ?? 30) * 300 * 0.75 + 2500 * 3.75) / 1_000_000;
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (≈ ${brl(v * USD_BRL)})`;

const STATUS_COLETA: Record<string, [string, string]> = {
  nunca: ["Aguardando", "status-violet"], coletando: ["Coletando", "status-blue"], processando: ["Coletando", "status-blue"], ok: ["Em dia", "status-lime"], erro: ["Erro", "status-pink"],
};
const Badge = ({ s }: { s: string }) => {
  const [t, c] = STATUS_COLETA[s] ?? ["—", "status-violet"];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{(s === "coletando" || s === "processando") && <Loader2 className="size-3 animate-spin" />}{t}</span>;
};

export function ReferenciasPage() {
  const [aberta, setAberta] = useState<string | null>(null);
  const { activeProfileId } = useStudio();
  useEffect(() => setAberta(null), [activeProfileId]);
  return aberta ? <DetalheReferencia refId={aberta} voltar={() => setAberta(null)} /> : <ListaReferencias abrir={setAberta} />;
}

function ListaReferencias({ abrir }: { abrir: (id: string) => void }) {
  const { activeProfileId, isBackoffice, can } = useStudio();
  const qc = useQueryClient();
  const listar = useServerFn(listarReferencias);
  const atualizar = useServerFn(atualizarReferencia);
  const remover = useServerFn(removerReferenciaFn);
  const [novo, setNovo] = useState(false);
  const [apagar, setApagar] = useState<{ id: string; handle: string } | null>(null);
  const podeCusto = isBackoffice || can("custos", "visualizar", activeProfileId);
  const podeEditar = isBackoffice || can("pipeline", "editar", activeProfileId) || can("pipeline", "criar", activeProfileId);
  const q = useQuery({ queryKey: ["referencias", activeProfileId], queryFn: () => listar({ data: { profileId: activeProfileId! } }), enabled: !!activeProfileId });
  const itens = q.data?.itens ?? [];
  const coletando = itens.some((i) => i.status === "coletando" || i.status === "processando");
  useEffect(() => {
    if (!coletando) return;
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: ["referencias", activeProfileId] }), 20_000);
    return () => clearInterval(t);
  }, [coletando, activeProfileId, qc]);
  const inval = () => void qc.invalidateQueries({ queryKey: ["referencias", activeProfileId] });
  const mutAtualizar = useMutation({
    mutationFn: (id: string) => atualizar({ data: { refId: id } }),
    onSuccess: () => { toast.success("Coleta iniciada. Os números chegam em alguns minutos."); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível atualizar agora.")),
  });
  const mutRemover = useMutation({
    mutationFn: (id: string) => remover({ data: { refId: id } }),
    onSuccess: () => { toast.success("Perfil removido. As análises feitas continuam em Analisar vídeo."); setApagar(null); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível remover.")),
  });

  if (q.data?.semPermissao) return <Vazio>Perfis de referência não estão disponíveis para o seu usuário neste perfil.</Vazio>;
  return (
    <>
      <PageHeader
        title="Perfis de referência"
        description={`${itens.length} ${itens.length === 1 ? "perfil acompanhado" : "perfis acompanhados"}`}
        actions={podeEditar ? <Button onClick={() => setNovo(true)}><Plus />Adicionar @</Button> : undefined}
      />
      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
      ) : !itens.length ? (
        <Vazio>Nenhum @ acompanhado ainda. Adicione um perfil do TikTok (seu ou de referência) para comparar vídeos e descobrir o que funciona.</Vazio>
      ) : (
        <div className="panel overflow-x-auto p-0">
          <Table>
            <TableHeader className="bg-secondary/60">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3 text-xs font-semibold">Perfil</TableHead>
                <TableHead className="px-3 text-right text-xs font-semibold">Seguidores</TableHead>
                <TableHead className="px-3 text-right text-xs font-semibold">Vídeos</TableHead>
                <TableHead className="px-3 text-right text-xs font-semibold">Analisados</TableHead>
                <TableHead className="px-3 text-xs font-semibold">Última coleta</TableHead>
                <TableHead className="px-3 text-xs font-semibold">Status</TableHead>
                {podeCusto && <TableHead className="px-3 text-right text-xs font-semibold">Custo</TableHead>}
                <TableHead className="px-3 text-right text-xs font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => abrir(i.id)}>
                  <TableCell className="px-3">
                    <div className="flex items-center gap-3">
                      <Foto url={i.fotoUrl} handle={i.handle} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">@{i.handle}</p>
                        <p className="truncate text-xs text-muted-foreground">{i.meuPerfil ? "Meu perfil" : i.nome ?? ""}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 text-right text-sm tabular-nums">
                    {fmt(i.seguidores)}
                    {i.variacao != null && <span className={`ml-1 text-xs ${i.variacao >= 0 ? "text-success-ink" : "text-primary"}`}>{i.variacao >= 0 ? "+" : ""}{fmt(i.variacao)}</span>}
                  </TableCell>
                  <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(i.videos)}</TableCell>
                  <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(i.analisados)}</TableCell>
                  <TableCell className="px-3 text-sm">{quando(i.ultimaColeta)}</TableCell>
                  <TableCell className="px-3"><span title={i.erro ?? undefined}><Badge s={i.status} /></span></TableCell>
                  {podeCusto && <TableCell className="px-3 text-right text-sm tabular-nums">{brl(i.custoCents / 100)}</TableCell>}
                  <TableCell className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => abrir(i.id)}>Abrir</Button>
                      {podeEditar && <Button size="icon" variant="ghost" aria-label="Atualizar" disabled={mutAtualizar.isPending || i.status === "coletando"} onClick={() => mutAtualizar.mutate(i.id)}><RefreshCw className="size-4" /></Button>}
                      {podeEditar && <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setApagar({ id: i.id, handle: i.handle })}><Trash2 className="size-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <NovoDialog open={novo} onOpenChange={setNovo} onCriado={(id) => { inval(); abrir(id); }} />
      <AlertDialog open={!!apagar} onOpenChange={(o) => !o && setApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover @{apagar?.handle}?</AlertDialogTitle>
            <AlertDialogDescription>Apaga os vídeos coletados, números e capas deste @. As análises de vídeo já feitas continuam na tela Analisar vídeo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (apagar) mutRemover.mutate(apagar.id); }} disabled={mutRemover.isPending}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NovoDialog({ open, onOpenChange, onCriado }: { open: boolean; onOpenChange: (o: boolean) => void; onCriado: (id: string) => void }) {
  const { activeProfileId } = useStudio();
  const adicionar = useServerFn(adicionarReferenciaFn);
  const [handle, setHandle] = useState("");
  const [qtd, setQtd] = useState<20 | 50 | 100>(50);
  const [acompanhar, setAcompanhar] = useState(true);
  const mut = useMutation({
    mutationFn: () => adicionar({ data: { profileId: activeProfileId!, handle, qtd, acompanhar } }),
    onSuccess: (r) => {
      toast.success(r.meuPerfil ? "É um perfil seu: os números vêm da coleta de Métricas." : "Coleta iniciada. Os vídeos chegam em alguns minutos.");
      onOpenChange(false); setHandle(""); onCriado(r.id);
    },
    onError: (e) => toast.error(actionError(e, "Não foi possível adicionar o @.")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar @</DialogTitle>
          <DialogDescription>Perfil do TikTok (seu ou de referência) para comparar com o perfil atual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ref-handle">@ ou link do perfil</Label>
            <Input id="ref-handle" placeholder="@perfil ou https://www.tiktok.com/@perfil" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade de vídeos</Label>
            <div className="grid grid-cols-3 gap-2">
              {([20, 50, 100] as const).map((n) => <Button key={n} type="button" variant={qtd === n ? "default" : "secondary"} onClick={() => setQtd(n)}>{n}</Button>)}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Acompanhar diariamente <span className="block text-xs text-muted-foreground">Coleta todo dia às 06:00, junto com Métricas.</span></span>
            <Switch checked={acompanhar} onCheckedChange={setAcompanhar} />
          </label>
          <div className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Custo estimado da coleta</p>
            <p>Cerca de {usd(estColetaUsd(qtd))} por coleta. O valor real é registrado em Custos. Se for um perfil seu, não há coleta extra.</p>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!handle.trim() || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending && <Loader2 className="animate-spin" />}Adicionar e coletar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalheReferencia({ refId, voltar }: { refId: string; voltar: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getReferencia);
  const avancar = useServerFn(avancarReferencia);
  const atualizar = useServerFn(atualizarReferencia);
  const opcoes = useServerFn(opcoesReferencia);
  const analisar = useServerFn(analisarVideosRef);
  const q = useQuery({ queryKey: ["referencia", refId], queryFn: () => load({ data: { refId } }) });
  const d = q.data;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<VideoRef[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const inval = () => { void qc.invalidateQueries({ queryKey: ["referencia", refId] }); void qc.invalidateQueries({ queryKey: ["referencias"] }); };

  const emAndamento = !!d && (d.coleta?.status === "coletando" || d.coleta?.status === "processando" || d.analises.some((a) => ["na_fila", "baixando", "analisando", "enviando"].includes(a.status)));
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(async () => { await avancar({ data: { refId } }).catch(() => null); inval(); }, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emAndamento, refId]);

  const mutAtualizar = useMutation({
    mutationFn: () => atualizar({ data: { refId } }),
    onSuccess: () => { toast.success("Coleta iniciada."); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível atualizar agora.")),
  });
  const mutOpcoes = useMutation({
    mutationFn: (v: { acompanhar?: boolean; fonteRoteirista?: boolean }) => opcoes({ data: { refId, ...v } }),
    onSuccess: inval,
    onError: (e) => toast.error(actionError(e, "Não foi possível salvar.")),
  });
  const mutAnalisar = useMutation({
    mutationFn: (ids: string[]) => analisar({ data: { refId, videoIds: ids } }),
    onSuccess: (r) => { toast.success(`${r.criadas} ${r.criadas === 1 ? "análise criada" : "análises criadas"}. Até 5 rodam ao mesmo tempo.`); setSel(new Set()); setConfirmar(null); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível criar as análises.")),
  });

  const perfil = (d?.perfil ?? []) as PerfilSnap[];
  const snaps = (d?.snaps ?? []) as VideoSnap[];
  const videos = (d?.videos ?? []) as (VideoRef & { capaUrl: string | null })[];
  const m = useMemo(() => mediasReferencia(videos, snaps), [videos, snaps]);
  const resumo = useMemo(() => resumirMetricas({ perfil, videos: snaps, jobs: [], dias: 30, publicadoPorVideo: new Map(videos.map((v) => [v.tiktok_video_id, v.publicado_em] as const)) }), [perfil, snaps, videos]);
  const analisePorVideo = new Map((d?.analises ?? []).filter((a) => a.video_id).map((a) => [a.video_id!, a] as const));
  const analisadas = (d?.analises ?? []).filter((a) => a.status === "pronto").length;

  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>;
  if (!d) return <Vazio>Não foi possível abrir este perfil. <button className="font-semibold text-primary underline" onClick={voltar}>Voltar</button></Vazio>;
  const ref = d.ref as Record<string, never> & { handle: string; nome: string | null; fotoUrl: string | null; meu_perfil_id: string | null; acompanhar: boolean; fonte_roteirista: boolean; insights: string | null; insights_em: string | null };
  const ult = perfil[perfil.length - 1];
  const livres = (ids: string[]) => videos.filter((v) => ids.includes(v.tiktok_video_id) && !(analisePorVideo.get(v.tiktok_video_id) && analisePorVideo.get(v.tiktok_video_id)!.status !== "erro"));
  const top10 = [...m.linhas].filter((l) => !l.semDados).sort((a, b) => b.views - a.views).slice(0, 10).map((l) => l.tiktok_video_id);
  const cards = [
    { label: "Views por vídeo", valor: fmt(m.viewsMedia) },
    { label: "Engajamento médio", valor: pct(m.engMedio) },
    { label: "Posts por semana", valor: m.porSemana == null ? "—" : m.porSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) },
    { label: "Duração média", valor: m.duracaoMedia == null ? "—" : `${Math.round(m.duracaoMedia)} s` },
  ];
  const coletaStatus = d.coleta?.status ?? "nunca";

  return (
    <>
      <button type="button" onClick={voltar} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Perfis de referência</button>
      <div className="panel mb-6 flex flex-wrap items-center gap-4 p-5">
        <Foto url={ref.fotoUrl} handle={ref.handle} grande />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold">@{ref.handle} {ref.meu_perfil_id && <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 align-middle text-xs font-medium">Meu perfil</span>}</p>
          <p className="text-sm text-muted-foreground">{fmt(ult?.seguidores)} seguidores · {fmt(ult?.curtidas_total)} curtidas · {fmt(ult?.videos_total)} vídeos</p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge s={coletaStatus} /> Última coleta: {quando(d.coleta?.ultima_coleta_em)}</p>
        </div>
        {d.podeEditar && (
          <div className="grid gap-2 text-sm">
            <label className="flex items-center justify-between gap-3">Acompanhar diariamente<Switch checked={ref.acompanhar} disabled={!!ref.meu_perfil_id} onCheckedChange={(v) => mutOpcoes.mutate({ acompanhar: v })} /></label>
            <label className="flex items-center justify-between gap-3">Usar como referência do roteirista<Switch checked={ref.fonte_roteirista} onCheckedChange={(v) => mutOpcoes.mutate({ fonteRoteirista: v })} /></label>
            <Button variant="secondary" size="sm" disabled={mutAtualizar.isPending || coletaStatus === "coletando"} onClick={() => mutAtualizar.mutate()}>
              {mutAtualizar.isPending || coletaStatus === "coletando" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Atualizar
            </Button>
          </div>
        )}
      </div>
      {coletaStatus === "erro" && d.coleta?.ultimo_erro && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-ink"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{d.coleta.ultimo_erro}</span></div>
      )}

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos">Vídeos</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="videos" className="mt-4">
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="panel p-5">
                <p className="text-[13px] text-muted-foreground">{c.label}</p>
                <p className="mt-1 font-display text-[36px] font-semibold leading-tight">{c.valor}</p>
              </div>
            ))}
          </div>
          {d.podeEditar && videos.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button disabled={!sel.size} onClick={() => { const l = livres([...sel]); if (!l.length) toast.error("Esses vídeos já foram analisados ou estão na fila."); else setConfirmar(l); }}><Sparkles />Analisar selecionados{sel.size ? ` (${sel.size})` : ""}</Button>
              <Button variant="secondary" disabled={!top10.length} onClick={() => { const l = livres(top10); if (!l.length) toast.error("Os 10 mais vistos já foram analisados."); else setConfirmar(l); }}>Analisar os 10 mais vistos</Button>
            </div>
          )}
          {!videos.length ? (
            <Vazio>{coletaStatus === "coletando" ? "Coletando os vídeos no TikTok..." : "Nenhum vídeo coletado ainda."}</Vazio>
          ) : (
            <div className="panel overflow-x-auto p-0">
              <Table>
                <TableHeader className="bg-secondary/60">
                  <TableRow className="hover:bg-transparent">
                    {d.podeEditar && <TableHead className="w-8 px-3"><Checkbox aria-label="Selecionar todos" checked={sel.size > 0 && sel.size === videos.length} onCheckedChange={(v) => setSel(v ? new Set(videos.map((x) => x.tiktok_video_id)) : new Set())} /></TableHead>}
                    <TableHead className="px-3 text-xs font-semibold">Vídeo</TableHead>
                    <TableHead className="px-3 text-xs font-semibold">Data</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Duração</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Views</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Likes</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Coment.</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Shares</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Salvos</TableHead>
                    <TableHead className="px-3 text-right text-xs font-semibold">Engaj.</TableHead>
                    <TableHead className="px-3 text-xs font-semibold">Análise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.linhas.map((l) => {
                    const v = videos.find((x) => x.tiktok_video_id === l.tiktok_video_id);
                    const a = analisePorVideo.get(l.tiktok_video_id);
                    return (
                      <TableRow key={l.tiktok_video_id}>
                        {d.podeEditar && <TableCell className="px-3"><Checkbox aria-label="Selecionar" checked={sel.has(l.tiktok_video_id)} onCheckedChange={(c) => setSel((s) => { const n = new Set(s); if (c) n.add(l.tiktok_video_id); else n.delete(l.tiktok_video_id); return n; })} /></TableCell>}
                        <TableCell className="px-3">
                          <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
                            <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">{v?.capaUrl && <img src={v.capaUrl} alt="" className="size-full object-cover" />}</div>
                            <span className="line-clamp-2 max-w-64 text-sm">{v?.fixado && <Pin aria-label="Fixado no perfil" className="mr-1 inline size-3.5 -translate-y-px text-primary" />}{l.legenda || "Sem legenda"}</span>
                          </a>
                        </TableCell>
                        <TableCell className="px-3 text-sm">{l.publicado_em ? new Date(l.publicado_em).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.duracao ? `${Math.round(l.duracao)} s` : "—"}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.semDados ? "—" : fmt(l.views)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.semDados ? "—" : fmt(l.likes)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.semDados ? "—" : fmt(l.comentarios)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.semDados ? "—" : fmt(l.compartilhamentos)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{l.semDados ? "—" : fmt(l.salvos)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{pct(l.engajamentoPct)}</TableCell>
                        <TableCell className="px-3 text-sm"><StatusAnalise a={a} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="evolucao" className="mt-4">
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <GraficoMetricas titulo="Seguidores por dia (30 dias)" dados={resumo.serie} campo="seguidores" cor="var(--cyan-ink)" />
            <GraficoMetricas titulo="Views por dia (30 dias)" dados={resumo.serie} campo="views" cor="var(--primary)" />
          </div>
          <div className="panel p-0">
            <p className="p-4 text-sm font-semibold">Curva de 14 dias por vídeo</p>
            <div className="border-t">
              {m.linhas.filter((l) => !l.semDados).slice(0, 50).map((l) => {
                const exp = aberto === l.tiktok_video_id;
                const lim = diaMenos(hojeBr(), 13);
                const curva = snaps.filter((s) => s.tiktok_video_id === l.tiktok_video_id && s.data >= lim).sort((a, b) => a.data.localeCompare(b.data)).map((s) => ({ dia: s.data, views: Number(s.views ?? 0) }));
                return (
                  <Fragment key={l.tiktok_video_id}>
                    <button type="button" className="flex w-full items-center gap-2 border-b px-4 py-2.5 text-left text-sm hover:bg-secondary/40" onClick={() => setAberto(exp ? null : l.tiktok_video_id)}>
                      {exp ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <span className="line-clamp-1 flex-1">{l.legenda || "Sem legenda"}</span>
                      <span className="tabular-nums text-muted-foreground">{fmt(l.views)} views</span>
                    </button>
                    {exp && <div className="h-40 border-b px-4 py-3"><CurvaViews curva={curva} /></div>}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <Insights refId={refId} texto={ref.insights} em={ref.insights_em} analisadas={analisadas} podeEditar={d.podeEditar} onOk={inval} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Analisar {confirmar?.length} {confirmar?.length === 1 ? "vídeo" : "vídeos"}?</DialogTitle>
            <DialogDescription>Cada vídeo consome 1 unidade de "Análise de vídeo" (ilimitada quando seu plano não cobra). Até 5 rodam ao mesmo tempo.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Custo estimado</p>
            <p>Download (Apify) + IA pela duração: cerca de {usd((confirmar ?? []).reduce((s, v) => s + estAnaliseUsd(v.duracao), 0))} no total. O valor real é registrado em Custos.</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button disabled={mutAnalisar.isPending} onClick={() => confirmar && mutAnalisar.mutate(confirmar.map((v) => v.tiktok_video_id))}>{mutAnalisar.isPending && <Loader2 className="animate-spin" />}Analisar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusAnalise({ a }: { a: { status: string } | undefined }) {
  if (!a) return <span className="text-xs text-muted-foreground">Não analisada</span>;
  if (a.status === "pronto") return <Link to="/app/analisar" className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline">Pronta <ExternalLink className="size-3" /></Link>;
  if (a.status === "erro") return <span className="text-xs text-primary">Erro</span>;
  if (a.status === "na_fila") return <span className="text-xs text-muted-foreground">Na fila</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Analisando</span>;
}

function Insights({ refId, texto, em, analisadas, podeEditar, onOk }: { refId: string; texto: string | null; em: string | null; analisadas: number; podeEditar: boolean; onOk: () => void }) {
  const gerar = useServerFn(gerarInsightsRef);
  const [copiado, setCopiado] = useState(false);
  const mut = useMutation({
    mutationFn: () => gerar({ data: { refId } }),
    onSuccess: () => { toast.success("Insights prontos."); onOk(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível gerar os insights.")),
  });
  if (analisadas < 5 && !texto) return <Vazio>Os insights ficam disponíveis com 5 ou mais vídeos analisados. Analisados até agora: {analisadas}.</Vazio>;
  return (
    <div className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{texto ? `Gerado em ${quando(em)} com ${analisadas} vídeos analisados` : `${analisadas} vídeos analisados`}</p>
        <div className="flex gap-2">
          {texto && <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}>{copiado ? <Check /> : <Copy />}{copiado ? "Copiado" : "Copiar"}</Button>}
          {podeEditar && <Button size="sm" disabled={mut.isPending || analisadas < 5} onClick={() => mut.mutate()}>{mut.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}{texto ? "Gerar de novo" : "Gerar insights"}</Button>}
        </div>
      </div>
      {texto ? <TextoMd texto={texto} /> : <p className="text-sm text-muted-foreground">Toque em "Gerar insights" para cruzar as análises com as métricas.</p>}
    </div>
  );
}

function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}
function TextoMd({ texto }: { texto: string }) {
  const out: ReactNode[] = [];
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!.trimEnd();
    if (/^\s*\|/.test(l)) {
      const bloco: string[] = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i]!)) bloco.push(linhas[i++]!.trim());
      i--;
      const rows = bloco.filter((r) => !/^\|[\s:|-]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      out.push(
        <div key={out.length} className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{head?.map((c, j) => <th key={j} className="border-b px-2 py-1.5 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody></table></div>,
      );
      continue;
    }
    if (!l.trim()) continue;
    const h = /^#{1,4}\s+(.*)/.exec(l);
    if (h) { out.push(<h3 key={out.length} className="mt-4 font-display text-base font-semibold first:mt-0">{inline(h[1]!)}</h3>); continue; }
    const li = /^\s*(?:[-*]|\d+[.)])\s+(.*)/.exec(l);
    if (li) { out.push(<p key={out.length} className="pl-4 text-sm before:-ml-3 before:mr-1.5 before:content-['•']">{inline(li[1]!)}</p>); continue; }
    out.push(<p key={out.length} className="text-sm">{inline(l)}</p>);
  }
  return <div className="space-y-1.5">{out}</div>;
}

function Foto({ url, handle, grande = false }: { url: string | null; handle: string; grande?: boolean }) {
  const s = grande ? "size-16 text-xl" : "size-9 text-sm";
  return url
    ? <img src={url} alt="" className={`${s} shrink-0 rounded-full object-cover`} />
    : <span className={`${s} grid shrink-0 place-items-center rounded-full bg-secondary font-semibold uppercase`}>{handle.slice(0, 1) || <Users className="size-4" />}</span>;
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
