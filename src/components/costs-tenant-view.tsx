/**
 * Visão de custos do cliente: valor único por ação (sem separar ferramenta e
 * API), com seletor de período e extrato. Os números vêm prontos do servidor.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/custo";
import { consumoConsolidado } from "@/lib/consumo-tenant.functions";

type PeriodoKey = "hoje" | "7d" | "30d" | "mes" | "custom";

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
const dataCurta = (v: string) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataHora = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TenantCostsView() {
  const [periodo, setPeriodo] = useState<PeriodoKey>("mes");
  const [de, setDe] = useState(iso(startOfToday()));
  const [ate, setAte] = useState(iso(startOfToday()));
  const intervalo = useMemo(() => intervaloDe(periodo, de, ate), [periodo, de, ate]);

  const buscar = useServerFn(consumoConsolidado);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consumo-consolidado", intervalo.desde, intervalo.ate],
    staleTime: 30_000,
    queryFn: () => buscar({ data: { desde: intervalo.desde, ate: intervalo.ate } }),
  });

  return (
    <div className="grid gap-6">
      <div className="panel flex flex-wrap items-end gap-3">
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
      </div>

      {isError ? (
        <div className="panel text-center text-sm text-muted-foreground">Não foi possível carregar os custos. Tente novamente.</div>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando custos...</p>
      ) : data.eventos === 0 ? (
        <div className="panel text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-black">Nenhum gasto no período</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste o período para ver outros gastos.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card label="Total no período" value={brl(data.totalBrl)} />
            <Card label="Ações realizadas" value={String(data.eventos)} hint="cada geração conta como uma ação" />
            <Card
              label="Tipo de ação mais cara"
              value={data.porAcao[0]?.label ?? "—"}
              hint={data.porAcao[0] ? brl(data.porAcao[0].valorBrl) : ""}
            />
          </div>

          <div className="panel">
            <p className="mb-3 text-sm font-black">Gasto por dia</p>
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

          <section className="grid gap-3">
            <h2 className="text-sm font-black">Gasto por tipo de ação</h2>
            <div className="overflow-hidden rounded-xl border bg-background">
              <Table>
                <TableHeader className="bg-secondary/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs font-semibold">Ação</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">Quantidade</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">Valor</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">% do total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porAcao.map((linha) => (
                    <TableRow key={linha.acao}>
                      <TableCell className="px-4 py-3 font-semibold">{linha.label}</TableCell>
                      <TableCell className="px-4 py-3 text-right text-muted-foreground">{linha.eventos}</TableCell>
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
          </section>

          <section className="grid gap-3">
            <h2 className="text-sm font-black">Extrato</h2>
            <div className="overflow-hidden rounded-xl border bg-background">
              <Table>
                <TableHeader className="bg-secondary/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs font-semibold">Data</TableHead>
                    <TableHead className="px-4 text-xs font-semibold">Ação</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.extrato.map((linha) => (
                    <TableRow key={linha.id}>
                      <TableCell className="px-4 py-3 text-muted-foreground">{dataHora(linha.created_at)}</TableCell>
                      <TableCell className="px-4 py-3 font-semibold">{linha.label}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-medium">{brl(linha.valorBrl)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
