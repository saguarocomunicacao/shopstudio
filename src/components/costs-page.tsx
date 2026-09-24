/**
 * Tela "Custos": todo o gasto da plataforma, calculado dos eventos de consumo
 * com a tarifa vigente e a cotação configurada. Métricas segue só com desempenho.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, UserSquare2, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/custo";
import {
  ETAPA_VISUAL_LABELS,
  ETAPA_VISUAL_ORDEM,
  consumoLabel,
  useCustoPeriodo,
  type EtapaVisual,
  type LinhaJob,
} from "@/lib/custo-periodo";
import type { DbJob } from "@/lib/content";
import { useGastoMes } from "@/lib/orcamento";
import { useMeuTenantId, useTenants } from "@/lib/tenants";
import { JobDetailDialog } from "./job-detail-dialog";
import { PageHeader } from "./page-header";
import { TenantCostsView } from "./costs-tenant-view";
import { useStudio } from "./studio-context";

type PeriodoKey = "hoje" | "7d" | "30d" | "mes" | "custom";

/** Valor especial do filtro de perfil: visão consolidada. */
const TODOS = "todos";

const lerListaUrl = (chave: string): string[] => {
  if (typeof window === "undefined") return [];
  const bruto = new URL(window.location.href).searchParams.get(chave);
  return bruto ? bruto.split(",").filter(Boolean) : [];
};

const PERIODO_LABELS: Record<PeriodoKey, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Mês atual",
  custom: "Intervalo personalizado",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

function intervaloDe(periodo: PeriodoKey, de: string, ate: string) {
  const hoje = startOfToday();
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  if (periodo === "custom") {
    const inicio = de ? new Date(`${de}T00:00:00`) : hoje;
    const final = ate ? new Date(`${ate}T23:59:59`) : fim;
    return { desde: inicio.toISOString(), ate: final.toISOString() };
  }
  const inicio = new Date(hoje);
  if (periodo === "7d") inicio.setDate(inicio.getDate() - 6);
  if (periodo === "30d") inicio.setDate(inicio.getDate() - 29);
  if (periodo === "mes") inicio.setDate(1);
  return { desde: inicio.toISOString(), ate: fim.toISOString() };
}

const dataCurta = (isoStr: string) =>
  new Date(isoStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataHora = (isoStr: string) =>
  new Date(isoStr).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const CORES = ["var(--primary)", "var(--cyan-ink)", "var(--warning)", "var(--brand-cyan)", "var(--foreground)", "var(--muted-foreground)"];

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bloco({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function useJobsDoPeriodo(jobIds: string[]) {
  const key = [...jobIds].sort().join(",");
  return useQuery({
    queryKey: ["custo-jobs-detalhe", key],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, product_id, profile_id, status, title, created_at, script, caption, hashtags, video_url, video_thumbnail_url, render_id, render_error, render_started_at, render_stage, scenes, gemini_images_count, veo_takes_count",
        )
        .in("id", jobIds);
      if (error) throw new Error(error.message);
      const map = new Map<string, DbJob>();
      for (const job of (data ?? []) as DbJob[]) map.set(job.id, job);
      return map;
    },
  });
}

export function CostsPage() {
  const { profiles, activeProfileId, isBackoffice, can, userId } = useStudio();
  const podeVer = isBackoffice || can("custos", "visualizar", activeProfileId);
  // Visão "Todos os perfis" e orçamento são dados internos da operação: só backoffice.
  const podeVerGlobal = isBackoffice;
  const { data: tenants } = useTenants();
  const { data: meuTenantId } = useMeuTenantId(userId);
  const [tenantSel, setTenantSel] = useState<string | null>(null);
  const tenantId = isBackoffice ? tenantSel ?? meuTenantId ?? null : meuTenantId ?? null;
  const [periodo, setPeriodo] = useState<PeriodoKey>("mes");
  const [de, setDe] = useState(iso(startOfToday()));
  const [ate, setAte] = useState(iso(startOfToday()));
  const [perfisSel, setPerfisSel] = useState<string[]>(() => lerListaUrl("perfis"));
  const [etapasSelRaw, setEtapasSel] = useState<EtapaVisual[]>(
    () => lerListaUrl("etapa").filter((e): e is EtapaVisual => (ETAPA_VISUAL_ORDEM as string[]).includes(e)),
  );
  const [ordem, setOrdem] = useState<"total" | "data">("total");
  const [detalhe, setDetalhe] = useState<DbJob | null>(null);

  const todosPerfis = perfisSel.includes(TODOS) && podeVerGlobal;
  const perfisEscolhidos = perfisSel.filter((id) => id !== TODOS && profiles.some((p) => p.id === id));
  const etapasSel = etapasSelRaw;

  // Reflete os filtros na URL (?perfis=..., ?etapa=...) sem recarregar a tela.
  useEffect(() => {
    const url = new URL(window.location.href);
    const perfisParam = todosPerfis ? TODOS : perfisEscolhidos.join(",");
    if (perfisParam) url.searchParams.set("perfis", perfisParam);
    else url.searchParams.delete("perfis");
    if (etapasSel.length) url.searchParams.set("etapa", etapasSel.join(","));
    else url.searchParams.delete("etapa");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [todosPerfis, perfisEscolhidos.join(","), etapasSel.join(",")]);

  // Com o cliente selecionado, o padrão é a visão consolidada dele;
  // o filtro de perfil só entra quando escolhido explicitamente.
  const intervalo = useMemo(() => intervaloDe(periodo, de, ate), [periodo, de, ate]);
  const perfilFiltro = perfisEscolhidos.length ? perfisEscolhidos : null;
  const { data, isLoading, isError } = useCustoPeriodo(intervalo.desde, intervalo.ate, perfilFiltro, etapasSel, tenantId);
  const gasto = useGastoMes(activeProfileId);

  const jobsLinhas = useMemo(() => {
    const linhas = data?.jobs ?? [];
    return ordem === "total"
      ? [...linhas].sort((a, b) => b.totalBrl - a.totalBrl)
      : [...linhas].sort((a, b) => (a.data < b.data ? 1 : -1));
  }, [data, ordem]);

  const { data: jobsMap } = useJobsDoPeriodo(jobsLinhas.map((j) => j.jobId));
  const nomePerfil = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.name ?? "—" : "Global");
  const nomeJob = (linha: LinhaJob) => jobsMap?.get(linha.jobId)?.title ?? "Job removido";

  const exportarCsv = () => {
    const head = ["Produto", "Perfil", "Data", "Roteiro", "Cenas", "Animacao", "Montagem", "Total", "Regeneracoes"];
    const linhas = jobsLinhas.map((j) => [
      nomeJob(j).replaceAll('"', "'"),
      nomePerfil(j.profileId),
      new Date(j.data).toLocaleDateString("pt-BR"),
      (j.porEtapa.roteiro_texto ?? 0).toFixed(4),
      (j.porEtapa.cena_gemini ?? 0).toFixed(4),
      (j.porEtapa.animacao_veo ?? 0).toFixed(4),
      (j.porEtapa.montagem_json2video ?? 0).toFixed(4),
      j.totalBrl.toFixed(4),
      String(j.regeneracoes),
    ]);
    const csv = [head, ...linhas].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `custos-${intervalo.desde.slice(0, 10)}-a-${intervalo.ate.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!podeVer) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="panel max-w-md text-center">
          <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
            <Users className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-black">Sem acesso aos custos</h2>
          <p className="mt-2 text-sm text-muted-foreground">Você não tem permissão para ver os custos deste perfil. Peça acesso a um administrador.</p>
        </div>
      </div>
    );
  }

  // Cliente comum: visão consolidada do próprio consumo, sem divisão interna.
  if (!isBackoffice) return <TenantCostsView />;

  if (!profiles.length) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="panel max-w-md text-center">
          <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
            <Users className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-black">Crie seu primeiro perfil</h2>
          <p className="mt-2 text-sm text-muted-foreground">Os custos são organizados por perfil. Crie um para começar.</p>
          <div className="mt-6 flex justify-center">
            <Button asChild>
              <Link to="/app/perfis">Criar perfil</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return <div className="panel text-center text-sm text-muted-foreground">Não foi possível carregar os custos. Tente novamente.</div>;
  }

  const semSelecao = !tenantId;
  const teto = gasto?.tetoPerfil ?? gasto?.tetoGlobal ?? null;
  const consumidoMes = gasto ? (gasto.tetoPerfil ? gasto.perfilBrl : gasto.globalBrl) : 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="grid gap-6">
      <PageHeader
        title="Custos"
        description={gasto ? `Gasto do mês: ${brl(consumidoMes)}${teto ? ` de ${brl(teto)}` : ""}` : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!jobsLinhas.length}>
            <Download className="size-4" /> Exportar CSV
          </Button>
        }
      />
      {/* Filtros */}
      <div className="panel flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Empresa</label>
          <Select value={tenantId ?? ""} onValueChange={(v) => setTenantSel(v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
            <SelectContent>
              {(tenants ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Período</label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIODO_LABELS) as PeriodoKey[]).map((k) => (
                <SelectItem key={k} value={k}>{PERIODO_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {periodo === "custom" && (
          <>
            <div className="grid gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Início</label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Fim</label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
            </div>
          </>
        )}
        <div className="grid gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Perfil</label>
          <MultiSelect
            className="w-60"
            options={[
              ...(podeVerGlobal ? [{ value: TODOS, label: "Todos os perfis" }] : []),
              ...profiles.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={perfisSel}
            onChange={setPerfisSel}
            exclusiveValues={[TODOS]}
            placeholder={
              activeProfileId
                ? profiles.find((p) => p.id === activeProfileId)?.name ?? "Perfil ativo"
                : "Perfil ativo"
            }
            searchPlaceholder="Buscar perfil..."
            emptyText="Nenhum perfil encontrado"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Etapa</label>
          <MultiSelect
            className="w-56"
            options={ETAPA_VISUAL_ORDEM.map((e) => ({ value: e, label: ETAPA_VISUAL_LABELS[e] }))}
            value={etapasSel}
            onChange={(v) => setEtapasSel(v as EtapaVisual[])}
            placeholder="Todas as etapas"
            searchPlaceholder="Buscar etapa..."
            emptyText="Nenhuma etapa encontrada"
          />
        </div>
      </div>

      {semSelecao ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="panel max-w-md text-center">
            <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
              <UserSquare2 className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-black">Selecione uma empresa</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Escolha a empresa no seletor acima para ver o consumo dela.
            </p>
          </div>
        </div>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando custos...</p>
      ) : data.totalBrl <= 0 && !data.buscas.length ? (
        <div className="panel text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-black">Nenhum custo no período</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste o período ou o filtro de etapa para ver outros gastos.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Custo total" value={brl(data.totalBrl)} />
            <Card label="Vídeos gerados" value={String(data.jobsComCusto)} hint="jobs com custo no período" />
            <Card label="Custo médio por vídeo" value={brl(data.custoMedioPorJob)} />
            <Card label="Buscas de produto" value={String(data.buscasCount)} hint="inclui atualizações de categorias" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card label="Preço ao cliente" value={brl(data.totalPrecoClienteBrl)} hint="preço da ferramenta cobrado" />
            <Card label="Custo de API" value={brl(data.totalBrl)} hint="custo estimado dos fornecedores" />
            <Card
              label="Margem"
              value={brl(data.totalPrecoClienteBrl - data.totalBrl)}
              hint="preço ao cliente menos custo de API"
            />
          </div>

          {podeVerGlobal && teto && (
            <div className="panel grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-black">Orçamento do mês</p>
                <p className="text-xs text-muted-foreground">
                  {brl(consumidoMes)} de {brl(teto)} ({Math.round((consumidoMes / teto) * 100)}%)
                </p>
              </div>
              <Progress value={Math.min(100, (consumidoMes / teto) * 100)} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel">
              <p className="mb-3 text-sm font-black">Custo por dia</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.porDia}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="dia" tickFormatter={dataCurta} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => brl(Number(v))} />
                    <ReTooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => dataCurta(String(l))} />
                    <Bar dataKey="valorBrl" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel">
              <p className="mb-3 text-sm font-black">Distribuição por etapa</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.porEtapa} dataKey="valorBrl" nameKey="etapa" innerRadius={45} outerRadius={80}>
                      {data.porEtapa.map((linha, i) => (
                        <Cell key={linha.etapa} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(v, n) => [brl(Number(v)), ETAPA_VISUAL_LABELS[n as EtapaVisual] ?? String(n)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 grid gap-1 text-xs">
                {data.porEtapa.map((linha, i) => (
                  <li key={linha.etapa} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: CORES[i % CORES.length] }} />
                    <span className="text-muted-foreground">{ETAPA_VISUAL_LABELS[linha.etapa]}</span>
                    <span className="ml-auto font-semibold">{linha.percentual.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {teto && data.porDia.length > 1 && (
            <div className="panel">
              <p className="mb-3 text-sm font-black">Custo acumulado vs teto</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.porDia}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="dia" tickFormatter={dataCurta} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => brl(Number(v))} />
                    <ReTooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => dataCurta(String(l))} />
                    <ReferenceLine y={teto} stroke="var(--primary)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="acumulado" stroke="var(--cyan-ink)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <Bloco title="Custo por etapa">
            <div className="overflow-hidden rounded-xl border bg-background">
              <Table>
                <TableHeader className="bg-secondary/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs font-semibold">Etapa</TableHead>
                    <TableHead className="px-4 text-xs font-semibold">Consumo total</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">Custo</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">% do total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porEtapa.map((linha) => (
                    <TableRow key={linha.etapa}>
                      <TableCell className="px-4 py-3 font-semibold">{ETAPA_VISUAL_LABELS[linha.etapa]}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {consumoLabel(linha.etapa, linha.quantidade, linha.eventos)}
                        {linha.estimado ? " · estimado" : ""}
                        {linha.semTarifa ? " · sem tarifa" : ""}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right font-medium">{brl(linha.valorBrl)}</TableCell>
                      <TableCell className="px-4 py-3 text-right text-muted-foreground">{linha.percentual.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-4 py-3 font-bold">Total</TableCell>
                    <TableCell className="px-4 py-3" />
                    <TableCell className="px-4 py-3 text-right font-bold text-primary">{brl(data.totalBrl)}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-bold text-primary">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Bloco>

          <Bloco
            title="Custo por vídeo"
            action={
              <Select value={ordem} onValueChange={(v) => setOrdem(v as "total" | "data")}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Maior custo</SelectItem>
                  <SelectItem value="data">Mais recente</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            {jobsLinhas.length ? (
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table className="table-fixed">
                  <TableHeader className="bg-secondary/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[26%] px-4 text-xs font-semibold">Produto</TableHead>
                      <TableHead className="w-[14%] px-2 text-xs font-semibold">Perfil</TableHead>
                      <TableHead className="w-[10%] px-2 text-xs font-semibold">Data</TableHead>
                      <TableHead className="px-2 text-right text-xs font-semibold">Roteiro</TableHead>
                      <TableHead className="px-2 text-right text-xs font-semibold">Cenas</TableHead>
                      <TableHead className="px-2 text-right text-xs font-semibold">Animação</TableHead>
                      <TableHead className="px-2 text-right text-xs font-semibold">Montagem</TableHead>
                      <TableHead className="px-2 text-right text-xs font-semibold">Total</TableHead>
                      <TableHead className="w-[8%] px-2 text-right text-xs font-semibold">Regen.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsLinhas.map((linha) => {
                      const job = jobsMap?.get(linha.jobId) ?? null;
                      return (
                        <TableRow
                          key={linha.jobId}
                          className="cursor-pointer"
                          onClick={() => job && setDetalhe(job)}
                        >
                          <TableCell className="px-4 py-3 font-semibold">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate">{nomeJob(linha)}</span>
                              </TooltipTrigger>
                              <TooltipContent>{nomeJob(linha)}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="truncate px-2 py-3 text-muted-foreground">{nomePerfil(linha.profileId)}</TableCell>
                          <TableCell className="px-2 py-3 text-muted-foreground">{dataCurta(linha.data)}</TableCell>
                          <TableCell className="px-2 py-3 text-right">{brl(linha.porEtapa.roteiro_texto ?? 0)}</TableCell>
                          <TableCell className="px-2 py-3 text-right">{brl(linha.porEtapa.cena_gemini ?? 0)}</TableCell>
                          <TableCell className="px-2 py-3 text-right">{brl(linha.porEtapa.animacao_veo ?? 0)}</TableCell>
                          <TableCell className="px-2 py-3 text-right">{brl(linha.porEtapa.montagem_json2video ?? 0)}</TableCell>
                          <TableCell className="px-2 py-3 text-right font-bold text-primary">{brl(linha.totalBrl)}</TableCell>
                          <TableCell className="px-2 py-3 text-right text-muted-foreground">{linha.regeneracoes}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">Nenhum vídeo com custo no período.</p>
            )}
          </Bloco>

          <Bloco title="Buscas">
            {data.buscas.length ? (
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table className="table-fixed">
                  <TableHeader className="bg-secondary/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[14%] px-4 text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="w-[20%] px-2 text-xs font-semibold">Perfil</TableHead>
                      <TableHead className="px-2 text-xs font-semibold">Termo</TableHead>
                      <TableHead className="w-[10%] px-2 text-right text-xs font-semibold">Linhas</TableHead>
                      <TableHead className="w-[16%] px-2 text-xs font-semibold">Data</TableHead>
                      <TableHead className="w-[12%] px-2 text-right text-xs font-semibold">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.buscas.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="px-4 py-3 font-semibold">{b.tipo === "busca" ? "Busca" : "Categorias"}</TableCell>
                        <TableCell className="truncate px-2 py-3 text-muted-foreground">{nomePerfil(b.profileId)}</TableCell>
                        <TableCell className="truncate px-2 py-3">{b.termo}</TableCell>
                        <TableCell className="px-2 py-3 text-right text-muted-foreground">{b.linhas}</TableCell>
                        <TableCell className="px-2 py-3 text-muted-foreground">{dataHora(b.created_at)}</TableCell>
                        <TableCell className="px-2 py-3 text-right font-medium">{b.semTarifa ? "sem tarifa" : brl(b.valorBrl)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">Nenhuma busca no período.</p>
            )}
          </Bloco>
        </>
      )}

      <JobDetailDialog
        job={detalhe}
        productName={detalhe?.title ?? ""}
        canEdit={false}
        onOpenChange={(open) => !open && setDetalhe(null)}
      />
    </div>
    </TooltipProvider>
  );
}
