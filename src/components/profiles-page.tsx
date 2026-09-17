import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { DbProfile } from "@/lib/access";
import { LANGUAGE_OPTIONS, TONE_OPTIONS, formatPrice, useCategories } from "@/lib/content";
import { ETAPA_VISUAL_ORDEM, useCustoPeriodo } from "@/lib/custo-periodo";
import { formatFollowers } from "@/lib/studio-data";
import { useStudio } from "./studio-context";

const statusClass: Record<string, string> = { Ativo: "status-lime", Pausado: "status-neutral" };
function StatusBadge({ children }: { children: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass[children] ?? "status-neutral"}`}>{children}</span>;
}
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase text-primary">{eyebrow}</p><h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1></div>{action}</div>;
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

const toneLabel = (value: string) => TONE_OPTIONS.find((t) => t.value === value)?.label ?? value;
const languageLabel = (value: string) => LANGUAGE_OPTIONS.find((l) => l.value === value)?.label ?? value;

const GEMINI_LABELS: Record<string, string> = {
  "gemini-3.1-flash-image": "Equilibrado",
  "gemini-3.1-flash-lite-image": "Econômico",
  "gemini-3.1-pro-image": "Máxima qualidade",
};
const VEO_LABELS: Record<string, string> = {
  "veo-3.1-fast-generate-preview": "Rápido e econômico",
  "veo-3.1-generate-preview": "Alta qualidade",
};

type ProfileDetails = {
  tone: string | null;
  language: string | null;
  styleNotes: string | null;
  avatarMode: string | null;
  takesCount: number | null;
  takeDuration: number | null;
  geminiModel: string | null;
  veoModel: string | null;
  voiceRef: string | null;
};

const emptyDetails: ProfileDetails = { tone: null, language: null, styleNotes: null, avatarMode: null, takesCount: null, takeDuration: null, geminiModel: null, veoModel: null, voiceRef: null };

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { desde: start.toISOString(), ate: now.toISOString() };
}

function ProfileExpanded({ profile }: { profile: DbProfile }) {
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [jobsCount, setJobsCount] = useState<number | null>(null);
  const { desde, ate } = monthRange();
  const custo = useCustoPeriodo(desde, ate, [profile.id], ETAPA_VISUAL_ORDEM);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("profile_identities")
      .select("tone, language, style_notes")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setDetails((d) => ({ ...d, tone: data.tone, language: data.language, styleNotes: data.style_notes }));
      });
    void supabase
      .from("profile_video_settings")
      .select("avatar_mode, takes_count, gemini_model, veo_model, take_duration, voice_ref")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setDetails((d) => ({
          ...d,
          avatarMode: data.avatar_mode,
          takesCount: data.takes_count,
          takeDuration: data.take_duration,
          geminiModel: data.gemini_model,
          veoModel: data.veo_model,
          voiceRef: data.voice_ref ?? null,
        }));
        if (data.voice_ref) {
          void supabase.from("voices").select("nome").eq("id", data.voice_ref).maybeSingle().then(({ data: v }) => {
            if (cancelled || !v) return;
            setVoiceName(v.nome);
          });
        }
      });
    void supabase.from("jobs").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).then(({ count }) => {
      if (cancelled) return;
      setJobsCount(count ?? 0);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  const avatarModeLabel = details.avatarMode === "fixo" ? "Pessoa fixa" : details.avatarMode === "livre" ? "Pessoa nova a cada vídeo" : "—";

  return (
    <div className="grid gap-x-8 gap-y-4 rounded-lg bg-muted/45 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="sm:col-span-2 xl:col-span-4">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Identidade</p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Tom de voz: </span><span className="font-semibold">{details.tone ? toneLabel(details.tone) : "—"}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">Idioma: </span><span className="font-semibold">{details.language ? languageLabel(details.language) : "—"}</span>
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Observações de estilo: </span>
          <span className="font-semibold">{details.styleNotes?.trim() || "—"}</span>
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Geração de vídeo</p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Pessoa: </span><span className="font-semibold">{avatarModeLabel}</span>
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Cenas: </span><span className="font-semibold tabular-nums">{details.takesCount ?? "—"}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">Duração: </span><span className="font-semibold tabular-nums">{details.takeDuration ? `${details.takeDuration}s` : "—"}</span>
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Cenas: </span><span className="font-semibold">{details.geminiModel ? GEMINI_LABELS[details.geminiModel] ?? details.geminiModel : "—"}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">Animação: </span><span className="font-semibold">{details.veoModel ? VEO_LABELS[details.veoModel] ?? details.veoModel : "—"}</span>
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Voz da narração</p>
        <p className="mt-1 text-sm font-semibold">
          {details.voiceRef === null ? "—" : voiceName ?? "Carregando…"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {details.voiceRef ? "Voz selecionada" : "Padrão Azure (fallback) quando não definida"}
        </p>
      </div>
      <div className="sm:col-span-2 xl:col-span-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Resumo</p>
        <p className="mt-1 flex items-center gap-3 text-sm tabular-nums">
          <span><span className="font-semibold">{jobsCount ?? "—"}</span> <span className="text-muted-foreground">jobs</span></span>
          <span className="text-muted-foreground">·</span>
          <span><span className="font-semibold text-primary">{custo.data ? formatPrice(custo.data.totalBrl) : "—"}</span> <span className="text-muted-foreground">no mês</span></span>
        </p>
      </div>
    </div>
  );
}

export function ProfilesPage() {
  const { profiles, can, loading } = useStudio();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ["access"] });
  const { data: categories = [] } = useCategories();

  const canCreate = can("perfis", "criar");
  const [confirm, setConfirm] = useState<DbProfile | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categoryName = (p: DbProfile) =>
    categories.find((c) => c.category_id === p.category_id)?.category_name ?? p.niche?.trim() ?? "Não informado";

  const toggleStatus = useMutation({
    mutationFn: async (profile: DbProfile) => {
      const next = profile.status === "Ativo" ? "Pausado" : "Ativo";
      const { error } = await supabase.from("profiles").update({ status: next }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => { toast.success(next === "Ativo" ? "Perfil reativado." : "Perfil pausado."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (profile: DbProfile) => {
      const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Perfil removido."); setConfirm(null); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const rowActions = (p: DbProfile) => {
    const canEdit = can("perfis", "editar", p.id);
    const canRemove = can("perfis", "remover", p.id);
    if (!canEdit && !canRemove) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Gerenciar</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onSelect={() => void navigate({ to: "/app/perfis/$id/editar", params: { id: p.id } })}>
              <Pencil />Editar
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => toggleStatus.mutate(p)}>
              {p.status === "Ativo" ? <><Pause />Pausar</> : <><Play />Reativar</>}
            </DropdownMenuItem>
          )}
          {canRemove && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(p)}><Trash2 />Remover</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <>
      <Heading
        eyebrow={loading ? "Carregando" : `${profiles.length} canais conectados`}
        title="Perfis do TikTok"
        {...(canCreate ? { action: <Button asChild><Link to="/app/perfis/novo"><Plus />Adicionar perfil</Link></Button> } : {})}
      />
      {profiles.length ? (
        <TooltipProvider delayDuration={250}>
          <div className="panel hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-10" /><col className="w-12" /><col /><col className="w-36" />
                <col className="w-40" /><col className="w-24" /><col className="w-28" /><col className="w-40" />
              </colgroup>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-1 pb-3"><span className="sr-only">Expandir</span></th>
                  <th className="px-2 pb-3 font-medium">Avatar</th>
                  <th className="px-3 pb-3 font-medium">Nome</th>
                  <th className="px-3 pb-3 font-medium">Conta</th>
                  <th className="px-3 pb-3 font-medium">Categoria oficial</th>
                  <th className="px-3 pb-3 text-right font-medium">Seguidores</th>
                  <th className="px-3 pb-3 font-medium">Status</th>
                  <th className="px-1 pb-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => {
                  const isExpanded = expanded.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-b align-middle last:border-0">
                        <td className="px-1 py-2">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => toggle(p.id)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${p.name}`}>
                            <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                        </td>
                        <td className="px-2 py-2"><div className={`avatar avatar-${i % 5} size-9`}>{p.initials}</div></td>
                        <td className="min-w-0 px-3 py-2">
                          <Tooltip><TooltipTrigger asChild><span className="block min-w-0 truncate font-semibold">{p.name}</span></TooltipTrigger><TooltipContent className="max-w-sm">{p.name}</TooltipContent></Tooltip>
                        </td>
                        <td className="min-w-0 px-3 py-2"><span className="block truncate text-muted-foreground">{p.handle ? `@${p.handle}` : "sem conta vinculada"}</span></td>
                        <td className="px-3 py-2"><span className="block truncate text-muted-foreground" title={categoryName(p)}>{categoryName(p)}</span></td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatFollowers(p.followers)}</td>
                        <td className="px-3 py-2"><StatusBadge>{p.status}</StatusBadge></td>
                        <td className="px-1 py-2"><div className="flex items-center justify-end gap-1">{rowActions(p)}</div></td>
                      </tr>
                      {isExpanded && <tr className="border-b"><td colSpan={8} className="px-3 py-3"><ProfileExpanded profile={p} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {profiles.map((p, i) => {
              const isExpanded = expanded.has(p.id);
              return (
                <article key={p.id} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="grid grid-cols-[auto_36px_minmax(0,1fr)_auto] items-center gap-2">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => toggle(p.id)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${p.name}`}>
                      <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </Button>
                    <div className={`avatar avatar-${i % 5} size-9`}>{p.initials}</div>
                    <div className="min-w-0">
                      <span className="block min-w-0 truncate font-semibold">{p.name}</span>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.handle ? `@${p.handle}` : "sem conta"} · {formatFollowers(p.followers)}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1">{rowActions(p)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-3">
                    <div><p className="text-muted-foreground">Categoria</p><p className="mt-1 truncate font-semibold">{categoryName(p)}</p></div>
                    <div><p className="text-muted-foreground">Seguidores</p><p className="mt-1 font-semibold tabular-nums">{formatFollowers(p.followers)}</p></div>
                    <div><p className="text-muted-foreground">Status</p><div className="mt-1"><StatusBadge>{p.status}</StatusBadge></div></div>
                  </div>
                  {isExpanded && <div className="mt-3 border-t pt-3"><ProfileExpanded profile={p} /></div>}
                </article>
              );
            })}
          </div>
        </TooltipProvider>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {loading ? "Carregando perfis..." : "Nenhum perfil disponível para você."}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O perfil e os acessos da equipe a ele serão apagados.
            </AlertDialogDescription>
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
