import { lerContextoPendente, limparContextoPendente } from "@/lib/contexto-compradores";
import { ImageLightbox } from "./image-lightbox";
import { PageHeader } from "./page-header";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Eye, Lock, Pencil, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, type DbProduct } from "@/lib/content";
import { enrichProductDetails } from "@/lib/discover.functions";
import { generateProductDescription } from "@/lib/product-description.functions";
import { DiscoverPanel } from "./discover-panel";
import { RisingRadarPanel } from "./rising-radar-panel";
import { CriadoresPanel } from "./criadores-panel";
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

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="break-words font-display text-lg font-semibold leading-tight">{children}</div>
    </div>
  );
}

function Vazio({ texto = "Não informado" }: { texto?: string }) {
  return <span className="font-sans text-sm font-normal text-muted-foreground">{texto}</span>;
}

/** Descrição com quebras preservadas, linhas "•"/"-" viram lista e recolhe em 6 linhas. */
function DescriptionText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`l${blocks.length}`} className="list-disc pl-5">{list.map((li, i) => <li key={i}>{li}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw) => {
    const m = raw.trim().match(/^[•-]\s*(.*)$/);
    if (m) { list.push(m[1] ?? ""); return; }
    flush();
    blocks.push(raw.trim() ? <p key={`p${blocks.length}`}>{raw}</p> : <div key={`b${blocks.length}`} className="h-[1.6em]" />);
  });
  flush();
  const long = lines.length > 6 || text.length > 420;
  return (
    <div className="grid gap-1">
      <div className={`break-words text-sm leading-[1.6] text-foreground ${long && !open ? "max-h-[9.6em] overflow-hidden" : ""}`}>{blocks}</div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="justify-self-start text-sm font-medium text-muted-foreground hover:text-foreground">
          {open ? "Mostrar menos" : "Mostrar mais"}
        </button>
      )}
    </div>
  );
}

/** Mostra de onde veio o texto da descrição, para indicar a confiabilidade. */
function OriginBadge({ origem, temDescricao }: { origem?: string | null | undefined; temDescricao: boolean }) {
  if (!temDescricao) return <Badge variant="secondary">Sem descrição</Badge>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "success" }> = {
    manual: { label: "Manual", variant: "secondary" },
    gerada_por_ia: { label: "IA", variant: "success" },
    kalodata: { label: "Kalodata", variant: "secondary" },
  };
  const item = map[origem ?? "kalodata"] ?? map["kalodata"]!;
  return <Badge variant={item.variant}>{item.label}</Badge>;
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
  const tabParam = (useSearch({ strict: false }) as { tab?: string }).tab;
  const [tab, setTab] = useState<"catalogo" | "descobrir" | "ascensao" | "criadores">(tabParam === "descobrir" || tabParam === "ascensao" || tabParam === "criadores" ? tabParam : "catalogo");
  useEffect(() => { if (tabParam === "descobrir" || tabParam === "ascensao" || tabParam === "catalogo" || tabParam === "criadores") setTab(tabParam); }, [tabParam]);
  const [useTarget, setUseTarget] = useState<DbProduct | null>(null);
  const [details, setDetails] = useState<DbProduct | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
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
        contexto_compradores: lerContextoPendente(),
      });
      if (error) throw new Error(error.message);
      limparContextoPendente();
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
        {([["catalogo", "Catálogo"], ["descobrir", "Descobrir"], ["ascensao", "Em ascensão"], ["criadores", "Criadores"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-tour={`tab-${key}`}
            onClick={() => setTab(key)}
            role="tab" aria-selected={tab === key} className={`-mb-px h-10 border-b-2 px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "descobrir" && <DiscoverPanel products={products} />}
      {tab === "ascensao" && <RisingRadarPanel products={products} />}
      {tab === "criadores" && <CriadoresPanel />}

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
              {canCreateJob && <Button size="sm" data-tour="use-product" onClick={() => setUseTarget(p)}><Sparkles />Usar</Button>}
              <TooltipProvider delayDuration={200}><Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setDetails(p)} aria-label={`Ver detalhes de ${p.name}`}>
                    <Eye className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver detalhes</TooltipContent>
              </Tooltip></TooltipProvider>
              {canUpdate && p.external_id && (
                <TooltipProvider delayDuration={200}><Tooltip>
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
                </Tooltip></TooltipProvider>
              )}
              {canRemove && (
                <TooltipProvider delayDuration={200}><Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setConfirm(p)} aria-label={`Remover ${p.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remover</TooltipContent>
                </Tooltip></TooltipProvider>
              )}
            </div>
          )}
        />
        {!products.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isLoading ? "Carregando produtos..." : isError ? "Não foi possível carregar os produtos. Tente novamente." : "Nenhum produto no catálogo."}</div>}
      </div>

      <Dialog open={!!details} onOpenChange={(open) => { if (!open) { setDetails(null); setEditing(false); } }}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[720px] flex-col gap-0 overflow-hidden bg-card p-0 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:left-0 max-sm:rounded-none max-sm:border-0">
          {details && (
            <>
              <DialogHeader className="shrink-0 border-b border-border p-5 pr-12 text-left">
                <div className="flex min-w-0 items-start gap-4">
                  {details.image_url ? <img src={details.image_url} alt="" className="size-[72px] shrink-0 rounded-lg object-cover" /> : <div className="size-[72px] shrink-0 rounded-lg bg-muted" />}
                  <div className="min-w-0 grid gap-1">
                    <TooltipProvider delayDuration={200}><Tooltip>
                      <TooltipTrigger asChild>
                        <DialogTitle className="line-clamp-2 font-display text-xl font-semibold leading-snug">{details.name}</DialogTitle>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">{details.name}</TooltipContent>
                    </Tooltip></TooltipProvider>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      {details.seller_name ? <span className="truncate">{details.seller_name}</span> : null}
                      {details.seller_name && atualizadoHa(details.updated_at) ? <span aria-hidden>·</span> : null}
                      {atualizadoHa(details.updated_at) ? <span>Atualizado {atualizadoHa(details.updated_at)}</span> : null}
                      <TooltipProvider delayDuration={200}><Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="Somente leitura" className="inline-flex text-muted-foreground"><Lock className="size-3.5" /></button>
                        </TooltipTrigger>
                        <TooltipContent>Dados vindos do garimpo. Somente leitura.</TooltipContent>
                      </Tooltip></TooltipProvider>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-[14px] bg-background p-4 sm:grid-cols-3">
                  <Metric label="Preço">{typeof details.price === "number" ? brl(details.price) : <Vazio />}</Metric>
                  <Metric label="Comissão">
                    {typeof details.commission === "number" ? `${details.commission}%` : <Vazio />}
                    {typeof details.price === "number" && typeof details.commission === "number" ? (
                      <span className="mt-0.5 block font-sans text-[13px] font-medium text-cyan-ink">{brl(details.price * (details.commission / 100))} por venda</span>
                    ) : null}
                  </Metric>
                  <Metric label="Vendas">{details.sales_volume != null ? details.sales_volume.toLocaleString("pt-BR") : <Vazio />}</Metric>
                  <Metric label="Crescimento">
                    {details.growth_rate ? (
                      <span className={`inline-flex items-center gap-1 ${Number(details.growth_rate) < 0 ? "text-primary" : "text-cyan-ink"}`}>
                        {Number(details.growth_rate) < 0 ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
                        {details.growth_rate}%
                      </span>
                    ) : <Vazio />}
                  </Metric>
                  <Metric label="Hype score">
                    {details.hype ?? <Vazio />}
                    {typeof details.hype === "number" ? (
                      <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-brand-cyan" style={{ width: `${Math.max(0, Math.min(100, details.hype))}%` }} />
                      </span>
                    ) : null}
                  </Metric>
                  <Metric label="Categoria">{details.niche || <Vazio texto="Não informada" />}</Metric>
                </div>

                <section className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans text-sm font-semibold">Descrição usada pela IA</h3>
                      <OriginBadge origem={details.description_origem} temDescricao={!!details.description} />
                    </div>
                    {canUpdate && !editing && (
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="ghost" disabled={generateDesc.isPending} onClick={() => details && generateDesc.mutate(details)}>
                          <Wand2 className={generateDesc.isPending ? "animate-spin" : ""} />
                          {details.description ? "Regerar por IA" : "Gerar descrição por IA"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(details.description ?? ""); setEditing(true); }}>
                          <Pencil />Editar
                        </Button>
                      </div>
                    )}
                  </div>
                  {editing ? (
                    <div className="grid gap-2">
                      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} className="font-normal" placeholder="Cole aqui a descrição real do TikTok Shop ou ajuste o texto." />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={saveDesc.isPending} onClick={() => details && saveDesc.mutate({ product: details, texto: draft })}>Salvar descrição</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : details.description ? (
                    <DescriptionText key={details.id} text={details.description} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem descrição. A IA só conhece o nome e a foto principal deste produto.</p>
                  )}
                </section>

                {details.extra_image_urls?.length ? (
                  <section className="grid gap-2">
                    <h3 className="font-sans text-sm font-semibold">Fotos enviadas à IA</h3>
                    <div className="flex flex-wrap gap-2">
                      {details.extra_image_urls.map((src) => (
                        <button key={src} type="button" onClick={() => setZoom(src)} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Ampliar foto">
                          <img src={src} alt="" className="size-16 rounded-lg object-cover" />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="grid gap-2">
                  <h3 className="font-sans text-sm font-semibold">Link do produto</h3>
                  {details.url ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <a href={details.url} target="_blank" rel="noreferrer"><ExternalLink />Abrir no TikTok Shop</a>
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(details.url!).then(() => toast.success("Link copiado.")).catch(() => toast.error("Não foi possível copiar o link.")); }}>
                        <Copy />Copiar link
                      </Button>
                    </div>
                  ) : <Vazio texto="Não informado" />}
                </section>
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-sm:w-full">
                  {canUpdate && details.external_id && (
                    <Button variant="ghost" className="max-sm:w-full" disabled={refreshingId === details.id} onClick={() => details && refreshOne.mutate(details)}>
                      <RefreshCw className={refreshingId === details.id ? "animate-spin" : ""} />
                      Atualizar dados
                    </Button>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button variant="secondary" className="max-sm:w-full" onClick={() => setDetails(null)}>Fechar</Button>
                  {canCreateJob && <Button className="max-sm:w-full" onClick={() => { const p = details; setDetails(null); setUseTarget(p); }}><Sparkles />Usar neste perfil</Button>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {(() => {
        const fotos = details?.extra_image_urls ?? [];
        const idx = zoom ? fotos.indexOf(zoom) : -1;
        return (
          <ImageLightbox
            items={fotos.map((src, i) => ({ src, title: `Foto ${i + 1}`, fileName: `produto-foto-${i + 1}.jpg` }))}
            index={idx >= 0 ? idx : null}
            onIndexChange={(i) => setZoom(i === null ? null : fotos[i] ?? null)}
          />
        );
      })()}

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
