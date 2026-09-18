import { ChevronDown, ExternalLink, Package, TrendingUp } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/content";

export type ProductTableItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  niche?: string | null;
  category?: string | null;
  sellerName?: string | null;
  skuCount?: number | null;
  price: number;
  commission: number;
  hype: number;
  salesVolume?: number | null;
  growthRate?: number | null;
  productUrl?: string | null;
  /** Texto pronto tipo "há 3 h" com a última atualização dos dados. */
  updatedLabel?: string | null;
};

type ProductDataTableProps<T extends ProductTableItem> = {
  items: T[];
  renderActions: (item: T) => ReactNode;
};

const compactNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function productCategory(item: ProductTableItem) {
  return item.niche?.trim() || item.category?.trim() || "Não informado";
}

function commissionValue(item: ProductTableItem) {
  return item.price * (item.commission / 100);
}

function ProductImage({ item }: { item: ProductTableItem }) {
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Package className="size-5" aria-hidden="true" />
      )}
    </div>
  );
}

function ProductName({ item }: { item: ProductTableItem }) {
  return (
    <div className="min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block min-w-0 truncate font-semibold">{item.name}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{item.name}</TooltipContent>
      </Tooltip>
      {item.sellerName ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.sellerName}</span> : null}
    </div>
  );
}

function HypeScore({ value }: { value: number }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2 tabular-nums">
      <div className="h-1.5 min-w-14 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${safeValue}%` }} />
      </div>
      <b className="w-7 text-right text-xs">{Math.round(safeValue)}</b>
    </div>
  );
}

function Commission({ item, detailed = false }: { item: ProductTableItem; detailed?: boolean }) {
  const earned = commissionValue(item);
  return detailed ? (
    <span className="font-semibold tabular-nums">
      {formatPrice(item.price)} × {item.commission}% = <span className="text-primary">{formatPrice(earned)} por venda</span>
    </span>
  ) : (
    <div className="leading-tight tabular-nums">
      <div className="font-semibold">{item.commission}%</div>
      <div className="mt-1 whitespace-nowrap text-[11px] font-semibold text-primary">Você ganha {formatPrice(earned)}</div>
    </div>
  );
}

function Details({ item }: { item: ProductTableItem }) {
  return (
    <div className="grid gap-x-8 gap-y-4 rounded-lg bg-muted/45 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 sm:col-span-2 xl:col-span-4">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Produto</p>
        <p className="mt-1 break-words text-sm font-semibold">{item.name}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Categoria / nicho</p>
        <p className="mt-1 text-sm">{productCategory(item)}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Vendedor</p>
        <p className="mt-1 text-sm">
          {item.sellerName?.trim() || "Não informado"}
          {item.skuCount ? <span className="ml-2 text-muted-foreground">{item.skuCount} SKU(s)</span> : null}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Desempenho</p>
        <p className="mt-1 flex items-center gap-3 text-sm tabular-nums">
          <span>{compactNumber(item.salesVolume ?? 0)} vendas</span>
          <span className="inline-flex items-center gap-1"><TrendingUp className="size-3.5 text-primary" />{Math.round(item.growthRate ?? 0)}%</span>
        </p>
        {item.updatedLabel ? <p className="mt-1 text-[11px] text-muted-foreground">Atualizado {item.updatedLabel}</p> : null}
      </div>
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Comissão por unidade</p>
        <p className="mt-1 text-sm"><Commission item={item} detailed /></p>
      </div>
      <div className="sm:col-span-2 xl:col-span-4">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Link do produto</p>
        {item.productUrl ? (
          <a href={item.productUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <span className="truncate">{item.productUrl}</span><ExternalLink className="size-3.5 shrink-0" />
          </a>
        ) : <p className="mt-1 text-sm text-muted-foreground">Não informado</p>}
      </div>
    </div>
  );
}

export function ProductDataTable<T extends ProductTableItem>({ items, renderActions }: ProductDataTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-10" /><col className="w-16" /><col /><col className="w-32" />
            <col className="w-24" /><col className="w-40" /><col className="w-32" /><col className="w-36" />
          </colgroup>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-1 pb-3"><span className="sr-only">Expandir</span></th>
              <th className="px-2 pb-3 font-medium">Foto</th>
              <th className="px-3 pb-3 font-medium">Produto</th>
              <th className="px-3 pb-3 font-medium">Nicho</th>
              <th className="px-3 pb-3 text-right font-medium">Preço</th>
              <th className="px-3 pb-3 font-medium">Comissão</th>
              <th className="px-3 pb-3 font-medium">Hype score</th>
              <th className="px-1 pb-3 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isExpanded = expanded.has(item.id);
              return (
                <Fragment key={item.id}>
                  <tr className="border-b align-middle last:border-0">
                    <td className="px-1 py-2">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => toggle(item.id)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${item.name}`}>
                        <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </Button>
                    </td>
                    <td className="px-2 py-2"><ProductImage item={item} /></td>
                    <td className="min-w-0 px-3 py-2"><ProductName item={item} /></td>
                    <td className="px-3 py-2"><span className="block truncate text-muted-foreground" title={productCategory(item)}>{productCategory(item)}</span></td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPrice(item.price)}</td>
                    <td className="px-3 py-2"><Commission item={item} /></td>
                    <td className="px-3 py-2"><HypeScore value={item.hype} /></td>
                    <td className="px-1 py-2"><div className="flex items-center justify-end gap-2">{renderActions(item)}</div></td>
                  </tr>
                  {isExpanded && <tr className="border-b"><td colSpan={8} className="px-3 py-3"><Details item={item} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {items.map((item) => {
          const isExpanded = expanded.has(item.id);
          return (
            <article key={item.id} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="grid grid-cols-[auto_48px_minmax(0,1fr)_auto] items-center gap-2">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => toggle(item.id)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${item.name}`}>
                  <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </Button>
                <ProductImage item={item} />
                <div className="min-w-0">
                  <ProductName item={item} />
                  <p className="mt-1 truncate text-xs text-muted-foreground">{productCategory(item)}</p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">{renderActions(item)}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-3">
                <div><p className="text-muted-foreground">Preço</p><p className="mt-1 font-semibold tabular-nums">{formatPrice(item.price)}</p></div>
                <div><p className="text-muted-foreground">Comissão</p><div className="mt-1"><Commission item={item} /></div></div>
                <div className="col-span-2 sm:col-span-1"><p className="text-muted-foreground">Hype score</p><div className="mt-2"><HypeScore value={item.hype} /></div></div>
              </div>
              {isExpanded && <div className="mt-3 border-t pt-3"><Details item={item} /></div>}
            </article>
          );
        })}
      </div>
    </TooltipProvider>
  );
}