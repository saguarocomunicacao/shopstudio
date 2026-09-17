import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, ChevronDown, CircleGauge, Clapperboard, FileClock, KanbanSquare, LogOut, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldAlert, ShieldCheck, Sun, Users, UserSquare2, Wand2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AppTransition, useAppTransition } from "@/components/app-transition";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/access";
import { OPEN_PROFILE_PICKER_EVENT } from "./profile-gate";
import { StudioProvider, useStudio } from "./studio-context";
import { UpdateGate } from "./update-gate";
import { SessionExpiredDialog } from "./session-expired-dialog";
import logoLightAsset from "@/assets/logo-light.png.asset.json";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";
import logoMarkLightAsset from "@/assets/logo-mark-light.png.asset.json";
import logoMarkDarkAsset from "@/assets/logo-mark-dark.png.asset.json";

const items: readonly (readonly [string, string, typeof CircleGauge, ModuleKey | null])[] = [
  ["Dashboard", "/app", CircleGauge, null], ["Perfis", "/app/perfis", UserSquare2, "perfis"], ["Produtos", "/app/produtos", Package, "produtos"],
  ["Pipeline", "/app/pipeline", KanbanSquare, "pipeline"], ["Vídeos", "/app/videos", Clapperboard, "videos"], ["Rascunhos", "/app/rascunhos", FileClock, "rascunhos"],
  ["Métricas", "/app/metricas", BarChart3, "metricas"], ["Equipe", "/app/equipe", Users, "equipe"], ["Prompts", "/app/prompts", Wand2, "prompts" as never], ["Aprovações", "/app/aprovacoes", ShieldCheck, "aprovacoes" as never], ["Configurações", "/app/configuracoes", Settings, "configuracoes"],
];

const titles: Record<string, string> = { "/app": "Visão geral", "/app/perfis": "Perfis", "/app/produtos": "Produtos em alta", "/app/pipeline": "Pipeline de conteúdo", "/app/videos": "Biblioteca de vídeos", "/app/rascunhos": "Rascunhos", "/app/metricas": "Métricas", "/app/equipe": "Equipe e permissões", "/app/prompts": "Prompts do sistema", "/app/aprovacoes": "Aprovação de cadastros", "/app/configuracoes": "Configurações" };

const initialsOf = (value: string) => value.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "US";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-16 items-center gap-3 px-4">
      {compact ? (
        <>
          <img src={logoMarkLightAsset.url} alt="Shop Studio" className="h-9 w-9 shrink-0 dark:hidden" />
          <img src={logoMarkDarkAsset.url} alt="Shop Studio" className="hidden h-9 w-9 shrink-0 dark:block" />
        </>
      ) : (
        <>
          <img src={logoLightAsset.url} alt="Shop Studio" className="h-7 w-auto shrink-0 dark:hidden" />
          <img src={logoDarkAsset.url} alt="Shop Studio" className="hidden h-7 w-auto shrink-0 dark:block" />
        </>
      )}
    </div>
  );
}

function useVisibleItems() {
  const { isAdmin, isSuperAdmin, can, activeProfileId } = useStudio();
  return items.filter(([, to, , module]) => {
    if (!module) return true;
    if (to === "/app/prompts") return isAdmin;
    if (to === "/app/aprovacoes") return isSuperAdmin;
    if (module === "equipe") return isAdmin;
    return can(module, "visualizar", activeProfileId);
  });
}

function Nav({ compact, close }: { compact?: boolean; close?: () => void }) {
  const visible = useVisibleItems();
  return <nav className="space-y-1 px-2 py-3">{visible.map(([label, to, Icon]) => <Link key={to} to={to} activeOptions={{ exact: to === "/app" }} onClick={close} className="group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-primary"><Icon strokeWidth={1.8} className="h-[18px] w-[18px] shrink-0" />{!compact && <span>{label}</span>}</Link>)}</nav>;
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

  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><Button variant="secondary" className="h-10 max-w-[210px] justify-between gap-2 px-2.5 sm:min-w-[210px]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[9px] font-bold text-background">{activeProfile?.initials ?? "?"}</span><span className="min-w-0 flex-1 truncate text-left">{activeProfile?.name ?? "Selecionar perfil"}</span><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64 rounded-xl border-border p-1.5"><DropdownMenuLabel>Perfil ativo</DropdownMenuLabel><DropdownMenuSeparator/>{profiles.map(p => <DropdownMenuItem key={p.id} onClick={() => setActiveProfileId(p.id)} className={activeProfileId === p.id ? "bg-accent font-semibold text-primary" : ""}><span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[9px] font-bold">{p.initials}</span><span className="min-w-0 flex-1 truncate">{p.name}<span className="block truncate text-xs font-normal text-muted-foreground">@{p.handle || p.slug}</span></span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
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
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-xs font-bold text-background" aria-label="Conta">{initialsOf(label)}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5"><DropdownMenuLabel className="truncate">{label}<p className="truncate text-xs font-normal text-muted-foreground">{isAdmin ? "Administrador" : "Membro"}</p></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4"/>Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
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
    <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] md:block ${collapsed ? "w-16" : "w-60"}`}><Brand compact={collapsed}/><Nav compact={collapsed}/><Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} className="absolute bottom-4 right-3">{collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</Button></aside>
    {mobile && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-overlay" onClick={() => setMobile(false)}/><aside className="relative h-full w-72 border-r bg-sidebar"><Brand/><Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => setMobile(false)}><X/></Button><Nav close={() => setMobile(false)}/></aside></div>}
    <div className={`transition-[padding] ${collapsed ? "md:pl-16" : "md:pl-60"}`}><header className="sticky top-0 z-20 grid h-auto min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-xl lg:px-8"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setMobile(true)}><Menu/></Button><div className="min-w-0"><p className="truncate text-sm font-bold sm:text-lg">{titles[path] ?? "Shop Studio"}</p><p className="hidden text-xs text-muted-foreground sm:block">Conteúdo afiliado, sob controle.</p></div></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><ProfilePicker/><div className="hidden items-center gap-2 rounded-lg bg-secondary px-2.5 py-2 sm:flex">{dark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}<Switch aria-label="Alternar tema" checked={!dark} onCheckedChange={(v) => setDark(!v)}/></div><UserMenu/></div></header><main className="w-full p-4 lg:p-8">{children}</main></div>
  </div>;
}

export function StudioShell({ children }: { children: ReactNode }) { return <StudioProvider><ShellContent>{children}</ShellContent><UpdateGate/><SessionExpiredDialog/></StudioProvider>; }
