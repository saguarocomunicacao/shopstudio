import { AssistenteTeste } from "@/components/assistente-teste";
import { PageLoader } from "@/components/page-loader";
import { PageHeader } from "./page-header";
import { TarifasCard } from "./tarifas-card";
import { CreditoTaxasCard } from "./credito-taxas-card";
import { BudgetCard } from "./budget-card";
import { CheckCircle2, FileClock, ImageIcon, Loader2, Plus, Radar, Video, Wallet, Workflow } from "lucide-react";
import { resumoRadarFn } from "@/lib/radar.functions";
import { Link } from "@tanstack/react-router";
import { OnboardingBanner, openOnboarding } from "./onboarding-guide";
import { useGastoMes } from "@/lib/orcamento";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JOB_STATUS_LABELS, jobStatusLabel, relativeTime, useJobs, useProducts } from "@/lib/content";
import { GlobalPromptsSettings } from "./prompts-page";
import { SyncCategoriesButton } from "./category-select";
import { ChampionRefsToggle } from "./champion-refs-toggle";
import { ProfileGate } from "./profile-gate";
import { MetricasContent } from "./metricas-page";
import { getMetricas } from "@/lib/metricas.functions";
import { resumirMetricas, type JobMetricaBase, type PerfilSnap, type VideoSnap } from "@/lib/metricas-calc";
import { NewOwnVideoDialog, RecordingKitDialog } from "./recording-kit";
import { useStudio } from "./studio-context";
import { VideoDownloadButton } from "./video-download-button";
import { getDraftPreviews } from "@/lib/drafts.functions";

const statusClass: Record<string, string> = { "Novo": "status-neutral", "Produto escolhido": "status-blue", "Roteiro pronto": "status-violet", "Gerando cenas": "status-cyan", "Gerando vídeo": "status-cyan", "Vídeo pronto": "status-violet", "Rascunho enviado": "status-cyan", "Publicado": "status-published", "Ativo": "status-lime", "Pausado": "status-neutral" };
function Badge({ children }: { children: string }) { return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${statusClass[children] ?? "status-neutral"}`}>{children}</span>; }
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <PageHeader title={title} description={/\d/.test(eyebrow) ? eyebrow : undefined} actions={action} />; }
function Empty({ children = "Nenhum item por aqui ainda." }: { children?: string }) { return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>; }

export function DashboardPage() { return <ProfileGate><DashboardContent /></ProfileGate>; }

function DashboardContent() {
  const { activeProfile, activeProfileId, profiles, can } = useStudio();
  const { data: scoped = [] } = useJobs(activeProfileId);
  const { data: products = [] } = useProducts(activeProfileId);
  const loadPreviews = useServerFn(getDraftPreviews);
  const latestJobs = scoped.slice(0, 5);
  const previewIds = latestJobs.map((job) => job.id);
  const { data: previewData } = useQuery({
    queryKey: ["dashboard-job-previews", previewIds],
    queryFn: () => loadPreviews({ data: { jobIds: previewIds } }),
    enabled: previewIds.length > 0,
  });
  const previewByJob = new Map((previewData?.previews ?? []).map((preview) => [preview.id, preview]));
  const productImage = (productId: string | null) => products.find((p) => p.id === productId)?.image_url ?? null;
  const gasto = useGastoMes(activeProfileId);
  const canCost = can("custos", "visualizar", activeProfileId);
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const count = (f: (j: (typeof scoped)[number]) => boolean) => scoped.filter(f).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const views7 = useViews7(activeProfileId);
  const gerando = count((j) => j.status === "gerando_cenas" || j.status === "gerando_video");
  const loadRadar = useServerFn(resumoRadarFn);
  const podeRadar = can("metricas", "visualizar", activeProfileId);
  const { data: radar } = useQuery({ queryKey: ["radar-resumo", activeProfileId], queryFn: () => loadRadar({ data: { profileId: activeProfileId! } }), enabled: !!activeProfileId && podeRadar });
  const stats: { icon: typeof Video; value: string | number; label: string; context?: string | undefined; to: string; search?: Record<string, string> | undefined; bar?: number | undefined }[] = [
    { icon: Video, value: count((j) => j.status === "video_pronto"), label: "Vídeos prontos", context: `${count((j) => j.status === "video_pronto" && !j.approved_at)} aguardando revisão`, to: "/app/videos" },
    { icon: FileClock, value: count((j) => j.status === "rascunho_enviado"), label: "Rascunhos aguardando", context: `${count((j) => j.status === "rascunho_enviado" && !!j.approved_at)} aprovados para postar`, to: "/app/rascunhos" },
    { icon: CheckCircle2, value: count((j) => j.status === "publicado" && !!j.published_at && new Date(j.published_at) >= monthStart), label: "Publicados", context: views7 != null ? `neste mês · ${views7.toLocaleString("pt-BR")} views nos últimos 7 dias` : "neste mês", to: "/app/rascunhos", search: { tab: "publicados" } },
    { icon: Workflow, value: scoped.length, label: "Jobs no pipeline", context: `${gerando} gerando agora`, to: "/app/pipeline" },
  ];
  if (radar) stats.push({ icon: Radar, value: radar.hoje, label: "Radar", context: radar.hoje === 1 ? "vídeo em alta hoje" : "vídeos em alta hoje", to: "/app/radar" });
  if (canCost && gasto) {
    // Mesmo perfil do topo: gasto do mês (Brasília) desse perfil, igual à tela Custos filtrada nele.
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const valor = activeProfileId ? gasto.perfilBrl : gasto.globalBrl;
    const usaTetoPerfil = !!activeProfileId && !!gasto.tetoPerfil;
    const teto = usaTetoPerfil ? gasto.tetoPerfil : gasto.tetoGlobal;
    const base = usaTetoPerfil || !activeProfileId ? valor : gasto.globalBrl;
    const context = teto ? (usaTetoPerfil || !activeProfileId ? `de ${fmt(teto)} do orçamento` : `geral: ${fmt(base)} de ${fmt(teto)}`) : undefined;
    stats.push({ icon: Wallet, value: fmt(valor), label: "Gasto do mês", context, to: "/app/custos", bar: teto ? base / teto : undefined });
  }
  return <>
    <Heading eyebrow={activeProfile?.name ?? "Perfil"} title="Visão geral" action={<Button variant="secondary" onClick={openOnboarding}>Como funciona</Button>} />
    <OnboardingBanner />
    <div className={`grid gap-3 sm:grid-cols-2 ${stats.length === 6 ? "xl:grid-cols-3" : stats.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{stats.map(({ icon: Icon, value, label, context, to, search, bar }) => (
      <Link key={label} to={to} {...(search ? { search } : {})} className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Icon className="size-[18px]" strokeWidth={1.8} />{label}</div>
        <strong className="mt-2 block font-display text-[36px] text-foreground font-semibold leading-tight">{value}</strong>
        {context && <p className="mt-1 text-[13px] text-muted-foreground">{context}</p>}
        {bar !== undefined && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${bar >= 1 ? "bg-primary" : bar >= 0.8 ? "bg-warning" : "bg-brand-cyan"}`} style={{ width: `${Math.min(100, bar * 100)}%` }} /></div>}
      </Link>
    ))}</div>
    <section className="mt-6 panel">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Últimos jobs</h2><p className="text-xs text-muted-foreground">Atividade mais recente</p></div><Button variant="ghost" size="sm" asChild><Link to="/app/pipeline">Ver pipeline</Link></Button></div>
       <div className="divide-y divide-border">{latestJobs.map((job) => {
         const preview = previewByJob.get(job.id);
         const recordingThumb = preview?.thumbnailUrl ?? job.video_thumbnail_url;
         const aiThumb = preview?.aiThumbnailUrl ?? job.ai_video_thumbnail_url;
         const primaryVideoThumb = job.video_choice === "ia" ? aiThumb : recordingThumb ?? aiThumb;
         const approvedScene = job.scenes?.find((scene) => scene.approved === true && scene.image_url)?.image_url;
         const legacyScene = job.scenes?.find((scene) => scene.approved !== false && scene.image_url)?.image_url;
         const thumb = primaryVideoThumb ?? approvedScene ?? legacyScene ?? recordingThumb ?? aiThumb ?? productImage(job.product_id);
        return <Link key={job.id} to="/app/rascunhos" search={{ jobId: job.id, perfil: job.profile_id }} className="-mx-2 grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[rgba(255,255,255,0.03)]">
          {thumb ? <img src={thumb} alt="" className="size-10 rounded-md object-cover" /> : <span className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="size-4" /></span>}
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{job.title || "Sem título"}</p><p className="truncate whitespace-pre text-xs text-muted-foreground">{profileName(job.profile_id)}{"  "}{relativeTime(job.created_at)}</p></div>
          <Badge>{jobStatusLabel(job)}</Badge>
        </Link>;
      })}{!scoped.length && <Empty>Nenhum job ainda. Escolha um produto para começar.</Empty>}</div>
    </section>
  </>;
}

export function VideosPage() { return <ProfileGate><VideosContent /></ProfileGate>; }

function VideosContent() {
  const { activeProfileId, profiles, can } = useStudio();
  const { data: scoped = [], isLoading, isError } = useJobs(activeProfileId);
  const videos = scoped.filter((j) => !!j.video_url);
  const rendering = scoped.filter((j) => j.status === "gerando_video");
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const canCreate = can("pipeline", "criar", activeProfileId) || can("pipeline", "editar", activeProfileId);
  const [novoOpen, setNovoOpen] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const recordingJob = scoped.find((j) => j.id === recordingId) ?? null;
  return <>
    <Heading eyebrow={`${videos.length} ${videos.length === 1 ? "peça" : "peças"}`} title="Biblioteca de vídeos" action={<Button disabled={!canCreate} onClick={() => setNovoOpen(true)}><Plus />Novo vídeo próprio</Button>} />
    <NewOwnVideoDialog open={novoOpen} onOpenChange={setNovoOpen} onCreated={(jobId) => setRecordingId(jobId)} />
    {recordingJob && <RecordingKitDialog job={recordingJob} canEdit={canCreate} onClose={() => setRecordingId(null)} />}
    {isLoading ? <PageLoader /> : isError ? <Empty>Não foi possível carregar os vídeos. Tente novamente.</Empty> : rendering.length > 0 && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{rendering.length} vídeo(s) renderizando...</p>}
    {!isLoading && !isError && (videos.length ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {videos.map((job) => (
          <article className="panel" key={job.id}>
            <video src={job.video_url ?? undefined} controls playsInline poster={job.video_thumbnail_url ?? undefined} className="aspect-[9/16] w-full rounded-xl bg-video-bg object-cover" />
            <p className="mt-3 whitespace-pre-wrap break-words text-sm font-bold">{job.title || "Sem título"}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p>
            <VideoDownloadButton
              versions={[
                { key: "ativa", label: "Vídeo montado", source: job.video_url },
                { key: "ia", label: "Versão gerada por IA", source: job.ai_video_url },
              ]}
              title={job.title}
              profileName={profileName(job.profile_id)}
              size="sm"
              variant="secondary"
              className="mt-3 w-full"
            />
          </article>
        ))}
      </div>
    ) : (
      <Empty>Nenhum vídeo ainda. Eles aparecerão aqui quando forem gerados.</Empty>
    ))}
  </>;
}


export function MetricsPage() { return <ProfileGate><MetricsContent /></ProfileGate>; }

function useViews7(profileId: string | null) {
  const { can, isBackoffice } = useStudio();
  const load = useServerFn(getMetricas);
  const pode = !!profileId && (isBackoffice || can("metricas", "visualizar", profileId));
  const { data } = useQuery({ queryKey: ["metricas", profileId, 7], queryFn: () => load({ data: { profileId: profileId!, dias: 7 } }), enabled: pode });
  if (!data || data.semPermissao || !data.perfil.length) return null;
  const jobs = data.jobs as JobMetricaBase[];
  return resumirMetricas({
    perfil: data.perfil as PerfilSnap[], videos: data.videos as VideoSnap[], jobs, dias: 7,
    publicadoPorVideo: new Map([
      ...jobs.filter((j) => j.tiktok_video_id).map((j) => [j.tiktok_video_id!, j.published_at] as const),
      ...((data.pubNaoVinc ?? []) as { tiktok_video_id: string; publicado_em: string | null }[]).map((r) => [r.tiktok_video_id, r.publicado_em] as const),
    ]),
  }).views;
}

function MetricsContent() { return <MetricasContent />; }

export function SettingsPage() {
  const { isBackoffice } = useStudio();

  if (!isBackoffice) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Você não tem acesso às configurações do backoffice.</div>;
  }

  return (
    <>
      <Heading eyebrow="Backoffice" title="Configurações do sistema" />
      <Tabs defaultValue="fonte" className="min-w-0">
        <div className="mb-5 overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="fonte">Fonte de dados</TabsTrigger>
            <TabsTrigger value="tarifas">Tarifas de custo</TabsTrigger>
            <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
            <TabsTrigger value="prompts">Prompts padrão do sistema</TabsTrigger>
            <TabsTrigger value="assistente">Assistente</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fonte">
          <section className="panel">
            <h2 className="font-bold">Fonte de dados de produto</h2>
            <p className="mt-1 text-sm text-muted-foreground">De onde vêm os produtos em alta garimpados na aba “Descobrir”.</p>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4 py-3">
              <div><p className="text-sm font-semibold">Kalodata</p><p className="text-xs text-muted-foreground">TikTok Shop Brasil · somente produtos com programa de afiliado</p></div>
              <span className="inline-flex rounded-lg px-2 py-0.5 text-xs font-medium status-lime">Ativa</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">As chaves de acesso ficam guardadas com segurança no servidor.</p>
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-semibold">Categorias oficiais do TikTok Shop</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Usadas nos perfis e produtos. Sincronizadas direto da fonte.</p>
              <SyncCategoriesButton />
            </div>
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-semibold">Roteiro alimentado por campeões</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Referência de ganchos que já estão vendendo na categoria do produto.</p>
              <ChampionRefsToggle />
            </div>
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-semibold">Download de links (Apify)</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Robô usado em cada rede na tela Analisar vídeo.</p>
              <ApifyActorsForm />
            </div>
          </section>
        </TabsContent>
        <TabsContent value="tarifas"><div className="grid gap-4"><TarifasCard /><CreditoTaxasCard /></div></TabsContent>
        <TabsContent value="orcamento"><div className="grid gap-4 lg:grid-cols-2"><BudgetCard /></div></TabsContent>
        <TabsContent value="prompts">
          <div className="mb-4">
            <h2 className="font-bold">Prompts padrão do sistema</h2>
            <p className="mt-1 text-sm text-muted-foreground">Valem como base ao criar novos perfis.</p>
          </div>
          <GlobalPromptsSettings />
        </TabsContent>
        <TabsContent value="assistente"><AssistenteTeste /></TabsContent>
      </Tabs>
    </>
  );
}

const APIFY_REDES = [
  { key: "apify_actor_tiktok", label: "TikTok", padrao: "clockworks/tiktok-scraper" },
  { key: "apify_actor_youtube", label: "YouTube", padrao: "streamers/youtube-video-downloader" },
  { key: "apify_actor_instagram", label: "Instagram", padrao: "apify/instagram-reel-scraper" },
];

function ApifyActorsForm() {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    supabase
      .from("app_config")
      .select("key, value_text")
      .in("key", APIFY_REDES.map((r) => r.key))
      .then(({ data }) => setValores(Object.fromEntries((data ?? []).map((d) => [d.key, d.value_text ?? ""]))));
  }, []);
  const salvar = async () => {
    setSalvando(true);
    const rows = APIFY_REDES.map((r) => ({ key: r.key, value_text: (valores[r.key] || r.padrao).trim() }));
    const { error } = await supabase.from("app_config").upsert(rows, { onConflict: "key" });
    setSalvando(false);
    if (error) toast.error("Não foi possível salvar os robôs.");
    else toast.success("Robôs salvos.");
  };
  return (
    <div className="grid gap-2">
      {APIFY_REDES.map((r) => (
        <label key={r.key} className="grid gap-1 text-xs sm:grid-cols-[90px_1fr] sm:items-center">
          <span className="font-medium">{r.label}</span>
          <Input value={valores[r.key] ?? ""} placeholder={r.padrao} onChange={(e) => setValores((v) => ({ ...v, [r.key]: e.target.value }))} />
        </label>
      ))}
      <div><Button size="sm" variant="outline" disabled={salvando} onClick={salvar}>Salvar robôs</Button></div>
    </div>
  );
}
