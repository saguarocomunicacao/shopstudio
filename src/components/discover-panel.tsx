import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Info, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { discoverProducts } from "@/lib/discover.functions";
import { useCategories, type DbProduct } from "@/lib/content";
import { ProductDataTable } from "./product-data-table";
import { SearchCostHistory } from "./search-cost-history";
import { useStudio } from "./studio-context";

type Found = {
  externalId: string; source: string; name: string; price: number; commission: number;
  salesVolume: number; growthRate: number; revenue: number; imageUrl: string; sellerName: string;
  skuCount?: number; category: string; productUrl: string; hype: number;
};

type Filters = {
  keyword: string;
  periodo: string; // lastDay | last7Day | last30Day | custom
  de: string;
  ate: string;
  ordenar: string;
  direcao: "ASC" | "DESC";
  precoMin: string; precoMax: string;
  comMin: string; comMax: string;
  recMin: string; recMax: string;
  lancamento: string; // "" | <3 | <7 | <30 | >30
  envio: string; // "" | local | global
  semVenda: boolean;
};

const EMPTY: Filters = {
  keyword: "", periodo: "last7Day", de: "", ate: "", ordenar: "revenue", direcao: "DESC",
  precoMin: "", precoMax: "", comMin: "", comMax: "", recMin: "", recMax: "",
  lancamento: "", envio: "", semVenda: false,
};

const URL_KEYS: Record<keyof Filters, string> = {
  keyword: "q", periodo: "periodo", de: "de", ate: "ate", ordenar: "ordenar", direcao: "dir",
  precoMin: "preco_min", precoMax: "preco_max", comMin: "com_min", comMax: "com_max",
  recMin: "rec_min", recMax: "rec_max", lancamento: "lancamento", envio: "envio", semVenda: "sem_venda",
};

const numeric = (value: string) => value.replace(/[^\d.]/g, "");
const limit100 = (value: string) => {
  const n = numeric(value);
  return n && Number(n) > 100 ? "100" : n;
};
// Valor monetário guardado como número puro ("1234.56"); exibido com máscara BRL ("1.234,56").
const formatMoney = (v: string) =>
  v ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
const parseMoney = (input: string) => {
  const digits = input.replace(/\D/g, "");
  return digits ? String(Number(digits) / 100) : "";
};

/** Monta a faixa aceita pela API: "1-1000", ">1" ou "<1000". */
function faixa(min: string, max: string): string | undefined {
  const a = numeric(min), b = numeric(max);
  if (a && b) return `${a}-${b}`;
  if (a) return `>${a}`;
  if (b) return `<${b}`;
  return undefined;
}

function readFilters(): Filters {
  if (typeof window === "undefined") return EMPTY;
  const p = new URL(window.location.href).searchParams;
  const get = (key: string, fallback: string) => p.get(key) ?? fallback;
  return {
    keyword: get("q", ""),
    periodo: get("periodo", "last7Day"),
    de: get("de", ""),
    ate: get("ate", ""),
    ordenar: get("ordenar", "revenue"),
    direcao: get("dir", "DESC") === "ASC" ? "ASC" : "DESC",
    precoMin: get("preco_min", ""), precoMax: get("preco_max", ""),
    comMin: get("com_min", ""), comMax: get("com_max", ""),
    recMin: get("rec_min", ""), recMax: get("rec_max", ""),
    lancamento: get("lancamento", ""), envio: get("envio", ""),
    semVenda: p.get("sem_venda") === "1",
  };
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a busca.");

const ORDER_OPTIONS: [string, string][] = [
  ["revenue", "Receita"],
  ["commission_rate", "Comissão"],
  ["revenue_growth_rate", "Crescimento"],
  ["sales_volumn", "Vendas"],
  ["unit_price", "Preço"],
  ["video_revenue", "Receita de vídeo"],
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild><button type="button" aria-label={hint}><Info className="size-3.5" /></button></TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </Label>
      {children}
    </div>
  );
}

function RangeInputs({ min, max, onMin, onMax, placeholderMin, placeholderMax, money, percent }: {
  min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void;
  placeholderMin: string; placeholderMax: string;
  money?: boolean; percent?: boolean;
}) {
  const display = (v: string) => (money ? formatMoney(v) : v);
  const parse = (v: string) => (money ? parseMoney(v) : percent ? limit100(v) : numeric(v));
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input inputMode="numeric" value={display(min)} onChange={(e) => onMin(parse(e.target.value))} placeholder={placeholderMin} />
      <Input inputMode="numeric" value={display(max)} onChange={(e) => onMax(parse(e.target.value))} placeholder={placeholderMax} />
    </div>
  );
}

export function DiscoverPanel({ products }: { products: DbProduct[] }) {
  const { can, userId, activeProfileId } = useStudio();
  const qc = useQueryClient();
  const canCreate = can("produtos", "criar");
  const { data: categories = [] } = useCategories();
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const categoryIdFor = (name: string) =>
    categories.find((c) => normalize(c.category_name) === normalize(name))?.category_id ?? null;
  const search = useServerFn(discoverProducts);

  const [filters, setFilters] = useState<Filters>(readFilters);
  const [results, setResults] = useState<Found[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const searchId = useRef(0);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    // Mudou filtro: resultados antigos deixam de valer.
    searchId.current += 1;
    setResults(null);
    setPage(1);
    setHasMore(false);
    setSelected({});
  };

  // Filtros ficam na querystring para o link ser compartilhável.
  useEffect(() => {
    const url = new URL(window.location.href);
    (Object.keys(URL_KEYS) as (keyof Filters)[]).forEach((key) => {
      const param = URL_KEYS[key];
      const value = filters[key];
      const text = typeof value === "boolean" ? (value ? "1" : "") : value;
      if (text && text !== EMPTY[key]) url.searchParams.set(param, text);
      else url.searchParams.delete(param);
    });
    window.history.replaceState(window.history.state, "", url.toString());
  }, [filters]);

  const saved = new Set(products.filter((p) => p.external_id).map((p) => `${p.source}:${p.external_id}`));

  const dateRange = () => {
    if (filters.periodo !== "custom") return filters.periodo;
    if (!filters.de || !filters.ate) return null;
    const dias = (new Date(filters.ate).getTime() - new Date(filters.de).getTime()) / 86_400_000;
    if (Number.isNaN(dias) || dias < 0) return null;
    if (dias > 30) return "excede";
    return `${filters.de}~${filters.ate}`;
  };

  const run = useMutation({
    mutationFn: async ({ nextPage, id, range }: { nextPage: number; id: number; range: string }) => ({
      page: nextPage,
      id,
      ...((await search({
        data: {
          keyword: filters.keyword,
          dateRange: range,
          sortField: filters.ordenar as "revenue",
          sortType: filters.direcao,
          needAll: filters.semVenda,
          page: nextPage,
          profileId: activeProfileId,
          ...(faixa(filters.precoMin, filters.precoMax) ? { unitPriceRange: faixa(filters.precoMin, filters.precoMax) } : {}),
          ...(faixa(filters.comMin, filters.comMax) ? { commissionRate: faixa(filters.comMin, filters.comMax) } : {}),
          ...(faixa(filters.recMin, filters.recMax) ? { revenueRange: faixa(filters.recMin, filters.recMax) } : {}),
          ...(filters.lancamento ? { launchDate: filters.lancamento as "<3" } : {}),
          ...(filters.envio ? { deliveryType: filters.envio as "local" } : {}),
        },
      })) as { items: Found[]; hasMore: boolean }),
    }),
    onSuccess: (data) => {
      if (data.id !== searchId.current) return; // resposta atrasada de busca anterior
      setPage(data.page);
      setHasMore(data.hasMore);
      setResults((prev) => (data.page > 1 && prev ? [...prev, ...data.items] : data.items));
      if (data.page === 1) setSelected({});
      if (!data.items.length && data.page === 1) toast.info("Nenhum produto encontrado com esses filtros.");
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const startSearch = () => {
    const range = dateRange();
    if (range === "excede") { toast.error("O intervalo personalizado pode ter no máximo 30 dias."); return; }
    if (!range) { toast.error("Informe as datas de início e fim do período."); return; }
    searchId.current += 1;
    setResults(null);
    setPage(1);
    setHasMore(false);
    setSelected({});
    run.mutate({ nextPage: 1, id: searchId.current, range });
  };

  const save = useMutation({
    mutationFn: async (items: Found[]) => {
      const seen = new Set<string>();
      const fresh = items.filter((i) => {
        const key = `${i.source}:${i.externalId}`;
        if (saved.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) throw new Error("Todos os selecionados já estão no catálogo.");
      const { error } = await supabase.from("products").upsert(
        fresh.map((i) => ({
          name: i.name,
          niche: i.category,
          category_id: categoryIdFor(i.category),
          price: i.price,
          commission: i.commission,
          url: i.productUrl,
          hype: i.hype,
          status: "Ativo",
          image_url: i.imageUrl,
          seller_name: i.sellerName,
          sales_volume: i.salesVolume,
          growth_rate: i.growthRate,
          revenue: i.revenue,
          origin: "garimpo",
          source: i.source,
          external_id: i.externalId,
          created_by: userId,
          profile_id: activeProfileId,
        })),
        { onConflict: "profile_id,source,external_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} produto(s) salvo(s) no catálogo.`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const selectedItems = (results ?? []).filter((r) => selected[r.externalId]);
  const filtrosAtivos = (Object.keys(EMPTY) as (keyof Filters)[]).some((k) => filters[k] !== EMPTY[k]);

  const repetir = (termo: string) => {
    searchId.current += 1;
    setFilters((current) => ({ ...current, keyword: termo }));
    setResults(null);
    setPage(1);
    setHasMore(false);
    setSelected({});
    const range = dateRange();
    if (range === "excede") { toast.error("O intervalo personalizado pode ter no máximo 30 dias."); return; }
    if (!range) { toast.error("Informe as datas de início e fim do período."); return; }
    run.mutate({ nextPage: 1, id: searchId.current, range });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input value={filters.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Buscar por palavra-chave (opcional)" onKeyDown={(e) => e.key === "Enter" && startSearch()} />
              <Button disabled={run.isPending && page === 1} onClick={startSearch}>
                {run.isPending && page === 1 ? <Loader2 className="animate-spin" /> : <Search />}Buscar
              </Button>
            </div>
            <SearchCostHistory onRepeat={repetir} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Período">
              <Select value={filters.periodo} onValueChange={(v) => set("periodo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastDay">Último dia</SelectItem>
                  <SelectItem value="last7Day">Últimos 7 dias</SelectItem>
                  <SelectItem value="last30Day">Últimos 30 dias</SelectItem>
                  <SelectItem value="custom">Intervalo personalizado</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {filters.periodo === "custom" && (
              <Field label="Intervalo (máx. 30 dias)">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={filters.de} onChange={(e) => set("de", e.target.value)} />
                  <Input type="date" value={filters.ate} onChange={(e) => set("ate", e.target.value)} />
                </div>
              </Field>
            )}

            <Field label="Ordenar por" hint="Crescimento e vendas são apenas ordenação — a fonte não permite filtrar por faixa desses dois.">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Select value={filters.ordenar} onValueChange={(v) => set("ordenar", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.direcao} onValueChange={(v) => set("direcao", v as "ASC" | "DESC")}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DESC">Maior</SelectItem>
                    <SelectItem value="ASC">Menor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Field label="Preço (R$)">
              <RangeInputs min={filters.precoMin} max={filters.precoMax} onMin={(v) => set("precoMin", v)} onMax={(v) => set("precoMax", v)} placeholderMin="mín" placeholderMax="máx" />
            </Field>

            <Field label="Comissão (%)">
              <RangeInputs min={filters.comMin} max={filters.comMax} onMin={(v) => set("comMin", v)} onMax={(v) => set("comMax", v)} placeholderMin="mín" placeholderMax="máx" />
            </Field>

            <Field label="Receita (R$)">
              <RangeInputs min={filters.recMin} max={filters.recMax} onMin={(v) => set("recMin", v)} onMax={(v) => set("recMax", v)} placeholderMin="mín" placeholderMax="máx" />
            </Field>

            <Field label="Lançamento">
              <Select value={filters.lancamento || "any"} onValueChange={(v) => set("lancamento", v === "any" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer data</SelectItem>
                  <SelectItem value="<3">Últimos 3 dias</SelectItem>
                  <SelectItem value="<7">Últimos 7 dias</SelectItem>
                  <SelectItem value="<30">Últimos 30 dias</SelectItem>
                  <SelectItem value=">30">Mais de 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tipo de envio">
              <Select value={filters.envio || "all"} onValueChange={(v) => set("envio", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="local">Nacional</SelectItem>
                  <SelectItem value="global">Transfronteiriço</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={filters.semVenda} onCheckedChange={(v) => set("semVenda", !!v)} />
              Incluir produtos sem venda no período
            </label>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">Somente produtos afiliáveis do Brasil.</p>
              {filtrosAtivos && (
                <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}><X />Limpar filtros</Button>
              )}
            </div>
          </div>
        </div>

        {canCreate && selectedItems.length > 0 && (
          <div className="panel flex items-center justify-between gap-4">
            <p className="text-sm font-semibold">{selectedItems.length} selecionado(s)</p>
            <Button disabled={save.isPending} onClick={() => save.mutate(selectedItems)}><Check />Salvar selecionados</Button>
          </div>
        )}

        {run.isPending && page === 1 && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Garimpando produtos em alta...</div>}

        {results !== null && results.length > 0 && (
          <div className="panel">
            <ProductDataTable
              items={results.map((item) => ({ ...item, id: `${item.source}:${item.externalId}`, niche: item.category }))}
              renderActions={(item) => {
                const already = saved.has(`${item.source}:${item.externalId}`);
                if (!canCreate) return null;
                return already ? (
                  <span className="shrink-0 text-[11px] font-bold text-muted-foreground">No catálogo</span>
                ) : (
                  <Checkbox
                    aria-label={`Selecionar ${item.name}`}
                    checked={!!selected[item.externalId]}
                    onCheckedChange={(value) => setSelected((current) => ({ ...current, [item.externalId]: !!value }))}
                  />
                );
              }}
            />
          </div>
        )}

        {results !== null && hasMore && (
          <div className="flex justify-center">
            <Button variant="secondary" disabled={run.isPending} onClick={() => {
              const range = dateRange();
              if (!range || range === "excede") return;
              run.mutate({ nextPage: page + 1, id: searchId.current, range });
            }}>Carregar mais</Button>
          </div>
        )}

        {!run.isPending && results === null && (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Busque produtos em alta do TikTok Shop Brasil — só itens com programa de afiliado.
          </div>
        )}

      </div>
    </TooltipProvider>
  );
}
