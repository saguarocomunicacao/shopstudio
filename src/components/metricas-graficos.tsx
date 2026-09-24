/** Gráficos compartilhados por Métricas e Perfis de referência. */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";

export const diaCurto = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

export function GraficoMetricas({ titulo, dados, campo, cor }: { titulo: string; dados: { dia: string; seguidores: number | null; views: number }[]; campo: "seguidores" | "views"; cor: string }) {
  const pontos = dados.filter((d) => (campo === "seguidores" ? d.seguidores != null : d.views > 0));
  const temDados = pontos.length > 0;
  const unico = campo === "seguidores" && pontos.length === 1 ? pontos[0]! : null;
  return (
    <div className="panel p-5">
      <p className="mb-3 text-sm font-semibold">{titulo}</p>
      <div className="h-56">
        {unico ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <span className="size-3 rounded-full" style={{ background: cor }} />
            <p className="font-display text-3xl font-semibold">{Number(unico.seguidores).toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">{diaCurto(unico.dia)} · 1 coleta até agora</p>
          </div>
        ) : temDados ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line, var(--border))" />
              <XAxis dataKey="dia" tickFormatter={diaCurto} fontSize={11} />
              <YAxis fontSize={11} width={64} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
              <ReTooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), campo === "views" ? "Views" : "Seguidores"]} labelFormatter={(x) => diaCurto(String(x))} />
              <Line type="monotone" dataKey={campo} stroke={cor} strokeWidth={2} dot={pontos.length < 4} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados ainda. O gráfico se forma a cada coleta diária.</p>
        )}
      </div>
    </div>
  );
}

export function CurvaViews({ curva }: { curva: { dia: string; views: number }[] }) {
  if (curva.length < 2) return <p className="text-xs text-muted-foreground">A curva de views aparece a partir do segundo dia de coleta.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={curva}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line, var(--border))" />
        <XAxis dataKey="dia" tickFormatter={diaCurto} fontSize={11} />
        <YAxis fontSize={11} width={60} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
        <ReTooltip formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Views"]} labelFormatter={(x) => diaCurto(String(x))} />
        <Line type="monotone" dataKey="views" stroke="var(--primary)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
