import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, type DbProduct } from "@/lib/content";
import { CategorySelect } from "./category-select";
import { DiscoverPanel } from "./discover-panel";
import { ProductDataTable } from "./product-data-table";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase text-primary">{eyebrow}</p><h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1></div>{action}</div>;
}

type FormState = { name: string; niche: string; categoryId: string; price: string; commission: string; url: string; hype: string; status: string };
const emptyForm: FormState = { name: "", niche: "", categoryId: "", price: "", commission: "", url: "", hype: "50", status: "Ativo" };


// Mascara o valor digitado no formato BRL (R$ 1.234,56) enquanto o usuario digita.
function maskPrice(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = Number(digits) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parsePrice(masked: string): number {
  const digits = masked.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

// Comissao: apenas inteiros de 0 a 100.
function maskCommission(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = Math.min(100, Math.max(0, Number(digits)));
  return String(num);
}

export function ProductsPage() { return <ProfileGate><ProductsContent /></ProfileGate>; }

function ProductsContent() {
  const { can, userId, activeProfileId, activeProfile } = useStudio();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts(activeProfileId, can("produtos", "visualizar"));

  const canCreate = can("produtos", "criar");
  const canEdit = can("produtos", "editar");
  const canRemove = can("produtos", "remover");

  const [dialog, setDialog] = useState<{ open: boolean; product: DbProduct | null }>({ open: false, product: null });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirm, setConfirm] = useState<DbProduct | null>(null);
  const [tab, setTab] = useState<"catalogo" | "descobrir">("catalogo");
  const [useTarget, setUseTarget] = useState<DbProduct | null>(null);

  const canCreateJob = can("pipeline", "criar", activeProfileId);

  useEffect(() => {
    if (!dialog.open) return;
    const p = dialog.product;
    setForm(p ? { name: p.name, niche: p.niche, categoryId: p.category_id ?? "", price: maskPrice(String(p.price * 100)), commission: String(Math.min(100, Math.max(0, Math.round(p.commission)))), url: p.url, hype: String(p.hype), status: p.status } : emptyForm);
  }, [dialog]);

  const save = useMutation({
    mutationFn: async ({ product, values }: { product: DbProduct | null; values: FormState }) => {
      const payload = {
        name: values.name.trim(),
        niche: values.niche.trim(),
        category_id: values.categoryId || null,
        price: parsePrice(values.price),
        commission: Number(values.commission) || 0,
        url: values.url.trim(),
        hype: Math.min(100, Math.max(0, Number.parseInt(values.hype, 10) || 0)),
        status: values.status,
      };
      if (!payload.name) throw new Error("Informe o nome do produto.");
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("products").insert({ ...payload, created_by: userId, profile_id: activeProfileId });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.product ? "Produto atualizado." : "Produto adicionado.");
      setDialog({ open: false, product: null });
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (product: DbProduct) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Produto removido."); setConfirm(null); qc.invalidateQueries({ queryKey: ["products", activeProfileId] }); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const createJob = useMutation({
    mutationFn: async ({ product, profileId }: { product: DbProduct; profileId: string | null }) => {
      if (!profileId) throw new Error("Selecione um perfil no seletor acima.");
      const { error } = await supabase.from("jobs").insert({
        product_id: product.id,
        profile_id: profileId,
        status: "produto_escolhido",
        title: product.name,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Job criado no pipeline."); setUseTarget(null); qc.invalidateQueries({ queryKey: ["jobs", activeProfileId] }); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <>
      <Heading
        eyebrow="Descoberta"
        title="Produtos em alta"
        {...(canCreate && tab === "catalogo" ? { action: <Button onClick={() => setDialog({ open: true, product: null })}><Plus />Adicionar produto</Button> } : {})}
      />
      <div className="mb-4 inline-flex gap-1 rounded-xl bg-secondary p-1">
        {([["catalogo", "Catálogo"], ["descobrir", "Descobrir"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === key ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "descobrir" && <DiscoverPanel products={products} />}

      <div className={`panel ${tab === "catalogo" ? "" : "hidden"}`}>
        <ProductDataTable
          items={products.map((p) => ({ ...p, imageUrl: p.image_url, productUrl: p.url }))}
          renderActions={(p) => (
            <>
              {canCreateJob && <Button size="sm" onClick={() => setUseTarget(p)}><Sparkles />Usar</Button>}
               {canEdit && (
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <Button variant="ghost" size="icon" className="size-8" onClick={() => setDialog({ open: true, product: p })} aria-label={`Editar ${p.name}`}>
                       <Pencil className="size-4" />
                     </Button>
                   </TooltipTrigger>
                   <TooltipContent>Editar</TooltipContent>
                 </Tooltip>
               )}
               {canRemove && (
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setConfirm(p)} aria-label={`Remover ${p.name}`}>
                       <Trash2 className="size-4" />
                     </Button>
                   </TooltipTrigger>
                   <TooltipContent>Remover</TooltipContent>
                 </Tooltip>
               )}
            </>
          )}
        />
        {!products.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isLoading ? "Carregando produtos..." : "Nenhum produto no catálogo."}</div>}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, product: open ? dialog.product : null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog.product ? "Editar produto" : "Adicionar produto"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="pr-name">Nome</Label><Input id="pr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bolsa Vitta" /></div>
            <div className="grid gap-2"><Label htmlFor="pr-niche">Categoria oficial</Label><CategorySelect id="pr-niche" value={form.categoryId} onChange={(categoryId, categoryName) => setForm({ ...form, categoryId, niche: categoryName })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="pr-price">Preço</Label><Input id="pr-price" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: maskPrice(e.target.value) })} placeholder="R$ 0,00" /></div>
              <div className="grid gap-2"><Label htmlFor="pr-comm">Comissão (%)</Label><Input id="pr-comm" inputMode="numeric" value={form.commission} onChange={(e) => setForm({ ...form, commission: maskCommission(e.target.value) })} placeholder="0 a 100" /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="pr-url">Link do produto</Label><Input id="pr-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="pr-hype">Hype score (0-100)</Label><Input id="pr-hype" inputMode="numeric" value={form.hype} onChange={(e) => setForm({ ...form, hype: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="grid gap-2">
                <Label htmlFor="pr-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pr-status"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Pausado">Pausado</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false, product: null })}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate({ product: dialog.product, values: form })}>{dialog.product ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!useTarget} onOpenChange={(open) => !open && setUseTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Usar “{useTarget?.name}”</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">O job nasce na etapa “Produto escolhido” dentro do perfil <strong className="text-foreground">{activeProfile?.name}</strong>.</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUseTarget(null)}>Cancelar</Button>
            <Button disabled={createJob.isPending} onClick={() => useTarget && createJob.mutate({ product: useTarget, profileId: activeProfileId })}>Criar job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>O produto sai do catálogo. Jobs já criados continuam existindo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (confirm) remove.mutate(confirm); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
