import { PageHeader } from "./page-header";
import { TarifasCard } from "./tarifas-card";
import { CreditoTaxasCard } from "./credito-taxas-card";
import { BudgetCard } from "./budget-card";
import { CheckCircle2, FileClock, ImageIcon, Loader2, Plus, Video, Wallet, Workflow } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OnboardingBanner, openOnboarding } from "./onboarding-guide";
import { useGastoMes } from "@/lib/orcamento";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JOB_STATUS_LABELS, jobStatusLabel, relativeTime, useJobs, useProducts } from "@/lib/content";
import { GlobalPromptsSettings } from "./prompts-page";
import { SyncCategoriesButton } from "./category-select";
import { ChampionRefsToggle } from "./champion-refs-toggle";
import { ProfileGate } from "./profile-gate";
import { NewOwnVideoDialog, RecordingKitDialog } from "./recording-kit";
import { useStudio } from "./studio-context";
import { VideoDownloadButton } from "./video-download-button";

const statusClass: Record<string, string> = { "Novo": "status-neutral", "Produto escolhido": "status-blue", "Roteiro pronto": "status-violet", "Gerando cenas": "status-cyan", "Gerando vídeo": "status-cyan", "Vídeo pronto": "status-violet", "Rascunho enviado": "status-cyan", "Publicado": "status-published", "Ativo": "status-lime", "Pausado": "status-neutral" };
function Badge({ children }: { children: string }) { return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${statusClass[children] ?? "status-neutral"}`}>{children}</span>; }
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <PageHeader title={title} description={/\d/.test(eyebrow) ? eyebrow : undefined} actions={action} />; }
function Empty({ children = "Nenhum item por aqui ainda." }: { children?: string }) { return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>; }

export function DashboardPage() { return <ProfileGate><DashboardContent /></ProfileGate>; }

function DashboardContent() {
  const { activeProfile, activeProfileId, profiles, can } = useStudio();
  const { data: scoped = [] } = useJobs(activeProfileId);
  const { data: products = [] } = useProducts(activeProfileId);
  const productImage = (productId: string | null) => products.find((p) => p.id === productId)?.image_url ?? null;
  const gasto = useGastoMes(activeProfileId);
  const canCost = can("custos", "visualizar", activeProfileId);
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const count = (f: (j: (typeof scoped)[number]) => boolean) => scoped.filter(f).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const gerando = count((j) => j.status === "gerando_cenas" || j.status === "gerando_video");
  const stats: { icon: typeof Video; value: string | number; label: string; context?: string | undefined; to: string; search?: Record<string, string> | undefined; bar?: number | undefined }[] = [
    { icon: Video, value: count((j) => j.status === "video_pronto"), label: "Vídeos prontos", context: `${count((j) => j.status === "video_pronto" && !j.approved_at)} aguardando revisão`, to: "/app/videos" },
    { icon: FileClock, value: count((j) => j.status === "rascunho_enviado"), label: "Rascunhos aguardando", context: `${count((j) => j.status === "rascunho_enviado" && !!j.approved_at)} aprovados para postar`, to: "/app/rascunhos" },
    { icon: CheckCircle2, value: count((j) => j.status === "publicado" && !!j.published_at && new Date(j.published_at) >= monthStart), label: "Publicados", context: "neste mês", to: "/app/rascunhos", search: { tab: "publicados" } },
    { icon: Workflow, value: scoped.length, label: "Jobs no pipeline", context: `${gerando} gerando agora`, to: "/app/pipeline" },
  ];
  if (canCost && gasto) {
    const teto = gasto.tetoPerfil ?? gasto.tetoGlobal;
    const valor = gasto.tetoPerfil ? gasto.perfilBrl : gasto.globalBrl;
    stats.push({ icon: Wallet, value: valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), label: "Gasto do mês", context: teto ? `de ${teto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} do orçamento` : undefined, to: "/app/custos", bar: teto ? valor / teto : undefined });
  }
  return <>
    <Heading eyebrow={activeProfile?.name ?? "Perfil"} title="Visão geral" action={<Button variant="secondary" onClick={openOnboarding}>Como funciona</Button>} />
    <OnboardingBanner />
    <div className={`grid gap-3 sm:grid-cols-2 ${stats.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{stats.map(({ icon: Icon, value, label, context, to, search, bar }) => (
      <Link key={label} to={to} {...(search ? { search } : {})} className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Icon className="size-[18px]" strokeWidth={1.8} />{label}</div>
        <strong className="mt-2 block font-display text-[36px] font-semibold leading-tight">{value}</strong>
        {context && <p className="mt-1 text-[13px] text-muted-foreground">{context}</p>}
        {bar !== undefined && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${bar >= 1 ? "bg-primary" : bar >= 0.8 ? "bg-warning" : "bg-brand-cyan"}`} style={{ width: `${Math.min(100, bar * 100)}%` }} /></div>}
      </Link>
    ))}</div>
    <section className="mt-6 panel">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Últimos jobs</h2><p className="text-xs text-muted-foreground">Atividade mais recente</p></div><Button variant="ghost" size="sm" asChild><Link to="/app/pipeline">Ver pipeline</Link></Button></div>
      <div className="divide-y divide-border">{scoped.slice(0, 5).map((job) => {
        const thumb = job.video_thumbnail_url ?? job.ai_video_thumbnail_url ?? job.scenes?.find((s) => s.image_url)?.image_url ?? productImage(job.product_id);
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
    {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando vídeos...</p> : isError ? <Empty>Não foi possível carregar os vídeos. Tente novamente.</Empty> : rendering.length > 0 && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{rendering.length} vídeo(s) renderizando...</p>}
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

function MetricsContent() {
  const { activeProfile } = useStudio();
  return <>
    <Heading eyebrow={activeProfile?.name ?? "Perfil"} title="Performance" />
    <Empty>Ainda não há dados de desempenho. Publique conteúdo para começar a medir.</Empty>
  </>;
}

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
      </Tabs>
    </>
  );
}
