import { LerComentariosButton } from "./comentarios-panel";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, EyeOff, Loader2, Sparkles, Wand2 } from "lucide-react";
import { TikTokIcon } from "./tiktok-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "./page-header";
import { useStudio } from "./studio-context";
import { ProfileGate } from "./profile-gate";
import { StatusAnaliseBadge } from "./status-analise";
import { NewOwnVideoDialog, RecordingKitDialog } from "./recording-kit";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AcompanharButton } from "./acompanhar-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analisarRadarFn, listarRadarFn, marcarRadarFn } from "@/lib/radar.functions";
import { useJobs } from "@/lib/content";
import { actionError } from "@/lib/api-keys";

const JANELAS = [{ v: 24, l: "24 h" }, { v: 72, l: "3 dias" }, { v: 168, l: "7 dias" }] as const;
const fmt = (n: number) => n.toLocaleString("pt-BR");

function haQuanto(iso: string | null) {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600_000));
  return h < 1 ? "agora" : h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export function RadarPage() { return <ProfileGate><RadarContent /></ProfileGate>; }

function RadarContent() {
  const { activeProfileId, can } = useStudio();
  const qc = useQueryClient();
  const listar = useServerFn(listarRadarFn);
  const marcar = useServerFn(marcarRadarFn);
  const analisar = useServerFn(analisarRadarFn);
  const [horas, setHoras] = useState<24 | 72 | 168>(168);
  const [refId, setRefId] = useState<string>("todos");
  const [roteiro, setRoteiro] = useState<{ id: string; assunto: string } | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const { data: jobs = [] } = useJobs(activeProfileId);
  const canCreate = can("pipeline", "criar", activeProfileId) || can("pipeline", "editar", activeProfileId);
  const q = useQuery({
    queryKey: ["radar", activeProfileId, horas, refId],
    queryFn: () => listar({ data: { profileId: activeProfileId!, horas, refId: refId === "todos" ? null : refId } }),
    enabled: !!activeProfileId,
    refetchInterval: (query) => (query.state.data?.itens.some((i) => i.analise && !["pronto", "erro"].includes(i.analise.status)) ? 20_000 : false),
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: ["radar"] });
  const ignorar = useMutation({ mutationFn: (id: string) => marcar({ data: { id, status: "ignorado" } }), onSuccess: recarregar, onError: (e) => toast.error(actionError(e)) });
  const analisarM = useMutation({
    mutationFn: (id: string) => analisar({ data: { id } }),
    onSuccess: () => { toast.success("Análise na fila. Aparece aqui quando ficar pronta."); recarregar(); },
    onError: (e) => toast.error(actionError(e)),
  });
  const recordingJob = jobs.find((j) => j.id === recordingId) ?? null;
  const d = q.data;
  const itens = d?.itens ?? [];

  return <>
    <PageHeader
      title="Radar"
      description={d && !d.semPermissao ? `${itens.length} ${itens.length === 1 ? "vídeo em alta" : "vídeos em alta"} ${horas === 24 ? "nas últimas 24 h" : horas === 72 ? "nos últimos 3 dias" : "nos últimos 7 dias"}` : undefined}
      actions={<div className="flex flex-wrap gap-2">
        <Select value={String(horas)} onValueChange={(v) => setHoras(Number(v) as 24 | 72 | 168)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>{JANELAS.map((j) => <SelectItem key={j.v} value={String(j.v)}>{j.l}</SelectItem>)}</SelectContent>
        </Select>
<Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-between font-normal">
              <span className="truncate">{refId === "todos" ? "Todos os @" : `@${d?.acompanhados.find((r) => r.id === refId)?.handle ?? ""}`}</span><ChevronDown className="size-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <button type="button" onClick={() => setRefId("todos")} className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary ${refId === "todos" ? "font-semibold" : ""}`}>Todos os @</button>
            {(d?.acompanhados ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-1">
                <button type="button" onClick={() => setRefId(r.id)} className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary ${refId === r.id ? "font-semibold" : ""} ${r.acompanhar ? "" : "text-muted-foreground"}`}>
                  @{r.handle}{!r.acompanhar && <span className="ml-1 text-xs">(pausado)</span>}
                </button>
                {canCreate && <AcompanharButton refId={r.id} handle={r.handle} acompanhar={r.acompanhar} compacto />}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>}
    />
    <NewOwnVideoDialog
      open={!!roteiro} onOpenChange={(v) => !v && setRoteiro(null)} assuntoInicial={roteiro?.assunto ?? ""}
      onCreated={(jobId) => { if (roteiro) void marcar({ data: { id: roteiro.id, status: "usado" } }).then(recarregar); setRecordingId(jobId); }}
    />
    {recordingJob && <RecordingKitDialog job={recordingJob} canEdit={canCreate} onClose={() => setRecordingId(null)} />}
    {q.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando o radar...</p>
      : q.isError ? <Vazio>Não foi possível carregar o radar. Tente novamente.</Vazio>
      : d?.semPermissao ? <Vazio>Você não tem permissão para ver o Radar deste perfil.</Vazio>
      : !d?.acompanhados.some((r) => r.acompanhar) ? <Vazio>Adicione @ em <Link to="/app/referencias" className="text-brand-cyan underline">Perfis de referência</Link> e ligue "Acompanhar diariamente".</Vazio>
      : !itens.length ? <Vazio>Nada em alta no período. O radar confere os @ acompanhados todo dia às 06:00.</Vazio>
      : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {itens.map((i) => (
          <article key={i.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
            <a href={i.url} target="_blank" rel="noreferrer" className="relative block aspect-[9/16] bg-video-bg">
              {i.capaUrl && <img src={i.capaUrl} alt="" className="size-full object-cover" loading="lazy" />}
              <span className="absolute left-2 top-2 rounded-md bg-brand-cyan px-2 py-0.5 text-xs font-semibold text-black">{i.razao && i.razao >= 2 ? `${i.razao.toLocaleString("pt-BR")}x a média` : i.emAltaNicho ? "Top do nicho" : "Acima do normal"}</span>
              {i.status === "novo" && <span className="absolute right-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Novo</span>}
            </a>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                {i.fotoUrl ? <img src={i.fotoUrl} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-muted" />}
                <span className="truncate text-sm font-semibold">@{i.handle}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{haQuanto(i.publicadoEm ?? i.detectadoEm)}</span>
              </div>
              {i.legenda && <p className="line-clamp-2 text-xs text-muted-foreground">{i.legenda}</p>}
              <div className="flex items-baseline gap-3">
                <strong className="font-display text-xl">{fmt(i.views)}</strong><span className="text-xs text-muted-foreground">views</span>
                {i.engajamentoPct != null && <span className="ml-auto text-xs text-muted-foreground">{i.engajamentoPct.toLocaleString("pt-BR")}% engaj.</span>}
              </div>
              <p className="text-xs font-medium text-brand-cyan">{i.razaoTexto}{i.emAltaNicho && i.razao && i.razao >= 2 ? " · em alta no nicho" : ""}</p>
              {i.analise && <div className="flex items-center gap-2 text-xs"><StatusAnaliseBadge status={i.analise.status} /><Link to="/app/analises/$id" params={{ id: i.analise.id }} className="text-muted-foreground underline">Ver análise</Link></div>}
              <div className="mt-auto flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {i.analise?.status === "pronto"
                    ? <Button size="sm" disabled={!canCreate} onClick={() => setRoteiro({ id: i.id, assunto: `Inspirado em @${i.handle} (${i.url}).\nGancho: ${i.analise?.gancho ?? ""}\nResumo: ${i.analise?.resumo ?? ""}`.slice(0, 1500) })}><Wand2 />Criar roteiro inspirado</Button>
                    : !i.analise || i.analise.status === "erro"
                      ? <Button size="sm" disabled={analisarM.isPending} onClick={() => analisarM.mutate(i.id)}><Sparkles />Analisar</Button>
                      : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="secondary" className="ml-auto shrink-0" asChild><a href={i.url} target="_blank" rel="noreferrer" aria-label="Ver no TikTok"><TikTokIcon className="size-4" /></a></Button>
                    </TooltipTrigger>
                    <TooltipContent>Ver no TikTok</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LerComentariosButton url={i.url} titulo={i.analise?.gancho ?? `Vídeo de @${i.handle}`} origem="radar" size="sm" />
                  <Button size="sm" variant="ghost" onClick={() => ignorar.mutate(i.id)}><EyeOff />Ignorar</Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>}
  </>;
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
