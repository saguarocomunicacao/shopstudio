import { PageHeader } from "./page-header";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Pencil, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, type DbProduct } from "@/lib/content";
import { enrichProductDetails } from "@/lib/discover.functions";
import { generateProductDescription } from "@/lib/product-description.functions";
import { DiscoverPanel } from "./discover-panel";
import { RisingRadarPanel } from "./rising-radar-panel";
import { ProductDataTable } from "./product-data-table";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";
import { actionError } from "@/lib/api-keys";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <PageHeader title={title} description={/\d/.test(eyebrow) ? eyebrow : undefined} actions={action} />;
}

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "atualizado há 3 h" a partir de um timestamp ISO. */
function atualizadoHa(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} d`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="text-sm font-medium break-words">{children}</div>
    </div>
  );
}

/** Mostra de onde veio o texto da descrição, para indicar a confiabilidade. */
function OriginBadge({ origem, temDescricao }: { origem?: string | null | undefined; temDescricao: boolean }) {
  if (!temDescricao) return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Sem descrição</span>;
  const map: Record<string, { label: string; className: string }> = {
    manual: { label: "Editada manualmente", className: "bg-primary/10 text-primary" },
    gerada_por_ia: { label: "Gerada por IA", className: "bg-secondary text-foreground" },
    kalodata: { label: "Da Kalodata", className: "bg-secondary text-muted-foreground" },
  };
  const item = map[origem ?? "kalodata"] ?? map["kalodata"]!;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>{item.label}</span>;
}

export function ProductsPage() { return <ProfileGate><ProductsContent /></ProfileGate>; }

function ProductsContent() {
  const { can, userId, activeProfileId, activeProfile } = useStudio();
  const qc = useQueryClient();
  const { data: products = [], isLoading, isError } = useProducts(activeProfileId, can("produtos", "visualizar"));

  const enrichDetails = useServerFn(enrichProductDetails);
  const generateDescription = useServerFn(generateProductDescription);

  const canRemove = can("produtos", "remover");
  const canUpdate = can("produtos", "editar");

  const [confirm, setConfirm] = useState<DbProduct | null>(null);
  const [tab, setTab] = useState<"catalogo" | "descobrir" | "ascensao">("catalogo");
  const [useTarget, setUseTarget] = useState<DbProduct | null>(null);
  const [details, setDetails] = useState<DbProduct | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  /** Formato do job: vídeo inteiro com IA ou roteiro para a pessoa gravar. */
  const [formato, setFormato] = useState<"completo" | "gravacao">("completo");

  const canCreateJob = can("pipeline", "criar", activeProfileId);

  // Mantém o modal aberto em sincronia com os dados recarregados do catálogo.
  useEffect(() => {
    setDetails((current) => (current ? products.find((p) => p.id === current.id) ?? current : current));
  }, [products]);

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
      // Produtos antigos ainda sem descrição: busca o detalhe antes de virar job.
      if (!product.description && product.external_id) {
        try {
          await enrichDetails({ data: { productIds: [product.id] } });
          qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
        } catch {
          // Segue com nome e foto principal.
        }
      }
      const { error } = await supabase.from("jobs").insert({
        product_id: product.id,
        profile_id: profileId,
        status: "produto_escolhido",
        title: product.name,
        created_by: userId,
        formato,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(formato === "gravacao" ? "Vídeo criado. Gere o roteiro e grave você mesmo." : "Job criado no pipeline.");
      setUseTarget(null);
      qc.invalidateQueries({ queryKey: ["jobs", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  /** Rebusca o detalhe do produto no Kalodata e atualiza os dados no catálogo. */
  const refreshOne = useMutation({
    mutationFn: async (product: DbProduct) => {
      setRefreshingId(product.id);
      const result = (await enrichDetails({ data: { productIds: [product.id], force: true } })) as {
        enriched: number;
      };
      if (!result?.enriched) throw new Error("A fonte não devolveu dados para este produto.");
    },
    onSuccess: () => {
      toast.success("Dados do produto atualizados.");
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setRefreshingId(null),
  });

  /** Reprocessa o catálogo inteiro em lotes, com folga no limite da fonte. */
  const refreshAll = useMutation({
    mutationFn: async () => {
      const ids = products.filter((p) => p.external_id).map((p) => p.id);
      if (!ids.length) throw new Error("Nenhum produto do garimpo para atualizar.");
      let enriched = 0;
      setBulk({ done: 0, total: ids.length });
      for (let i = 0; i < ids.length; i += 5) {
        const lote = ids.slice(i, i + 5);
        try {
          const result = (await enrichDetails({ data: { productIds: lote, force: true } })) as { enriched: number };
          enriched += result?.enriched ?? 0;
        } catch {
          // Um lote sem resposta não interrompe os demais.
        }
        setBulk({ done: Math.min(i + lote.length, ids.length), total: ids.length });
        qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
      }
      return { enriched, total: ids.length };
    },
    onSuccess: ({ enriched, total }) => toast.success(`${enriched} de ${total} produto(s) atualizado(s).`),
    onError: (e) => toast.error(errMessage(e)),
    onSettled: () => setBulk(null),
  });

  /** Gera (ou regera) a descrição do produto com IA de visão a partir das fotos. */
  const generateDesc = useMutation({
    mutationFn: async (product: DbProduct) => {
      await generateDescription({ data: { productId: product.id } });
    },
    onSuccess: () => {
      toast.success("Descrição gerada por IA.");
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  /** Descrição escrita à mão: vira origem "manual" e não é sobrescrita pelo refresh. */
  const saveDesc = useMutation({
    mutationFn: async ({ product, texto }: { product: DbProduct; texto: string }) => {
      const limpo = texto.trim();
      const { error } = await supabase
        .from("products")
        .update({ description: limpo || null, description_origem: limpo ? "manual" : null })
        .eq("id", product.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Descrição salva.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["products", activeProfileId] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });


  return (
    <>
      <Heading
        eyebrow="Descoberta"
        title="Produtos em alta"
        action={
          canUpdate && tab === "catalogo" && products.length ? (
            <Button variant="secondary" disabled={refreshAll.isPending} onClick={() => refreshAll.mutate()}>
              <RefreshCw className={refreshAll.isPending ? "animate-spin" : ""} />
              {bulk ? `Atualizando ${bulk.done}/${bulk.total}` : "Atualizar todos"}
            </Button>
          ) : undefined
        }
      />
      {bulk ? (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%` }} />
        </div>
      ) : null}
      <div className="mb-4 flex gap-5 border-b border-border" role="tablist">
        {([["catalogo", "Catálogo"], ["descobrir", "Descobrir"], ["ascensao", "Em ascensão"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            role="tab" aria-selected={tab === key} className={`-mb-px h-10 border-b-2 px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "descobrir" && <DiscoverPanel products={products} />}
      {tab === "ascensao" && <RisingRadarPanel products={products} />}

      <div className={`panel ${tab === "catalogo" ? "" : "hidden"}`}>
        <ProductDataTable
          items={products.map((p) => ({
            ...p,
            imageUrl: p.image_url,
            productUrl: p.url,
            sellerName: p.seller_name,
            salesVolume: p.sales_volume,
            growthRate: p.growth_rate,
            updatedLabel: atualizadoHa(p.updated_at),
          }))}
          renderActions={(p) => (
            <div className="flex items-center justify-end gap-2.5">
              {canCreateJob && <Button size="sm" onClick={() => setUseTarget(p)}><Sparkles />Usar</Button>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setDetails(p)} aria-label={`Ver detalhes de ${p.name}`}>
                    <Eye className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver detalhes</TooltipContent>
              </Tooltip>
              {canUpdate && p.external_id && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={refreshingId === p.id || refreshAll.isPending}
                      onClick={() => refreshOne.mutate(p)}
                      aria-label={`Atualizar dados de ${p.name}`}
                    >
                      <RefreshCw className={`size-4 ${refreshingId === p.id ? "animate-spin" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Atualizar dados</TooltipContent>
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
            </div>
          )}
        />
        {!products.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isLoading ? "Carregando produtos..." : isError ? "Não foi possível carregar os produtos. Tente novamente." : "Nenhum produto no catálogo."}</div>}
      </div>

      <Dialog open={!!details} onOpenChange={(open) => { if (!open) { setDetails(null); setEditing(false); } }}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0">
          <div className="grid max-h-[92vh] gap-6 overflow-y-auto p-6 [scrollbar-gutter:stable]">
          <DialogHeader><DialogTitle className="pr-6 text-left">{details?.name}</DialogTitle></DialogHeader>
          {details && (
            <div className="grid gap-4 py-2">
              <div className="flex items-center gap-3">
                {details.image_url ? <img src={details.image_url} alt="" className="size-16 rounded-xl object-cover" /> : null}
                <p className="text-xs text-muted-foreground">
                  Dados vindos do garimpo. Somente leitura.
                  {atualizadoHa(details.updated_at) ? <span className="block">Atualizado {atualizadoHa(details.updated_at)}.</span> : null}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Categoria">{details.niche || "—"}</DetailRow>
                <DetailRow label="Hype score">{details.hype}</DetailRow>
                <DetailRow label="Preço">{typeof details.price === "number" ? brl(details.price) : "—"}</DetailRow>
                <DetailRow label="Comissão">
                  {typeof details.commission === "number" ? `${details.commission}%` : "—"}
                  {typeof details.price === "number" && typeof details.commission === "number" ? <span className="ml-2 font-bold text-primary">{brl(details.price * (details.commission / 100))} por venda</span> : null}
                </DetailRow>
                <DetailRow label="Vendas">{details.sales_volume?.toLocaleString("pt-BR") ?? "—"}</DetailRow>
                <DetailRow label="Crescimento">{details.growth_rate ? `${details.growth_rate}%` : "—"}</DetailRow>
              </div>
              <DetailRow label="Descrição usada pela IA">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <OriginBadge origem={details.description_origem} temDescricao={!!details.description} />
                    {canUpdate && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={generateDesc.isPending || editing}
                          onClick={() => details && generateDesc.mutate(details)}
                        >
                          <Wand2 className={generateDesc.isPending ? "animate-spin" : ""} />
                          {details.description ? "Regerar por IA" : "Gerar descrição por IA"}
                        </Button>
                        {editing ? null : (
                          <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(details.description ?? ""); setEditing(true); }}>
                            <Pencil />Editar
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {editing ? (
                    <div className="grid gap-2">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={6}
                        className="border-0 bg-input font-normal"
                        placeholder="Cole aqui a descrição real do TikTok Shop ou ajuste o texto."
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={saveDesc.isPending} onClick={() => details && saveDesc.mutate({ product: details, texto: draft })}>Salvar descrição</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : details.description ? (
                    <p className="whitespace-pre-wrap break-words text-sm font-normal text-muted-foreground">{details.description}</p>
                  ) : (
                    <span className="text-muted-foreground">Sem descrição. A IA só conhece o nome e a foto principal deste produto.</span>
                  )}
                </div>
              </DetailRow>
              {details.extra_image_urls?.length ? (
                <DetailRow label="Fotos enviadas à IA">
                  <div className="flex flex-wrap gap-2">
                    {details.extra_image_urls.map((src) => (
                      <img key={src} src={src} alt="" className="size-16 rounded-xl object-cover" />
                    ))}
                  </div>
                </DetailRow>
              ) : null}
              <DetailRow label="Link do produto">
                {details.url ? <a href={details.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{details.url}</a> : "—"}
              </DetailRow>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDetails(null)}>Fechar</Button>
            {canUpdate && details?.external_id && (
              <Button
                variant="secondary"
                disabled={refreshingId === details.id}
                onClick={() => details && refreshOne.mutate(details)}
              >
                <RefreshCw className={refreshingId === details.id ? "animate-spin" : ""} />
                Atualizar
              </Button>
            )}
            {canCreateJob && <Button onClick={() => { const p = details; setDetails(null); setUseTarget(p); }}><Sparkles />Usar</Button>}
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!useTarget} onOpenChange={(open) => !open && setUseTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Usar “{useTarget?.name}”</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">O job nasce na etapa “Produto escolhido” dentro do perfil <strong className="text-foreground">{activeProfile?.name}</strong>.</p>
            <div className="grid gap-2">
              {([
                { value: "completo", title: "Completo", hint: "A inteligência artificial cria o vídeo inteiro." },
                { value: "gravacao", title: "Gravar eu mesmo", hint: "A IA escreve só os textos e você grava lendo o teleprompter." },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormato(option.value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${formato === option.value ? "border-primary bg-primary/5" : "hover:bg-secondary"}`}
                >
                  <p className="text-sm font-bold">{option.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                </button>
              ))}
            </div>
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
