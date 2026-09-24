import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Hash, Image as ImageIcon, Loader2, Megaphone, RefreshCw, Search, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "./page-header";
import { useStudio } from "./studio-context";
import { StatusAnaliseBadge } from "./status-analise";
import { InsightsV2View } from "./insights-view";
import { AddReferenciaButton } from "./add-referencia-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { analisarVideosPesquisa, avancarPesquisa, criarPesquisa, enviarRecomendacoesPesquisaFn, gerarInsightsPesquisa, getPesquisa, listarPesquisas, removerPesquisaFn } from "@/lib/pesquisa.functions";
import { engajamentoVideo, resumoPesquisa, type VideoPesquisa } from "@/lib/pesquisa-calc";
import { lerInsights } from "@/lib/insights-schema";
import type { VideoSnap } from "@/lib/metricas-calc";
import { brl } from "@/lib/custo";
import { actionError } from "@/lib/api-keys";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const USD_BRL = 5.4;
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (≈ ${brl(v * USD_BRL)})`;
const estPesquisaUsd = (qtd: number) => qtd * 0.005; // medido: 30 vídeos com região Brasil ≈ US$ 0,15
const estAnaliseUsd = (dur: number | null) => 0.01 + ((dur ?? 30) * 300 * 0.75 + 2500 * 3.75) / 1_000_000;
const rotulo = (tipo: string, termo: string) => (tipo === "hashtag" ? `#${termo}` : `"${termo}"`);

const NOME_IDIOMA: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês", it: "Italiano", de: "Alemão", ja: "Japonês", ko: "Coreano", zh: "Chinês", ar: "Árabe", id: "Indonésio", ru: "Russo", tr: "Turco", vi: "Vietnamita", th: "Tailandês" };
type VideoTela = VideoPesquisa & { capaUrl: string | null };

export function PesquisaPage({ pesquisaId, tab, termoInicial }: { pesquisaId?: string; tab?: "videos" | "insights" | undefined; termoInicial?: string | undefined }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { activeProfileId } = useStudio();
  const [perfilInicial] = useState(activeProfileId);
  useEffect(() => {
    if (pesquisaId && perfilInicial && activeProfileId && activeProfileId !== perfilInicial) void navigate({ to: "/app/pesquisa" });
  }, [activeProfileId, perfilInicial, pesquisaId, navigate]);
  const abrir = (id: string) => void navigate({ to: "/app/pesquisa/$id", params: { id } });
  const voltar = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/app/pesquisa" });
  };
  return pesquisaId
    ? <Detalhe id={pesquisaId} tab={tab ?? "videos"} onTab={(t) => void navigate({ to: "/app/pesquisa/$id", params: { id: pesquisaId }, search: { tab: t }, replace: true })} voltar={voltar} />
    : <Lista abrir={abrir} termoInicial={termoInicial} />;
}

function Lista({ abrir, termoInicial }: { abrir: (id: string) => void; termoInicial?: string | undefined }) {
  const { activeProfileId, isBackoffice, can } = useStudio();
  const qc = useQueryClient();
  const listar = useServerFn(listarPesquisas);
  const criar = useServerFn(criarPesquisa);
  const remover = useServerFn(removerPesquisaFn);
  const [tipo, setTipo] = useState<"hashtag" | "palavra">(termoInicial ? "palavra" : "hashtag");
  const [termo, setTermo] = useState(termoInicial ?? "");
  const [qtd, setQtd] = useState<10 | 30 | 50>(30);
  const podeCusto = isBackoffice || can("custos", "visualizar", activeProfileId);
  const podeEditar = isBackoffice || can("pipeline", "editar", activeProfileId) || can("pipeline", "criar", activeProfileId);
  const q = useQuery({ queryKey: ["pesquisas", activeProfileId], queryFn: () => listar({ data: { profileId: activeProfileId! } }), enabled: !!activeProfileId });
  const itens = q.data?.itens ?? [];
  const inval = () => void qc.invalidateQueries({ queryKey: ["pesquisas", activeProfileId] });
  const termoLimpo = termo.trim().replace(/^#+/, "").toLowerCase();
  const sugestoesDoTermo = (itens.find((i) => i.termo.toLowerCase() === termoLimpo && (i.sugestoes ?? []).length)?.sugestoes ?? []) as string[];
  const mut = useMutation({
    mutationFn: (v: { tipo: "hashtag" | "palavra"; termo: string; qtd: 10 | 30 | 50 }) => criar({ data: { profileId: activeProfileId!, ...v } }),
    onSuccess: (r) => { toast.success("Pesquisa iniciada. Os vídeos chegam em 1 a 2 minutos."); inval(); abrir(r.id); },
    onError: (e) => toast.error(actionError(e, "Não foi possível pesquisar agora.")),
  });
  const mutRemover = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => { toast.success("Pesquisa removida. As análises feitas continuam em Analisar vídeo."); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível remover.")),
  });
  if (q.data?.semPermissao) return <Vazio>Pesquisar não está disponível para o seu usuário neste perfil.</Vazio>;
  return (
    <>
      <PageHeader title="Pesquisar no TikTok" description="Veja o que está sendo postado agora sobre um tema antes de gravar." />
      {podeEditar && (
        <form className="panel mb-6 space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (termo.trim().length >= 2) mut.mutate({ tipo, termo, qtd }); }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md bg-secondary p-1">
              {(["hashtag", "palavra"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded px-3 py-1.5 text-sm font-medium ${tipo === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{t === "hashtag" ? "Hashtag" : "Palavra"}</button>
              ))}
            </div>
            <div className="relative min-w-60 flex-1">
              {tipo === "hashtag" ? <Hash className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /> : <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}
              <Input className="pl-9" placeholder={tipo === "hashtag" ? "skincare" : "fronha de cetim"} value={termo} onChange={(e) => setTermo(e.target.value)} />
            </div>
            <div className="inline-flex gap-1">
              {([10, 30, 50] as const).map((n) => <Button key={n} type="button" size="sm" variant={qtd === n ? "default" : "secondary"} onClick={() => setQtd(n)}>{n}</Button>)}
            </div>
            <Button type="submit" disabled={termo.trim().length < 2 || mut.isPending}>{mut.isPending ? <Loader2 className="animate-spin" /> : <Search />}Pesquisar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Custo estimado: cerca de {usd(estPesquisaUsd(qtd))}. Busca feita como se estivesse no Brasil. O valor real fica em Custos. {tipo === "palavra" && "A busca por palavra traz os mais relevantes, não só os recentes, e pode trazer vídeos de outros países."}</p>
          {sugestoesDoTermo.length > 0 && (
            <p className="text-xs text-muted-foreground">Esse termo parece estar em outro idioma. Tente {sugestoesDoTermo.map((sg, k) => (
              <span key={sg}>{k > 0 && ", "}<button type="button" className="font-semibold text-primary underline" onClick={() => setTermo(sg)}>{tipo === "hashtag" ? "#" : ""}{sg}</button></span>
            ))}.</p>
          )}
        </form>
      )}
      <h2 className="mb-3 font-display text-base font-semibold">Pesquisas anteriores</h2>
      {q.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
        : !itens.length ? <Vazio>Nenhuma pesquisa ainda. As pesquisas ficam guardadas por 90 dias.</Vazio>
        : (
          <div className="panel overflow-x-auto p-0">
            <Table>
              <TableHeader className="bg-secondary/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 text-xs font-semibold">Termo</TableHead>
                  <TableHead className="px-3 text-xs font-semibold">Data</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Vídeos</TableHead>
                  {podeCusto && <TableHead className="px-3 text-right text-xs font-semibold">Custo</TableHead>}
                  <TableHead className="px-3 text-right text-xs font-semibold">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => abrir(i.id)}>
                    <TableCell className="px-3 text-sm font-medium">
                      {rotulo(i.tipo, i.termo)}
                      {(i.status === "coletando" || i.status === "processando") && <span className="ml-2 inline-flex items-center gap-1 rounded-full status-blue px-2 py-0.5 text-xs"><Loader2 className="size-3 animate-spin" />Coletando</span>}
                      {i.status === "erro" && <span title={i.erro ?? undefined} className="ml-2 rounded-full status-pink px-2 py-0.5 text-xs">Erro</span>}
                    </TableCell>
                    <TableCell className="px-3 text-sm">{quando(i.created_at)}</TableCell>
                    <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(i.n_videos)}</TableCell>
                    {podeCusto && <TableCell className="px-3 text-right text-sm tabular-nums">{Number(i.custo_usd) ? usd(Number(i.custo_usd)) : "—"}</TableCell>}
                    <TableCell className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => abrir(i.id)}>Abrir</Button>
                        {podeEditar && <Button size="icon" variant="ghost" aria-label="Repetir" disabled={mut.isPending} onClick={() => mut.mutate({ tipo: i.tipo, termo: i.termo, qtd: [10, 30, 50].includes(i.qtd) ? i.qtd : 30 })}><RefreshCw className="size-4" /></Button>}
                        {podeEditar && <Button size="icon" variant="ghost" aria-label="Remover" disabled={mutRemover.isPending} onClick={() => mutRemover.mutate(i.id)}><Trash2 className="size-4" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </>
  );
}

function Detalhe({ id, tab, onTab, voltar }: { id: string; tab: "videos" | "insights"; onTab: (t: "videos" | "insights") => void; voltar: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getPesquisa);
  const avancar = useServerFn(avancarPesquisa);
  const analisar = useServerFn(analisarVideosPesquisa);
  const q = useQuery({ queryKey: ["pesquisa", id], queryFn: () => load({ data: { id } }) });
  const d = q.data;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<VideoTela[] | null>(null);
  const [soPt, setSoPt] = useState(true);
  const [ordem, setOrdem] = useState<"data" | "views">("data");
  const inval = () => void qc.invalidateQueries({ queryKey: ["pesquisa", id] });
  const emAndamento = !!d && (d.pesquisa.status === "coletando" || d.pesquisa.status === "processando" || d.analises.some((a) => ["na_fila", "baixando", "analisando", "enviando"].includes(a.status)));
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(async () => { await avancar({ data: { id } }).catch(() => null); inval(); }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emAndamento, id]);
  const mutAnalisar = useMutation({
    mutationFn: (ids: string[]) => analisar({ data: { id, videoIds: ids } }),
    onSuccess: (r) => { toast.success(`${r.criadas} ${r.criadas === 1 ? "análise criada" : "análises criadas"}. Até 5 rodam ao mesmo tempo.`); setSel(new Set()); setConfirmar(null); inval(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível criar as análises.")),
  });

  const todos = (d?.videos ?? []) as VideoTela[];
  const visiveis = useMemo(() => {
    const l = todos.filter((v) => !soPt || v.idioma_pt);
    return [...l].sort((a, b) => (ordem === "views" ? Number(b.views ?? 0) - Number(a.views ?? 0) : (b.publicado_em ?? "").localeCompare(a.publicado_em ?? "")));
  }, [todos, soPt, ordem]);
  const p = d?.pesquisa;
  const resumo = useMemo(() => resumoPesquisa(visiveis, p?.termo ?? ""), [visiveis, p?.termo]);
  const analisePor = new Map((d?.analises ?? []).filter((a) => a.video_id).map((a) => [a.video_id!, a] as const));
  const acompanhados = new Set((d?.acompanhados ?? []).map((h) => h.toLowerCase()));

  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>;
  if (!d || !p) return <Vazio>Não foi possível abrir esta pesquisa. <button className="font-semibold text-primary underline" onClick={voltar}>Voltar</button></Vazio>;
  const livres = (ids: string[]) => todos.filter((v) => ids.includes(v.tiktok_video_id) && !(analisePor.get(v.tiktok_video_id) && analisePor.get(v.tiktok_video_id)!.status !== "erro"));
  const top10 = visiveis.filter((v) => !v.anuncio).sort((a, b) => Number(b.views ?? 0) - Number(a.views ?? 0)).slice(0, 10).map((v) => v.tiktok_video_id);
  const analisadas = d.analises.filter((a) => a.status === "pronto").length;
  const pessoa = null; // % com pessoa: só quando houver análise; mostrado nos Insights.
  const cards = [
    { label: "Views médias", valor: fmt(resumo.viewsMedia) },
    { label: "Engajamento médio", valor: pct(resumo.engMedio) },
    { label: "Duração média", valor: resumo.duracaoMedia == null ? "—" : `${Math.round(resumo.duracaoMedia)} s` },
    { label: "Vídeos exibidos", valor: `${fmt(visiveis.length)} de ${fmt(todos.length)}` },
  ];
  void pessoa;
  const outroIdioma = soPt ? todos.filter((v) => !v.idioma_pt).length : 0;
  const anuncios = visiveis.filter((v) => v.anuncio).length;
  const partes = [outroIdioma && `${outroIdioma} em outro idioma, escondidos`, anuncios && `${anuncios} ${anuncios === 1 ? "anúncio" : "anúncios"}, fora das médias`].filter(Boolean);
  const contagem = `${fmt(todos.length)} coletados, ${fmt(visiveis.length)} exibidos${partes.length ? ` (${partes.join("; ")})` : ""}.`;
  const coletando = p.status === "coletando" || p.status === "processando";

  return (
    <>
      <button type="button" onClick={voltar} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Pesquisar</button>
      <div className="panel mb-6 flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold">{rotulo(p.tipo, p.termo)}</p>
          <p className="text-sm text-muted-foreground">{p.tipo === "hashtag" ? "Hashtag" : "Palavra"} · {quando(p.created_at)} · {fmt(p.n_videos)} de {fmt(p.qtd)} pedidos</p>
          {!coletando && todos.length > 0 && <p className="text-sm">{contagem}</p>}
          {(p.sugestoes ?? []).length > 0 && <p className="mt-1 text-xs text-muted-foreground">Termo em outro idioma. Tente {(p.sugestoes as string[]).map((sg, k) => <span key={sg}>{k > 0 && ", "}<Link to="/app/pesquisa" search={{ q: sg }} className="font-semibold text-primary underline">{p.tipo === "hashtag" ? "#" : ""}{sg}</Link></span>)}.</p>}
        </div>
        {coletando && <span className="inline-flex items-center gap-1 rounded-full status-blue px-2 py-0.5 text-xs"><Loader2 className="size-3 animate-spin" />Coletando</span>}
      </div>
      {p.status === "erro" && <div className="mb-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-ink">{p.erro ?? "A pesquisa falhou."}</div>}

      <Tabs value={tab} onValueChange={(v) => onTab(v as "videos" | "insights")}>
        <TabsList>
          <TabsTrigger value="videos">Vídeos</TabsTrigger>
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
          <p className="mb-4 text-xs text-muted-foreground">Anúncios ({resumo.anuncios}) ficam fora das médias. Carrosséis de fotos ({resumo.fotos}) ficam fora da duração média.</p>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <p className="mb-3 text-sm font-semibold">Hashtags usadas junto</p>
              {resumo.hashtags.length ? (
                <div className="flex flex-wrap gap-1.5">{resumo.hashtags.map((h) => <span key={h.nome} className="rounded-full bg-secondary px-2.5 py-1 text-xs">#{h.nome} <span className="text-muted-foreground">{h.qtd}</span></span>)}</div>
              ) : <p className="text-sm text-muted-foreground">—</p>}
            </div>
            <div className="panel p-5">
              <p className="mb-3 text-sm font-semibold">@ que mais aparecem</p>
              {resumo.autores.length ? (
                <div className="space-y-2">{resumo.autores.map((a) => (
                  <div key={a.nome} className="flex items-center justify-between gap-2 text-sm">
                    <span>@{a.nome} <span className="text-muted-foreground">· {a.qtd} vídeos</span></span>
                    <AddReferenciaButton handle={a.nome} jaAcompanhado={acompanhados.has(a.nome.toLowerCase())} compacto />
                  </div>
                ))}</div>
              ) : <p className="text-sm text-muted-foreground">Nenhum @ aparece mais de uma vez.</p>}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {d.podeEditar && (
              <>
                <Button disabled={!sel.size} onClick={() => { const l = livres([...sel]); if (!l.length) toast.error("Esses vídeos já foram analisados ou estão na fila."); else setConfirmar(l); }}><Sparkles />Analisar selecionados{sel.size ? ` (${sel.size})` : ""}</Button>
                <Button variant="secondary" disabled={!top10.length} onClick={() => { const l = livres(top10); if (!l.length) toast.error("Os 10 mais vistos já foram analisados."); else setConfirmar(l); }}>Analisar os 10 mais vistos</Button>
              </>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">Só português<Switch checked={soPt} onCheckedChange={setSoPt} /></label>
              <div className="inline-flex rounded-md bg-secondary p-1">
                {(["data", "views"] as const).map((o) => <button key={o} type="button" onClick={() => setOrdem(o)} className={`rounded px-2.5 py-1 text-xs font-medium ${ordem === o ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{o === "data" ? "Mais recentes" : "Mais vistos"}</button>)}
              </div>
            </div>
          </div>
          {soPt && todos.length > visiveis.length && <p className="mb-2 text-xs text-muted-foreground">{todos.length - visiveis.length} vídeos escondidos por estarem em outro idioma (detectado pela legenda).</p>}
          {!visiveis.length ? <Vazio>{coletando ? "Buscando vídeos no TikTok..." : "Nenhum vídeo para mostrar."}</Vazio> : (
            <div className="panel overflow-x-auto p-0">
              <Table>
                <TableHeader className="bg-secondary/60">
                  <TableRow className="hover:bg-transparent">
                    {d.podeEditar && <TableHead className="w-8 px-3"><Checkbox aria-label="Selecionar todos" checked={sel.size > 0 && sel.size === visiveis.length} onCheckedChange={(v) => setSel(v ? new Set(visiveis.map((x) => x.tiktok_video_id)) : new Set())} /></TableHead>}
                    <TableHead className="px-3 text-xs font-semibold">Vídeo</TableHead>
                    <TableHead className="px-3 text-xs font-semibold">@</TableHead>
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
                  {visiveis.map((v) => {
                    const a = analisePor.get(v.tiktok_video_id);
                    return (
                      <TableRow key={v.tiktok_video_id}>
                        {d.podeEditar && <TableCell className="px-3"><Checkbox aria-label="Selecionar" checked={sel.has(v.tiktok_video_id)} onCheckedChange={(c) => setSel((s) => { const n = new Set(s); if (c) n.add(v.tiktok_video_id); else n.delete(v.tiktok_video_id); return n; })} /></TableCell>}
                        <TableCell className="px-3">
                          <a href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
                            <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">{v.capaUrl && <img src={v.capaUrl} alt="" className="size-full object-cover" />}</div>
                            <span className="max-w-64">
                              <span className="line-clamp-2 text-sm">{v.legenda || "Sem legenda"}</span>
                              <span className="mt-0.5 flex flex-wrap gap-1">
                                {v.anuncio && <Selo icone={<Megaphone className="size-3" />}>Anúncio</Selo>}
                                {v.fotos && <Selo icone={<ImageIcon className="size-3" />}>Fotos</Selo>}
                                {v.tiktok_shop && <Selo icone={<ShoppingBag className="size-3" />}>TikTok Shop</Selo>}
                                {v.idioma && v.idioma !== "?" ? <Selo>{NOME_IDIOMA[v.idioma] ?? v.idioma.toUpperCase()}</Selo> : !v.idioma_pt && <Selo>Outro idioma (provável)</Selo>}
                              </span>
                            </span>
                          </a>
                        </TableCell>
                        <TableCell className="px-3 text-sm">
                          {v.autor_handle ? (
                            <Popover>
                              <PopoverTrigger className="font-medium hover:underline">@{v.autor_handle}</PopoverTrigger>
                              <PopoverContent className="w-auto space-y-2 p-3 text-sm">
                                <p className="font-medium">@{v.autor_handle}{v.autor_nome ? ` · ${v.autor_nome}` : ""}</p>
                                <p className="text-xs text-muted-foreground">{fmt(v.autor_seguidores)} seguidores</p>
                                <AddReferenciaButton handle={v.autor_handle} jaAcompanhado={acompanhados.has(v.autor_handle.toLowerCase())} />
                              </PopoverContent>
                            </Popover>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="px-3 text-sm">{v.publicado_em ? new Date(v.publicado_em).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{v.fotos ? "Fotos" : v.duracao ? `${Math.round(v.duracao)} s` : "—"}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(v.views)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(v.likes)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(v.comentarios)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(v.compartilhamentos)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(v.salvos)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{pct(engajamentoVideo(v))}</TableCell>
                        <TableCell className="px-3 text-sm"><StatusAnaliseBadge id={a?.id} status={a?.status} etapa={a?.etapa} erro={a?.erro} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsPesquisa id={id} p={p} analises={d.analises} videos={todos} podeEditar={d.podeEditar} analisadas={analisadas} onOk={inval} />
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
            <p>Download + IA pela duração: cerca de {usd((confirmar ?? []).reduce((s, v) => s + estAnaliseUsd(v.duracao), 0))} no total.</p>
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

function InsightsPesquisa({ id, p, analises, videos, podeEditar, analisadas, onOk }: {
  id: string; p: { tipo: string; termo: string; insights: string | null; insights_em: string | null };
  analises: { id: string; status: string; video_id: string | null }[]; videos: VideoTela[]; podeEditar: boolean; analisadas: number; onOk: () => void;
}) {
  const gerar = useServerFn(gerarInsightsPesquisa);
  const enviar = useServerFn(enviarRecomendacoesPesquisaFn);
  const mut = useMutation({
    mutationFn: () => gerar({ data: { id } }),
    onSuccess: () => { toast.success("Insights prontos."); onOk(); },
    onError: (e) => toast.error(actionError(e, "Não foi possível gerar os insights.")),
  });
  const li = lerInsights(p.insights);
  const hoje = new Date().toISOString().slice(0, 10);
  const refVideos = videos.map((v) => ({ tiktok_video_id: v.tiktok_video_id, url: v.url, legenda: v.legenda, publicado_em: v.publicado_em, duracao: v.duracao, capa_path: v.capa_path, capaUrl: v.capaUrl }));
  const snaps = videos.map((v) => ({ tiktok_video_id: v.tiktok_video_id, job_id: null, data: hoje, views: v.views, likes: v.likes, comentarios: v.comentarios, compartilhamentos: v.compartilhamentos, salvos: v.salvos, reposts: v.reposts })) as VideoSnap[];
  const andamento = analises.filter((a) => ["na_fila", "baixando", "enviando", "analisando"].includes(a.status)).length;
  if (analisadas < 5 && !p.insights) return <Vazio>Os insights ficam disponíveis com 5 ou mais vídeos analisados. Prontas: {analisadas}{andamento ? `, ${andamento} analisando` : ""}.</Vazio>;
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-sm font-medium">{p.insights ? `Gerado em ${quando(p.insights_em)}` : "Insights ainda não gerados"} <span className="block text-xs font-normal text-muted-foreground">{analisadas} prontas{andamento ? `, ${andamento} analisando` : ""}</span></p>
        {podeEditar && <Button size="sm" disabled={mut.isPending || analisadas < 5} onClick={() => mut.mutate()}>{mut.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}{p.insights ? "Gerar de novo" : "Gerar insights"}</Button>}
      </div>
      {li && "v2" in li ? (
        <InsightsV2View refId={id} handle={p.termo} rotulo={`o tema ${rotulo(p.tipo, p.termo)}`} enviarFn={() => enviar({ data: { id } })} v={li.v2} analises={analises} videos={refVideos} snaps={snaps} podeEditar={podeEditar} />
      ) : !p.insights ? <p className="panel p-5 text-sm text-muted-foreground">Toque em "Gerar insights" para cruzar as análises com os números.</p> : null}
    </div>
  );
}

function Selo({ children, icone }: { children: ReactNode; icone?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{icone}{children}</span>;
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
