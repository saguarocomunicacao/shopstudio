import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { discoverProducts } from "@/lib/discover.functions";
import { useCategories, type DbProduct } from "@/lib/content";
import { ProductDataTable } from "./product-data-table";
import { useStudio } from "./studio-context";

type Found = {
  externalId: string; source: string; name: string; price: number; commission: number;
  salesVolume: number; growthRate: number; revenue: number; imageUrl: string; sellerName: string;
  category: string; productUrl: string; hype: number;
};

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a busca.");
export function DiscoverPanel({ products }: { products: DbProduct[] }) {
  const { can, userId, activeProfileId } = useStudio();
  const qc = useQueryClient();
  const canCreate = can("produtos", "criar");
  const { data: categories = [] } = useCategories();
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const categoryIdFor = (name: string) =>
    categories.find((c) => normalize(c.category_name) === normalize(name))?.category_id ?? null;
  const search = useServerFn(discoverProducts);

  const [keyword, setKeyword] = useState("");
  const [dateRange, setDateRange] = useState<"lastDay" | "last7Day" | "last30Day">("last7Day");
  const [sortField, setSortField] = useState<"revenue" | "sales_volumn" | "revenue_growth_rate">("revenue");
  const [results, setResults] = useState<Found[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const searchId = useRef(0);

  const saved = new Set(products.filter((p) => p.external_id).map((p) => `${p.source}:${p.external_id}`));

  const run = useMutation({
    mutationFn: async ({ nextPage, id }: { nextPage: number; id: number }) => ({
      page: nextPage,
      id,
      ...((await search({ data: { keyword, dateRange, sortField, page: nextPage } })) as { items: Found[]; hasMore: boolean }),
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
    searchId.current += 1;
    setResults(null);
    setPage(1);
    setHasMore(false);
    setSelected({});
    run.mutate({ nextPage: 1, id: searchId.current });
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

  return (
    <div className="space-y-4">
      <div className="panel grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Buscar por palavra-chave (opcional)" onKeyDown={(e) => e.key === "Enter" && startSearch()} />
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lastDay">Último dia</SelectItem>
            <SelectItem value="last7Day">Últimos 7 dias</SelectItem>
            <SelectItem value="last30Day">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Maior receita</SelectItem>
            <SelectItem value="sales_volumn">Mais vendas</SelectItem>
            <SelectItem value="revenue_growth_rate">Maior crescimento</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={run.isPending && page === 1} onClick={startSearch}>
          {run.isPending && page === 1 ? <Loader2 className="animate-spin" /> : <Search />}Buscar
        </Button>
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
          <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate(page + 1)}>Carregar mais</Button>
        </div>
      )}

      {!run.isPending && results === null && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Busque produtos em alta do TikTok Shop Brasil — só itens com programa de afiliado.
        </div>
      )}
    </div>
  );
}
