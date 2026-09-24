import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Eye, Film, Heart, Loader2, RefreshCw, TrendingUp, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "./page-header";
import { useStudio } from "./studio-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { atualizarMetricasAgora, avancarColeta, getMetricas } from "@/lib/metricas.functions";
import { formatoLabel, linhasVideos, resumirMetricas, type JobMetricaBase, type LinhaVideo, type PerfilSnap, type VideoSnap } from "@/lib/metricas-calc";
import { getDraftPreviews } from "@/lib/drafts.functions";
import { brl, useJobCustos } from "@/lib/custo";
import { actionError } from "@/lib/api-keys";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const diaCurto = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const haQuanto = (iso: string | null | undefined) => {
  if (!iso) return null;
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return "Atualizado há menos de 1 h";
  if (h < 48) return `Atualizado há ${h} h`;
  return `Atualizado há ${Math.floor(h / 24)} dias`;
};

type SortKey = "published_at" | "views" | "likes" | "comentarios" | "compartilhamentos" | "salvos" | "engajamentoPct" | "custo" | "viewsPorReal";

export function MetricasContent() {
  const { activeProfileId, isBackoffice, can } = useStudio();
  const qc = useQueryClient();
  const [dias, setDias] = useState(7);
  const [formato, setFormato] = useState<"todos" | "IA" | "Gravado" | "Externo">("todos");
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "published_at", asc: false });
  const [aberto, setAberto] = useState<string | null>(null);
  const load = useServerFn(getMetricas);
  const atualizar = useServerFn(atualizarMetricasAgora);
  const avancar = useServerFn(avancarColeta);
  const loadPreviews = useServerFn(getDraftPreviews);

  const q = useQuery({
    queryKey: ["metricas", activeProfileId, dias],
    queryFn: () => load({ data: { profileId: activeProfileId!, dias } }),
    enabled: !!activeProfileId,
  });
  const d = q.data && !q.data.semPermissao ? q.data : null;
  const coletando = d?.coleta?.status === "coletando" || d?.coleta?.status === "processando";

  // Enquanto a coleta roda com a tela aberta, avança sozinha a cada 20 s.
  useEffect(() => {
    if (!coletando || !activeProfileId) return;
    const t = setInterval(async () => {
      const r = await avancar({ data: { profileId: activeProfileId } }).catch(() => null);
      if (r && r.status !== "aguardando") void qc.invalidateQueries({ queryKey: ["metricas", activeProfileId] });
    }, 20_000);
    return () => clearInterval(t);
  }, [coletando, activeProfileId, avancar, qc]);

  const mut = useMutation({
    mutationFn: () => atualizar({ data: { profileId: activeProfileId! } }),
    onSuccess: () => {
      toast.success("Coleta iniciada. Os números chegam em alguns minutos.");
      void qc.invalidateQueries({ queryKey: ["metricas", activeProfileId] });
    },
    onError: (e) => toast.error(actionError(e, "Não foi possível atualizar agora.")),
  });

  const podeCusto = isBackoffice || can("custos", "visualizar", activeProfileId);
  const { data: custos } = useJobCustos(podeCusto ? activeProfileId : null);

  const jobs = (d?.jobs ?? []) as JobMetricaBase[];
  const videos = (d?.videos ?? []) as VideoSnap[];
  const jobsFiltrados = formato === "todos" ? jobs : jobs.filter((j) => formatoLabel(j) === formato);
  const resumo = useMemo(
    () =>
      d
        ? resumirMetricas({
            perfil: d.perfil as PerfilSnap[], videos, jobs, dias,
            jobIds: formato === "todos" ? null : new Set(jobsFiltrados.map((j) => j.id)),
            publicadoPorVideo: new Map([
              ...jobs.filter((j) => j.tiktok_video_id).map((j) => [j.tiktok_video_id!, j.published_at] as const),
              ...((d.pubNaoVinc ?? []) as { tiktok_video_id: string; publicado_em: string | null }[]).map((r) => [r.tiktok_video_id, r.publicado_em] as const),
            ]),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, dias, formato],
  );
  const comLink = jobsFiltrados.filter((j) => j.tiktok_video_id);
  const linhas = useMemo(() => linhasVideos(comLink, videos), [comLink, videos]);
  const previewIds = comLink.slice(0, 60).map((j) => j.id);
  const previews = useQuery({
    queryKey: ["metricas-previews", previewIds.join(",")],
    queryFn: () => loadPreviews({ data: { jobIds: previewIds } }),
    enabled: previewIds.length > 0,
  });
  const thumb = (id: string) => {
    const p = previews.data?.previews.find((x) => x.id === id);
    return p?.thumbnailUrl ?? p?.aiThumbnailUrl ?? null;
  };
  const custoDe = (id: string) => custos?.get(id)?.totalBrl ?? null;
  const val = (l: LinhaVideo, k: SortKey): number => {
    if (k === "published_at") return l.published_at ? new Date(l.published_at).getTime() : 0;
    if (k === "custo") return custoDe(l.id) ?? -1;
    if (k === "viewsPorReal") { const c = custoDe(l.id); return c ? l.views / c : -1; }
    return (l[k] as number | null) ?? -1;
  };
  const ordenadas = [...linhas].sort((a, b) => (sort.asc ? val(a, sort.k) - val(b, sort.k) : val(b, sort.k) - val(a, sort.k)));

  const Th = ({ k, children, right = true }: { k: SortKey; children: string; right?: boolean }) => (
    <TableHead className={`px-3 text-xs font-semibold ${right ? "text-right" : ""}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : false }))}>
        {children}
        {sort.k === k && (sort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );

  if (q.data?.semPermissao) return <Vazio>A tela Métricas não está disponível para o seu usuário neste perfil.</Vazio>;

  const header = (
    <PageHeader
      title="Métricas"
      description={coletando ? "Coletando números no TikTok..." : haQuanto(d?.coleta?.ultima_coleta_em) ?? "Coleta ainda não rodou"}
      actions={
        d?.handle ? (
          <Button variant="secondary" onClick={() => mut.mutate()} disabled={mut.isPending || coletando}>
            {mut.isPending || coletando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar agora
          </Button>
        ) : undefined
      }
    />
  );

  if (q.isLoading) return <>{header}<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando métricas...</p></>;
  if (q.isError || !d || !resumo) return <>{header}<Vazio>Não foi possível carregar as métricas. Tente novamente.</Vazio></>;

  if (!d.handle)
    return <>{header}<Vazio>Informe o @ do perfil para coletar métricas. <Link to="/app/perfis" className="font-semibold text-primary underline">Abrir Perfis</Link></Vazio></>;

  const cards = [
    { icon: Users, label: "Seguidores", valor: fmt(resumo.seguidores), ctx: resumo.seguidoresVariacao == null ? "sem histórico ainda" : `${resumo.seguidoresVariacao >= 0 ? "+" : ""}${fmt(resumo.seguidoresVariacao)} vs ${dias} dias atrás` },
    { icon: Eye, label: `Views em ${dias} dias`, valor: fmt(resumo.views), ctx: "crescimento no período" },
    { icon: Heart, label: `Likes em ${dias} dias`, valor: fmt(resumo.likes), ctx: "crescimento no período" },
    { icon: TrendingUp, label: `Engajamento ${dias} dias`, valor: pct(resumo.engajamentoPct), ctx: "(likes + coment. + shares + salvos) ÷ views" },
    { icon: Film, label: "Vídeos publicados", valor: fmt(resumo.videosPublicados), ctx: `nos últimos ${dias} dias` },
  ];

  return (
    <>
      {header}
      {d.coleta?.status === "erro" && d.coleta.ultimo_erro && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{d.coleta.ultimo_erro}</span>
        </div>
      )}
      {!d.coleta?.ultima_coleta_em && !coletando && (
        <div className="mb-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          A coleta ainda não rodou para @{d.handle}. Ela acontece todo dia às 06:00, ou toque em "Atualizar agora".
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={formato} onValueChange={(v) => setFormato(v as typeof formato)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os formatos</SelectItem>
            <SelectItem value="IA">IA</SelectItem>
            <SelectItem value="Gravado">Gravado</SelectItem>
            <SelectItem value="Externo">Externo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><c.icon className="size-[18px]" />{c.label}</div>
            <p className="mt-1 font-display text-[36px] font-semibold leading-tight text-foreground">{c.valor}</p>
            <p className="text-[13px] text-muted-foreground">{c.ctx}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Seguidores por dia (30 dias)" dados={resumo.serie} campo="seguidores" cor="var(--cyan-ink)" />
        <Grafico titulo="Views por dia (30 dias)" dados={resumo.serie} campo="views" cor="var(--primary)" />
      </div>

      <div className="panel p-0">
        <div className="flex items-center justify-between p-4">
          <p className="text-sm font-semibold">Vídeos publicados</p>
          {d.naoVinculados > 0 && <Link to="/app/rascunhos" search={{ tab: "publicados" } as never} className="text-xs font-semibold text-primary underline">{d.naoVinculados} vídeos do perfil sem vínculo</Link>}
        </div>
        {!ordenadas.length ? (
          <div className="border-t p-8 text-center text-sm text-muted-foreground">
            Nenhum vídeo publicado com link do TikTok. Adicione o link em <Link to="/app/rascunhos" search={{ tab: "publicados" } as never} className="font-semibold text-primary underline">Publicados</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader className="bg-secondary/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="px-3 text-xs font-semibold">Vídeo</TableHead>
                  <Th k="published_at" right={false}>Publicado</Th>
                  <Th k="views">Views</Th>
                  <Th k="likes">Likes</Th>
                  <Th k="comentarios">Coment.</Th>
                  <Th k="compartilhamentos">Shares</Th>
                  <Th k="salvos">Salvos</Th>
                  <Th k="engajamentoPct">Engaj.</Th>
                  <TableHead className="px-3 text-xs font-semibold">Formato</TableHead>
                  {podeCusto && <Th k="custo">Custo</Th>}
                  {podeCusto && <Th k="viewsPorReal">Views/R$</Th>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((l) => {
                  const c = custoDe(l.id);
                  const exp = aberto === l.id;
                  return (
                    <Fragment key={l.id}>
                      <TableRow className="cursor-pointer" onClick={() => setAberto(exp ? null : l.id)}>
                        <TableCell className="px-2">{exp ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                        <TableCell className="px-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">{thumb(l.id) && <img src={thumb(l.id)!} alt="" className="size-full object-cover" />}</div>
                            <span className="line-clamp-2 max-w-64 text-sm font-medium">{l.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 text-sm">{l.published_at ? new Date(l.published_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        {l.semDados ? (
                          <TableCell colSpan={6} className="px-3 text-right text-xs text-muted-foreground">aguardando a próxima coleta</TableCell>
                        ) : (
                          <>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(l.views)}</TableCell>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(l.likes)}</TableCell>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(l.comentarios)}</TableCell>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(l.compartilhamentos)}</TableCell>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(l.salvos)}</TableCell>
                            <TableCell className="px-3 text-right text-sm tabular-nums">{pct(l.engajamentoPct)}</TableCell>
                          </>
                        )}
                        <TableCell className="px-3 text-sm">{formatoLabel(l)}</TableCell>
                        {podeCusto && <TableCell className="px-3 text-right text-sm tabular-nums">{c ? brl(c) : "—"}</TableCell>}
                        {podeCusto && <TableCell className="px-3 text-right text-sm tabular-nums">{c && !l.semDados ? fmt(Math.round(l.views / c)) : "—"}</TableCell>}
                      </TableRow>
                      {exp && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={podeCusto ? 12 : 10} className="bg-background px-4 py-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                              <div className="h-40">
                                {l.curva.length > 1 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={l.curva}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line, var(--border))" />
                                      <XAxis dataKey="dia" tickFormatter={diaCurto} fontSize={11} />
                                      <YAxis fontSize={11} width={60} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
                                      <ReTooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Views"]} labelFormatter={(x) => diaCurto(String(x))} />
                                      <Line type="monotone" dataKey="views" stroke="var(--primary)" strokeWidth={2} dot={false} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <p className="text-xs text-muted-foreground">A curva de views aparece a partir do segundo dia de coleta.</p>
                                )}
                              </div>
                              <div className="grid content-start gap-2 text-xs">
                                <p className="text-muted-foreground">Repostados: {fmt(l.reposts)}</p>
                                {l.tiktok_video_url && (
                                  <a href={l.tiktok_video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline" onClick={(e) => e.stopPropagation()}>
                                    Abrir no TikTok <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

function Grafico({ titulo, dados, campo, cor }: { titulo: string; dados: { dia: string; seguidores: number | null; views: number }[]; campo: "seguidores" | "views"; cor: string }) {
  const temDados = dados.some((d) => (campo === "seguidores" ? d.seguidores != null : d.views > 0));
  return (
    <div className="panel p-5">
      <p className="mb-3 text-sm font-semibold">{titulo}</p>
      <div className="h-56">
        {temDados ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line, var(--border))" />
              <XAxis dataKey="dia" tickFormatter={diaCurto} fontSize={11} />
              <YAxis fontSize={11} width={64} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
              <ReTooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), campo === "views" ? "Views" : "Seguidores"]} labelFormatter={(x) => diaCurto(String(x))} />
              <Line type="monotone" dataKey={campo} stroke={cor} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados ainda. O gráfico se forma a cada coleta diária.</p>
        )}
      </div>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
