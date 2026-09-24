import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Search, UserPlus } from "lucide-react";
import { useStudio } from "./studio-context";
import { CategorySelect } from "./category-select";
import { AddReferenciaButton } from "./add-referencia-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buscarCriadores, buscasRecentesCriadores, fichaCriador } from "@/lib/criadores.functions";
import { adicionarReferenciaFn } from "@/lib/referencias.functions";
import { brl } from "@/lib/custo";
import { actionError } from "@/lib/api-keys";

type Criador = { id: string; handle: string; nome: string | null; seguidores: number; receita: number; receitaVideo: number; receitaLive: number; pctVideo: number | null; vendas: number; crescimento: number | null; views: number; receitaPorMilViews: number | null };
type Ordem = "video_revenue" | "revenue" | "sales_volumn" | "revenue_growth_rate" | "creator_followers";
const ORDENS: [Ordem, string][] = [["video_revenue", "Receita em vídeo"], ["revenue", "Receita total"], ["sales_volumn", "Vendas"], ["revenue_growth_rate", "Crescimento"], ["creator_followers", "Seguidores"]];
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const compacto = (n: number) => n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const USD_BRL = 5.4;
const estColetaUsd = 0.005 + 20 * 0.0004;
const numOu = (s: string) => (s.trim() ? Number(s.replace(/\D/g, "")) : null);

export function CriadoresPanel() {
  const { activeProfileId, activeProfile, isBackoffice, can } = useStudio();
  const qc = useQueryClient();
  const buscar = useServerFn(buscarCriadores);
  const recentes = useServerFn(buscasRecentesCriadores);
  const adicionar = useServerFn(adicionarReferenciaFn);
  const [categoria, setCategoria] = useState<string>(activeProfile?.category_id ?? "");
  const [periodo, setPeriodo] = useState<"last7Day" | "last30Day">("last30Day");
  const [ordem, setOrdem] = useState<Ordem>("video_revenue");
  const [segMin, setSegMin] = useState("");
  const [segMax, setSegMax] = useState("");
  const [recMin, setRecMin] = useState("");
  const [soVideo, setSoVideo] = useState(true);
  const [res, setRes] = useState<{ itens: Criador[]; acompanhados: string[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<Set<string>>(new Set());
  const podeEditar = isBackoffice || can("pipeline", "editar", activeProfileId) || can("pipeline", "criar", activeProfileId);

  const hist = useQuery({ queryKey: ["criadores-recentes", activeProfileId], queryFn: () => recentes({ data: { profileId: activeProfileId! } }), enabled: !!activeProfileId });
  const mut = useMutation({
    mutationFn: () => buscar({ data: { profileId: activeProfileId!, categoryId: categoria || null, dateRange: periodo, sortField: ordem } }),
    onSuccess: (r) => { setRes(r as never); setSel(new Set()); setAberto(null); void qc.invalidateQueries({ queryKey: ["criadores-recentes", activeProfileId] }); },
    onError: (e) => toast.error(actionError(e, "Não foi possível buscar criadores.")),
  });
  const mutVarios = useMutation({
    mutationFn: async (handles: string[]) => {
      const ok: string[] = [];
      for (const h of handles) {
        try { await adicionar({ data: { profileId: activeProfileId!, handle: h, qtd: 20, acompanhar: true } }); ok.push(h); } catch { /* já existe ou inválido */ }
      }
      return ok;
    },
    onSuccess: (ok) => { setAdicionados((s) => new Set([...s, ...ok])); setSel(new Set()); toast.success(`${ok.length} ${ok.length === 1 ? "@ adicionado" : "@ adicionados"} a Perfis de referência.`); void qc.invalidateQueries({ queryKey: ["referencias"] }); },
  });

  const acompanhados = new Set([...(res?.acompanhados ?? hist.data?.acompanhados ?? []), ...adicionados]);
  const lista = useMemo(() => {
    const mn = numOu(segMin), mx = numOu(segMax), rm = numOu(recMin);
    return (res?.itens ?? []).filter((c) => (mn == null || c.seguidores >= mn) && (mx == null || c.seguidores <= mx) && (rm == null || c.receita >= rm) && (!soVideo || (c.pctVideo ?? 0) >= 50));
  }, [res, segMin, segMax, recMin, soVideo]);
  const livres = [...sel].filter((h) => !acompanhados.has(h));

  return (
    <div className="space-y-4">
      <div className="panel space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5"><Label>Categoria</Label><CategorySelect value={categoria} onChange={(id) => setCategoria(id)} /></div>
          <div className="space-y-1.5">
            <Label>Período</Label>
            <div className="grid grid-cols-2 gap-1">{(["last7Day", "last30Day"] as const).map((p) => <Button key={p} type="button" variant={periodo === p ? "default" : "secondary"} onClick={() => setPeriodo(p)}>{p === "last7Day" ? "7 dias" : "30 dias"}</Button>)}</div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-ordem">Ordenar por</Label>
            <select id="cr-ordem" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
              {ORDENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-end"><Button className="w-full" disabled={mut.isPending || !activeProfileId} onClick={() => mut.mutate()}>{mut.isPending ? <Loader2 className="animate-spin" /> : <Search />}Buscar criadores</Button></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor="cr-min">Seguidores mínimo</Label><Input id="cr-min" inputMode="numeric" placeholder="10000" value={segMin} onChange={(e) => setSegMin(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="cr-max">Seguidores máximo</Label><Input id="cr-max" inputMode="numeric" placeholder="500000" value={segMax} onChange={(e) => setSegMax(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="cr-rec">Receita mínima (R$)</Label><Input id="cr-rec" inputMode="numeric" placeholder="50000" value={recMin} onChange={(e) => setRecMin(e.target.value)} /></div>
          <label className="flex items-end justify-between gap-3 pb-2 text-sm">Só quem tem 50%+ da receita em vídeo<Switch checked={soVideo} onCheckedChange={setSoVideo} /></label>
        </div>
        <p className="text-xs text-muted-foreground">O Kalodata devolve os 50 primeiros do ranking. Seguidores, receita mínima e % em vídeo são filtrados aqui, sem custo extra. Nº de vídeos no período aparece ao abrir a linha.</p>
      </div>

      {!res && (hist.data?.itens.length ?? 0) > 0 && (
        <div className="panel p-4">
          <p className="mb-2 text-sm font-semibold">Buscas recentes</p>
          <div className="flex flex-wrap gap-2">
            {hist.data!.itens.map((b) => (
              <Button key={b.id} size="sm" variant="secondary" onClick={() => { setRes({ itens: b.resultados as Criador[], acompanhados: hist.data!.acompanhados }); const f = b.filtros ?? {}; if (f.sortField) setOrdem(f.sortField); if (f.dateRange) setPeriodo(f.dateRange); setCategoria(f.categoryId ?? ""); }}>
                {new Date(b.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {ORDENS.find(([v]) => v === b.filtros?.sortField)?.[1] ?? "Ranking"} · {b.total}
              </Button>
            ))}
          </div>
        </div>
      )}

      {res && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{lista.length} de {res.itens.length} criadores</p>
            {podeEditar && (
              <Button className="ml-auto" size="sm" disabled={!livres.length || mutVarios.isPending} onClick={() => mutVarios.mutate(livres)}>
                {mutVarios.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}Adicionar selecionados{livres.length ? ` (${livres.length}) · coleta inicial ≈ US$ ${(livres.length * estColetaUsd).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} (≈ ${brl(livres.length * estColetaUsd * USD_BRL)})` : ""}
              </Button>
            )}
          </div>
          <div className="panel overflow-x-auto p-0">
            <Table>
              <TableHeader className="bg-secondary/60">
                <TableRow className="hover:bg-transparent">
                  {podeEditar && <TableHead className="w-8 px-3" />}
                  <TableHead className="w-6 px-1" />
                  <TableHead className="px-3 text-xs font-semibold">Criador</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Seguidores</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Receita em vídeo</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">% em vídeo</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Receita total</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Vendas</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Crescimento</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold" title="Receita a cada 1.000 views">R$/mil views</TableHead>
                  <TableHead className="px-3 text-right text-xs font-semibold">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => {
                  const ja = acompanhados.has(c.handle);
                  const exp = aberto === c.id;
                  return (
                    <Fragment key={c.id}>
                      <TableRow className="cursor-pointer" onClick={() => setAberto(exp ? null : c.id)}>
                        {podeEditar && <TableCell className="px-3" onClick={(e) => e.stopPropagation()}><Checkbox aria-label="Selecionar" disabled={ja} checked={sel.has(c.handle)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(c.handle); else n.delete(c.handle); return n; })} /></TableCell>}
                        <TableCell className="px-1">{exp ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                        <TableCell className="px-3">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold uppercase">{(c.nome || c.handle).slice(0, 1)}</span>
                            <div className="min-w-0"><p className="truncate text-sm font-medium">@{c.handle}</p><p className="truncate text-xs text-muted-foreground">{c.nome ?? ""}</p></div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{compacto(c.seguidores)}</TableCell>
                        <TableCell className="px-3 text-right text-sm font-medium tabular-nums">{brl(c.receitaVideo)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{c.pctVideo == null ? "—" : `${c.pctVideo.toLocaleString("pt-BR")}%`}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{brl(c.receita)}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{fmt(c.vendas)}</TableCell>
                        <TableCell className={`px-3 text-right text-sm tabular-nums ${c.crescimento != null && c.crescimento < 0 ? "text-primary" : ""}`}>{c.crescimento == null ? "—" : `${c.crescimento > 0 ? "+" : ""}${c.crescimento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</TableCell>
                        <TableCell className="px-3 text-right text-sm tabular-nums">{c.receitaPorMilViews == null ? "—" : brl(c.receitaPorMilViews)}</TableCell>
                        <TableCell className="px-3 text-right" onClick={(e) => e.stopPropagation()}><AddReferenciaButton handle={c.handle} jaAcompanhado={ja} compacto /></TableCell>
                      </TableRow>
                      {exp && <TableRow className="hover:bg-transparent"><TableCell colSpan={podeEditar ? 11 : 10} className="bg-secondary/30 p-4"><Ficha criador={c} periodo={periodo} /></TableCell></TableRow>}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function Ficha({ criador, periodo }: { criador: Criador; periodo: "last7Day" | "last30Day" }) {
  const { activeProfileId } = useStudio();
  const ficha = useServerFn(fichaCriador);
  const q = useQuery({ queryKey: ["ficha-criador", criador.id, periodo], queryFn: () => ficha({ data: { profileId: activeProfileId!, creatorId: criador.id, dateRange: periodo } }), staleTime: 30 * 60_000 });
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Buscando a ficha no Kalodata...</p>;
  if (q.error || !q.data) return <p className="text-sm text-muted-foreground">{actionError(q.error, "Não foi possível abrir a ficha.")}</p>;
  const f = q.data;
  const dados = [
    ["Vídeos no período", fmt(f.videosPeriodo)], ["Lives no período", fmt(f.lives)], ["Novos seguidores", fmt(f.novosSeguidores)],
    ["Ticket médio", f.ticketMedio == null ? "—" : brl(f.ticketMedio)], ["Produtos vendidos", fmt(f.produtos)], ["Lojas", fmt(f.lojas)],
    ["Receita em live", brl(criador.receitaLive)],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">{dados.map(([l, v]) => <div key={l} className="rounded-md bg-background p-2.5"><p className="text-xs text-muted-foreground">{l}</p><p className="text-sm font-semibold tabular-nums">{v}</p></div>)}</div>
        {(f.bio || f.email || f.whatsapp) && <div className="text-xs text-muted-foreground">{f.bio && <p>{f.bio}</p>}{f.email && <p>E-mail: {f.email}</p>}{f.whatsapp && <p>WhatsApp: {f.whatsapp}</p>}</div>}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Vídeos que mais venderam</p>
        {!f.videos.length ? <p className="text-sm text-muted-foreground">O Kalodata não trouxe vídeos deste criador no período.</p> : (
          <div className="space-y-1.5">{f.videos.map((v) => (
            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md bg-background p-2.5 text-sm hover:underline">
              <span className="line-clamp-1 flex-1">{v.titulo}{v.anuncio && <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">Anúncio</span>}</span>
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">{brl(v.receita)} · {compacto(v.views)} views</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ))}</div>
        )}
      </div>
    </div>
  );
}
