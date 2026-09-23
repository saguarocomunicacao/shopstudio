import { TarifasCard } from "./tarifas-card";
import { CreditoTaxasCard } from "./credito-taxas-card";
import { BudgetCard } from "./budget-card";
import { CheckCircle2, CircleDollarSign, FileClock, Loader2, MoreHorizontal, Plus, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JOB_STATUS_LABELS, relativeTime, useJobs } from "@/lib/content";
import { GlobalPromptsSettings } from "./prompts-page";
import { SyncCategoriesButton } from "./category-select";
import { ChampionRefsToggle } from "./champion-refs-toggle";
import { ProfileGate } from "./profile-gate";
import { NewOwnVideoDialog, RecordingKitDialog } from "./recording-kit";
import { useStudio } from "./studio-context";
import { VideoDownloadButton } from "./video-download-button";

const statusClass: Record<string, string> = { "Novo": "status-neutral", "Produto escolhido": "status-blue", "Roteiro pronto": "status-violet", "Gerando cenas": "status-cyan", "Gerando vídeo": "status-cyan", "Vídeo pronto": "status-lime", "Rascunho enviado": "status-orange", "Publicado": "status-pink", "Ativo": "status-lime", "Pausado": "status-neutral" };
function Badge({ children }: { children: string }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass[children] ?? "status-neutral"}`}>{children}</span>; }
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase text-primary">{eyebrow}</p><h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1></div>{action}</div>; }
function Empty({ children = "Nenhum item por aqui ainda." }: { children?: string }) { return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>; }

export function DashboardPage() { return <ProfileGate><DashboardContent /></ProfileGate>; }

function DashboardContent() {
  const { activeProfile, activeProfileId, profiles } = useStudio();
  const { data: scoped = [] } = useJobs(activeProfileId);
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  const stats = [
    { icon: Video, value: scoped.filter((j) => j.status === "video_pronto").length, label: "Vídeos prontos" },
    { icon: FileClock, value: scoped.filter((j) => j.status === "rascunho_enviado").length, label: "Rascunhos aguardando" },
    { icon: CheckCircle2, value: scoped.filter((j) => j.status === "publicado").length, label: "Publicados" },
    { icon: CircleDollarSign, value: scoped.length, label: "Jobs no pipeline" },
  ];
  return <>
    <Heading eyebrow={activeProfile?.name ?? "Perfil"} title="Painel geral" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ icon: Icon, value, label }) => <div className="panel metric-card" key={label}><div className="mb-8 flex items-start justify-between"><span className="icon-box"><Icon /></span></div><strong className="text-2xl font-black">{value}</strong><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>)}</div>
    <section className="mt-6 panel">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Últimos jobs</h2><p className="text-xs text-muted-foreground">Atividade mais recente</p></div><Button variant="ghost" size="icon"><MoreHorizontal /></Button></div>
      <div className="divide-y divide-border">{scoped.slice(0, 5).map((job) => <div key={job.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm font-semibold">{job.title || "Sem título"}</p><p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p></div><Badge>{JOB_STATUS_LABELS[job.status]}</Badge></div>)}{!scoped.length && <Empty>Nenhum job ainda. Escolha um produto para começar.</Empty>}</div>
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
            <video src={job.video_url ?? undefined} controls playsInline poster={job.video_thumbnail_url ?? undefined} className="aspect-[9/16] w-full rounded-xl bg-black object-cover" />
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
              <span className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold status-lime">Ativa</span>
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
