import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, BarChart3, Bot, ChevronDown, CircleGauge, Clapperboard, FileVideo2, FileClock, KanbanSquare, KeyRound, Landmark, LogOut, Menu, Moon, Compass, Package, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldAlert, Sun, PiggyBank, Radar, Search, UserCog, Users, UserSquare2, Wallet, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AppTransition, useAppTransition } from "@/components/app-transition";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/access";
import { OPEN_PROFILE_PICKER_EVENT } from "./profile-gate";
import { useAvatarUrl } from "./account-page";
import { ProfileImage } from "./profile-image";
import { StudioProvider, useStudio } from "./studio-context";
import { UpdateGate } from "./update-gate";
import { OnboardingHost, openOnboarding } from "./onboarding-guide";
import { TourHighlighter } from "./tour-highlighter";
import { AssistentePainel } from "./assistente-painel";
import { SessionExpiredDialog } from "./session-expired-dialog";
import { useTenants } from "@/lib/tenants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MissingKeyDialog, PendingKeysBanner } from "./missing-key-dialog";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";
import logoMarkDarkAsset from "@/assets/logo-mark-dark.png.asset.json";

type NavItem = readonly [string, string, typeof CircleGauge, ModuleKey | null];
const groups: readonly (readonly [string, readonly NavItem[]])[] = [
  ["", [["Visão geral", "/app", CircleGauge, null]]],
  ["Configurar", [["Perfis", "/app/perfis", UserSquare2, "perfis"], ["Automação", "/app/automacao", Bot, null]]],
  ["Produzir", [["Explorar", "/app/produtos", Compass, "produtos"], ["Pipeline", "/app/pipeline", KanbanSquare, "pipeline"], ["Rascunhos", "/app/rascunhos", FileClock, "rascunhos"], ["Vídeos", "/app/videos", Clapperboard, "videos"]]],
  ["Inteligência", [["Analisar vídeo", "/app/analises", FileVideo2, "videos"], ["Perfis de referência", "/app/referencias", Users, "metricas"], ["Radar", "/app/radar", Radar, "metricas"], ["Pesquisar", "/app/pesquisa", Search, "metricas"]]],
  ["Acompanhar", [["Métricas", "/app/metricas", BarChart3, "metricas"], ["Custos", "/app/custos", Wallet, "custos"], ["Investimento", "/app/investimento", PiggyBank, "investimento"]]],
  ["Administrar", [["Equipe", "/app/equipe", Users, "equipe"], ["Empresas", "/app/empresas", Landmark, "backoffice"], ["Planos", "/app/planos", Wallet, "backoffice"], ["Configurações", "/app/configuracoes", Settings, "configuracoes"]]],
];
const NEEDS_PROFILE = new Set(["Produzir", "Inteligência", "Acompanhar"]);
/** Detalhes (/app/analises/:id, /app/referencias/:id) usam o título da lista. */
const basePath = (p: string) => p.replace(/^\/app\/(analises|referencias|pesquisa)\/.+$/, "/app/$1");
const groupOf: Record<string, string> = Object.fromEntries(groups.flatMap(([g, list]) => g ? list.map(([, to]) => [to, g]) : []));
groupOf["/app/prompts"] = "Administrar"; groupOf["/app/aprovacoes"] = "Administrar"; groupOf["/app/conta"] = "Conta"; groupOf["/app/apis"] = "Conta";

const titles: Record<string, string> = { "/app": "Visão geral", "/app/perfis": "Perfis", "/app/produtos": "Explorar", "/app/pipeline": "Pipeline de conteúdo", "/app/automacao": "Automação", "/app/videos": "Biblioteca de vídeos", "/app/analises": "Analisar vídeo", "/app/referencias": "Perfis de referência", "/app/radar": "Radar", "/app/pesquisa": "Pesquisar", "/app/rascunhos": "Rascunhos", "/app/metricas": "Métricas", "/app/custos": "Custos", "/app/investimento": "Investimento nos fornecedores", "/app/equipe": "Equipe e permissões", "/app/prompts": "Prompts do sistema", "/app/aprovacoes": "Empresas", "/app/empresas": "Empresas", "/app/planos": "Planos", "/app/configuracoes": "Configurações" };


const initialsOf = (value: string) => value.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "US";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex h-16 items-center ${compact ? "justify-center px-2" : "px-6"}`}>
      {compact
        ? <img src={logoMarkDarkAsset.url} alt="Shop Studio" className="h-8 w-8 shrink-0" />
        : <img src={logoDarkAsset.url} alt="Shop Studio" className="h-7 w-auto shrink-0" />}
    </div>
  );
}

function useVisibleGroups() {
  const { isAdmin, isBackoffice, can, activeProfileId } = useStudio();
  const allowed = ([, to, , module]: NavItem) => {
    if (!module) return true;
    if (to === "/app/empresas" || to === "/app/planos") return isBackoffice;
    if (to === "/app/configuracoes") return isBackoffice;
    if (module === "equipe") return isAdmin;
    if (module === "investimento") return isBackoffice || can("investimento", "visualizar", activeProfileId);
    return can(module, "visualizar", activeProfileId);
  };
  return groups.map(([g, list]) => [g, list.filter(allowed)] as const).filter(([, list]) => list.length > 0);
}

function Nav({ compact, close }: { compact?: boolean; close?: () => void }) {
  const visible = useVisibleGroups();
  const { profiles, loading } = useStudio();
  const navigate = useNavigate();
  const noProfile = !loading && profiles.length === 0;
  const itemClass = `relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:before:absolute data-[status=active]:before:inset-y-0 data-[status=active]:before:left-0 data-[status=active]:before:w-[3px] data-[status=active]:before:bg-brand-cyan ${compact ? "justify-center px-0" : "px-3"}`;
  const wrap = (node: ReactNode, label: string, force = false) => (compact || force ? (
    <Tooltip><TooltipTrigger asChild>{node}</TooltipTrigger><TooltipContent side="right" className="rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-normal text-foreground shadow-md">{label}</TooltipContent></Tooltip>
  ) : node);
  return <TooltipProvider delayDuration={300}><nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-16 pt-2">{visible.map(([group, list], i) => {
    const locked = noProfile && NEEDS_PROFILE.has(group);
    return <div key={group || "top"} className={i > 0 ? "mt-3 border-t border-sidebar-border pt-3" : ""}>{!compact && group && <p className="px-3 pb-1.5 text-xs font-medium text-sidebar-label">{group}</p>}<div className="space-y-0.5">{list.map(([label, to, Icon]) => {
      const inner = <><Icon strokeWidth={1.8} className="h-[18px] w-[18px] shrink-0" />{!compact && <span className="truncate">{label}</span>}</>;
      if (locked) {
        const btn = <button key={to} type="button"  aria-label={`${label} (crie um perfil primeiro)`} onClick={() => { close?.(); toast.info("Crie um perfil primeiro."); navigate({ to: "/app/perfis" }); }} className={`${itemClass} opacity-40`}>{inner}</button>;
        return wrap(btn, compact ? `${label}: crie um perfil primeiro` : "Crie um perfil primeiro", true);
      }
      const link = <Link key={to} to={to} aria-label={label} activeOptions={{ exact: to === "/app" }} onClick={close} className={itemClass}>{inner}</Link>;
      return compact ? wrap(link, label) : link;
    })}</div></div>;
  })}</nav></TooltipProvider>;
}

function ProfilePicker() {
  const { activeProfile, activeProfileId, setActiveProfileId, profiles } = useStudio();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_PROFILE_PICKER_EVENT, handler);
    return () => window.removeEventListener(OPEN_PROFILE_PICKER_EVENT, handler);
  }, []);

  if (!profiles.length) {
    return <Button asChild variant="secondary" className="h-10 gap-2 px-3"><Link to="/app/perfis"><Plus className="h-4 w-4" />Criar perfil</Link></Button>;
  }

  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><Button variant="secondary" className="h-10 max-w-[230px] justify-between gap-2 rounded-full pl-1.5 pr-3 sm:min-w-[200px]">{activeProfile ? <ProfileImage profile={activeProfile} className="size-6 bg-foreground text-[9px] text-background" /> : <span className="grid size-6 place-items-center rounded-full bg-foreground text-[9px] font-bold text-background">?</span>}<span className="min-w-0 flex-1 truncate text-left font-display text-[15px] font-semibold">{activeProfile?.name ?? "Selecionar perfil"}</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64 rounded-[14px] border-border p-1.5"><DropdownMenuLabel>Perfil ativo</DropdownMenuLabel><DropdownMenuSeparator/>{profiles.map(p => <DropdownMenuItem key={p.id} onClick={() => setActiveProfileId(p.id)} className={activeProfileId === p.id ? "bg-accent font-semibold text-primary" : ""}><ProfileImage profile={p} className="size-7 text-[9px]" /><span className="min-w-0 flex-1 truncate">{p.name}<span className="block truncate text-xs font-normal text-muted-foreground">@{p.handle || p.slug}</span></span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function TenantPicker() {
  const { isBackoffice, tenantId, setTenantId } = useStudio();
  const { data: tenants = [] } = useTenants();
  if (!isBackoffice) return null;
  return <Select value={tenantId ?? "all"} onValueChange={(v) => setTenantId(v === "all" ? null : v)}><SelectTrigger aria-label="Empresa" className="h-10 w-[150px] rounded-full sm:w-[200px]"><Landmark className="h-4 w-4 shrink-0 text-muted-foreground" /><SelectValue placeholder="Empresa" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>;
}

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { runTransition } = useAppTransition();
  return async () => {
    await runTransition("leaving");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/entrar", replace: true });
  };
}

function UserMenu() {
  const { access, isAdmin } = useStudio();
  const signOut = useSignOut();
  const label = access?.me?.name || access?.me?.email || "Usuário";
  const { data: avatarUrl } = useAvatarUrl(access?.me?.avatar_url);
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-foreground text-xs font-bold text-background" aria-label="Conta">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initialsOf(label)}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5"><DropdownMenuLabel className="truncate">{label}<p className="truncate text-xs font-normal text-muted-foreground">{isAdmin ? "Administrador" : "Membro"}</p></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem asChild><Link to="/app/conta"><UserCog className="h-4 w-4"/>Minha conta</Link></DropdownMenuItem>{isAdmin && <DropdownMenuItem asChild><Link to="/app/apis"><KeyRound className="h-4 w-4"/>Minhas APIs</Link></DropdownMenuItem>}<DropdownMenuItem onClick={openOnboarding}><BookOpen className="h-4 w-4"/>Guia do Shop Studio</DropdownMenuItem><DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4"/>Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function PendingAccess() {
  const { access, approvalStatus } = useStudio();
  const signOut = useSignOut();
  const refused = approvalStatus === "recusado";
  const waiting = approvalStatus === "pendente";
  const title = refused ? "Acesso não liberado" : waiting ? "Aguardando aprovação" : "Aguardando liberação de acesso";
  const text = refused
    ? `O cadastro de ${access?.me?.email ?? "sua conta"} não foi liberado pelo administrador.`
    : waiting
      ? `Seu cadastro (${access?.me?.email ?? ""}) foi recebido e passará por avaliação. Você poderá acessar assim que for liberado pelo administrador.`
      : `Sua conta (${access?.me?.email ?? ""}) foi liberada, mas ainda não recebeu nenhum perfil. Peça ao administrador para configurar seu acesso na tela de Equipe.`;
  return <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><div className="panel max-w-md text-center"><span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary"><ShieldAlert className="h-5 w-5 text-primary"/></span><h1 className="text-xl font-black">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p><Button variant="secondary" className="mt-6" onClick={signOut}>Sair</Button></div></div>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false);
  const path = useRouterState({ select: s => s.location.pathname }); const { dark, setDark, loading, pendingAccess } = useStudio();

  if (loading) return <AppTransition mode="loading" />;
  if (pendingAccess) return <PendingAccess/>;

  return <div className="min-h-screen bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex ${collapsed ? "w-16" : "w-60"}`}><Brand compact={collapsed}/><Nav compact={collapsed}/><Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} className={`absolute bottom-4 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground ${collapsed ? "left-3" : "right-3"}`}>{collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</Button></aside>
    {mobile && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-overlay" onClick={() => setMobile(false)}/><aside className="relative flex h-full w-72 flex-col bg-sidebar"><Brand/><Button variant="ghost" size="icon" className="absolute right-3 top-3 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground" onClick={() => setMobile(false)}><X/></Button><Nav close={() => setMobile(false)}/></aside></div>}
    <div className={`transition-[padding] ${collapsed ? "md:pl-16" : "md:pl-60"}`}><header className="sticky top-0 z-20 grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 lg:px-8"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setMobile(true)}><Menu/></Button><nav aria-label="Você está em" className="min-w-0 truncate text-sm text-muted-foreground">{groupOf[basePath(path)] ? <>{groupOf[basePath(path)]}<span className="mx-1.5">/</span></> : null}<span className="text-foreground">{titles[basePath(path)] ?? "Shop Studio"}</span></nav></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><TenantPicker/><ProfilePicker/><div className="hidden items-center gap-2 px-1 text-muted-foreground sm:flex">{dark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}<Switch aria-label="Alternar tema" checked={!dark} onCheckedChange={(v) => setDark(!v)}/></div><UserMenu/></div></header><main className="w-full p-4 lg:p-8"><PendingKeysBanner/>{children}</main></div>
    <AssistentePainel/>
  </div>;
}

export function StudioShell({ children }: { children: ReactNode }) { return <StudioProvider><ShellContent>{children}</ShellContent><UpdateGate/><SessionExpiredDialog/><MissingKeyDialog/><OnboardingHost/><TourHighlighter/></StudioProvider>; }
