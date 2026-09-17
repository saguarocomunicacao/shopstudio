import { CheckCircle2, CircleDollarSign, FileClock, Loader2, MoreHorizontal, Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { JOB_STATUS_LABELS, relativeTime, useJobs } from "@/lib/content";
import { SyncCategoriesButton } from "./category-select";
import { useStudio } from "./studio-context";

const statusClass: Record<string, string> = { "Novo": "status-neutral", "Produto escolhido": "status-blue", "Roteiro pronto": "status-violet", "Gerando vídeo": "status-cyan", "Vídeo pronto": "status-lime", "Rascunho enviado": "status-orange", "Publicado": "status-pink", "Ativo": "status-lime", "Pausado": "status-neutral" };
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
      <div className="divide-y divide-border">{scoped.slice(0, 5).map((job) => <div key={job.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{job.title || "Sem título"}</p><p className="truncate text-xs text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p></div><Badge>{JOB_STATUS_LABELS[job.status]}</Badge></div>)}{!scoped.length && <Empty>Nenhum job ainda. Escolha um produto para começar.</Empty>}</div>
    </section>
  </>;
}

export function VideosPage() { return <ProfileGate><VideosContent /></ProfileGate>; }

function VideosContent() {
  const { activeProfileId, profiles } = useStudio();
  const { data: scoped = [] } = useJobs(activeProfileId);
  const videos = scoped.filter((j) => !!j.video_url);
  const rendering = scoped.filter((j) => j.status === "gerando_video");
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? "Perfil";
  return <>
    <Heading eyebrow={`${videos.length} ${videos.length === 1 ? "peça" : "peças"}`} title="Biblioteca de vídeos" action={<Button disabled><Plus />Novo vídeo</Button>} />
    {rendering.length > 0 && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{rendering.length} vídeo(s) renderizando...</p>}
    {videos.length ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {videos.map((job) => (
          <article className="panel" key={job.id}>
            <video src={job.video_url!} controls playsInline poster={job.video_thumbnail_url ?? undefined} className="aspect-[9/16] w-full rounded-xl bg-black object-cover" />
            <p className="mt-3 truncate text-sm font-bold">{job.title || "Sem título"}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{profileName(job.profile_id)} · {relativeTime(job.created_at)}</p>
          </article>
        ))}
      </div>
    ) : (
      <Empty>Nenhum vídeo ainda. Eles aparecerão aqui quando forem gerados.</Empty>
    )}
  </>;
}

export function DraftsPage() {
  return <ProfileGate>
    <Heading eyebrow="Prontos para decisão" title="Fila de revisão" />
    <Empty>Nenhum rascunho aguardando revisão.</Empty>
  </ProfileGate>;
}

export function MetricsPage() { return <ProfileGate><MetricsContent /></ProfileGate>; }

function MetricsContent() {
  const { activeProfile } = useStudio();
  return <>
    <Heading eyebrow={activeProfile?.name ?? "Perfil"} title="Performance" />
    <Empty>Ainda não há dados de desempenho. Publique conteúdo para começar a medir.</Empty>
  </>;
}

export function SettingsPage() { const {activeProfile,isAdmin}=useStudio(); return <><Heading eyebrow={activeProfile?.name??"Configuração global"} title="Preferências do perfil"/><div className="grid gap-4 lg:grid-cols-2"><section className="panel"><h2 className="font-bold">Fluxo de publicação</h2><p className="mb-5 mt-1 text-sm text-muted-foreground">Ajustes visuais para o comportamento futuro deste perfil.</p>{[["Revisão obrigatória","Exigir aprovação antes de publicar"],["Alertas de tendência","Sinalizar produtos com hype alto"],["Resumo semanal","Receber um resumo de desempenho"]].map(([a,b],i)=><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t py-4" key={a}><div><p className="text-sm font-semibold">{a}</p><p className="text-xs text-muted-foreground">{b}</p></div><Switch defaultChecked={i<2}/></div>)}</section><section className="panel"><h2 className="font-bold">Fonte de dados de produto</h2><p className="mt-1 text-sm text-muted-foreground">De onde vêm os produtos em alta garimpados na aba “Descobrir”.</p><div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4 py-3"><div><p className="text-sm font-semibold">Kalodata</p><p className="text-xs text-muted-foreground">TikTok Shop Brasil · somente produtos com programa de afiliado</p></div><span className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold status-lime">Ativa</span></div><p className="mt-3 text-xs text-muted-foreground">As chaves de acesso ficam guardadas com segurança no servidor.</p>{isAdmin&&<div className="mt-4 border-t pt-4"><p className="text-sm font-semibold">Categorias oficiais do TikTok Shop</p><p className="mb-3 mt-1 text-xs text-muted-foreground">Usadas nos perfis e produtos. Sincronizadas direto da fonte.</p><SyncCategoriesButton/></div>}</section></div></>; }
