import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Radar } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { discoverProducts, enrichProductDetails } from "@/lib/discover.functions";
import { useCategories, type DbProduct } from "@/lib/content";
import { ascensionScore } from "@/lib/radar";
import { ProductDataTable } from "./product-data-table";
import { useStudio } from "./studio-context";

type Found = {
  externalId: string; source: string; name: string; price: number; commission: number;
  salesVolume: number; growthRate: number; revenue: number; imageUrl: string; sellerName: string;
  skuCount?: number; category: string; productUrl: string; hype: number;
};

type Scored = Found & { risingScore: number };

const numeric = (value: string) => value.replace(/[^\d.]/g, "");
const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a busca.");

// Quantas páginas do Kalodata puxamos para montar o pool antes de pontuar.
const POOL_PAGES = 3;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function RisingRadarPanel({ products }: { products: DbProduct[] }) {
  const { can, userId, activeProfileId } = useStudio();
  const qc = useQueryClient();
  const canCreate = can("produtos", "criar");
  const { data: categories = [] } = useCategories();
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const categoryIdFor = (name: string) =>
    categories.find((c) => normalize(c.category_name) === normalize(name))?.category_id ?? null;
  const search = useServerFn(discoverProducts);
  const enrichDetails = useServerFn(enrichProductDetails);

  const [periodo, setPeriodo] = useState("last7Day");
  const [crescimentoMin, setCrescimentoMin] = useState("50");
  const [comissaoMin, setComissaoMin] = useState("5");
  const [vendasMax, setVendasMax] = useState("3000");
  const [receitaMax, setReceitaMax] = useState("");
  const [lancamento, setLancamento] = useState(""); // "" | "<7" | "<30"
  const [categoria, setCategoria] = useState("");
  const [results, setResults] = useState<Scored[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const saved = new Set(products.filter((p) => p.external_id).map((p) => `${p.source}:${p.external_id}`));

  const run = useMutation({
    mutationFn: async () => {
      const minCommission = Number(numeric(comissaoMin) || "0");
      const pool: Found[] = [];
      for (let page = 1; page <= POOL_PAGES; page += 1) {
        const res = (await search({
          data: {
            dateRange: periodo,
            // Estratégia do radar: puxar quem mais cresce, não quem mais fatura.
            sortField: "revenue_growth_rate" as const,
            sortType: "DESC" as const,
            needAll: false,
            page,
            profileId: activeProfileId,
            ...(lancamento ? { launchDate: lancamento as "<7" } : {}),
            ...(categoria ? { categoryIds: [categoria] } : {}),
            ...(minCommission > 0 ? { commissionRate: `>${minCommission}` } : {}),
            ...(receitaMax && numeric(receitaMax) ? { revenueRange: `<${numeric(receitaMax)}` } : {}),
          },
        })) as { items: Found[]; hasMore: boolean };
        pool.push(...res.items);
        if (!res.hasMore) break;
      }
      return pool;
    },
    onSuccess: (pool) => {
      const minGrowth = Number(numeric(crescimentoMin) || "0");
      const minCommission = Number(numeric(comissaoMin) || "0");
      const maxSales = numeric(vendasMax) ? Number(numeric(vendasMax)) : Infinity;
      const maxRevenue = numeric(receitaMax) ? Number(numeric(receitaMax)) : Infinity;
      const seen = new Set<string>();
      const scored = pool
        .filter((item) => {
          const key = `${item.source}:${item.externalId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return (
            item.growthRate >= minGrowth &&
            item.commission > 0 &&
            item.commission >= minCommission &&
            item.salesVolume <= maxSales &&
            item.revenue <= maxRevenue
          );
        })
        .map((item) => ({
          ...item,
          risingScore: ascensionScore({
            growthRate: item.growthRate,
            salesVolume: item.salesVolume,
            revenue: item.revenue,
            commission: item.commission,
            recentLaunch: !!lancamento,
          }),
        }))
        .sort((a, b) => b.risingScore - a.risingScore);
      setResults(scored);
      setSelected({});
      if (!scored.length) toast.info("Nenhum produto emergente com esses critérios. Reduza o crescimento ou a comissão mínima.");
    },
    onError: (e) => toast.error(errMessage(e)),
  });


  /** Grava os produtos no catálogo do perfil ativo e devolve as linhas salvas. */
  const saveToCatalog = async (items: Scored[]) => {
    const { error } = await supabase.from("products").upsert(
      items.map((i) => ({
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

    const { data: rows } = await supabase
      .from("products")
      .select("id, external_id, description")
      .eq("profile_id", activeProfileId ?? "")
      .in("external_id", items.map((i) => i.externalId));
    const found = rows ?? [];
    const ids = found.filter((r) => !r.description).map((r) => r.id).slice(0, 20);
    if (ids.length) {
      try {
        await enrichDetails({ data: { productIds: ids } });
      } catch {
        // Detalhe indisponível não impede o uso do produto.
      }
    }
    return found;
  };

  const save = useMutation({
    mutationFn: async (items: Scored[]) => {
      const seen = new Set<string>();
      const fresh = items.filter((i) => {
        const key = `${i.source}:${i.externalId}`;
        if (saved.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) throw new Error("Todos os selecionados já estão no catálogo.");
      await saveToCatalog(fresh);
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} produto(s) salvo(s) no catálogo.`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  /** "Usar": salva no catálogo (se preciso) e já cria o job no perfil ativo. */
  const use = useMutation({
    mutationFn: async (item: Scored) => {
      if (!activeProfileId) throw new Error("Selecione um perfil no seletor acima.");
      const rows = await saveToCatalog([item]);
      const row = rows.find((r) => r.external_id === item.externalId);
      if (!row) throw new Error("Não foi possível salvar o produto no catálogo.");
      const { error } = await supabase.from("jobs").insert({
        product_id: row.id,
        profile_id: activeProfileId,
        status: "produto_escolhido",
        title: item.name,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Job criado na etapa “Produto escolhido”.");
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
      qc.invalidateQueries({ queryKey: ["jobs", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const selectedItems = (results ?? []).filter((r) => selected[r.externalId]);


  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold"><Radar className="size-4 text-primary" />Radar de emergentes</p>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Prioriza produtos crescendo rápido que ainda vendem pouco — antes do pico de saturação.
            </p>
          </div>
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <Radar />}Rastrear emergentes
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Período">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lastDay">Último dia</SelectItem>
                <SelectItem value="last7Day">Últimos 7 dias</SelectItem>
                <SelectItem value="last30Day">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Crescimento mínimo (%)">
            <Input inputMode="numeric" value={crescimentoMin} onChange={(e) => setCrescimentoMin(numeric(e.target.value))} placeholder="ex.: 50" />
          </Field>

          <Field label="Comissão mínima (%)">
            <Input inputMode="numeric" value={comissaoMin} onChange={(e) => setComissaoMin(numeric(e.target.value))} placeholder="ex.: 5" />
          </Field>


          <Field label="Teto de vendas (unidades)">
            <Input inputMode="numeric" value={vendasMax} onChange={(e) => setVendasMax(numeric(e.target.value))} placeholder="ex.: 3000" />
          </Field>

          <Field label="Teto de receita (R$)">
            <Input inputMode="numeric" value={receitaMax} onChange={(e) => setReceitaMax(numeric(e.target.value))} placeholder="sem limite" />
          </Field>

          <Field label="Lançamento recente">
            <Select value={lancamento || "any"} onValueChange={(v) => setLancamento(v === "any" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer data</SelectItem>
                <SelectItem value="<7">Lançados nos últimos 7 dias</SelectItem>
                <SelectItem value="<30">Lançados nos últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Categoria">
            <Select value={categoria || "all"} onValueChange={(v) => setCategoria(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <p className="text-xs text-muted-foreground">Somente produtos afiliáveis do Brasil. Ordenado pelo score de ascensão.</p>
      </div>

      {canCreate && selectedItems.length > 0 && (
        <div className="panel flex items-center justify-between gap-4">
          <p className="text-sm font-semibold">{selectedItems.length} selecionado(s)</p>
          <Button disabled={save.isPending} onClick={() => save.mutate(selectedItems)}><Check />Salvar selecionados</Button>
        </div>
      )}

      {run.isPending && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Rastreando produtos em ascensão...</div>
      )}

      {!run.isPending && results !== null && results.length > 0 && (
        <div className="panel">
          <ProductDataTable
            variant="rising"
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

      {!run.isPending && results === null && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Calibre os filtros e rastreie produtos que estão começando a subir no TikTok Shop Brasil.
        </div>
      )}
    </div>
  );
}
