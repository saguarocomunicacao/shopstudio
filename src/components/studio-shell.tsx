import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, ChevronDown, CircleGauge, Clapperboard, FileClock, KanbanSquare, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Settings, Sun, Users, UserSquare2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { profiles } from "@/lib/studio-data";
import { StudioProvider, useStudio } from "./studio-context";

const items = [
  ["Dashboard", "/", CircleGauge], ["Perfis", "/perfis", UserSquare2], ["Produtos", "/produtos", Package],
  ["Pipeline", "/pipeline", KanbanSquare], ["Vídeos", "/videos", Clapperboard], ["Rascunhos", "/rascunhos", FileClock],
  ["Métricas", "/metricas", BarChart3], ["Equipe", "/equipe", Users], ["Configurações", "/configuracoes", Settings],
] as const;

const titles: Record<string, string> = { "/": "Visão geral", "/perfis": "Perfis", "/produtos": "Produtos em alta", "/pipeline": "Pipeline de conteúdo", "/videos": "Biblioteca de vídeos", "/rascunhos": "Rascunhos", "/metricas": "Métricas", "/equipe": "Equipe e permissões", "/configuracoes": "Configurações" };

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex h-16 items-center gap-3 px-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">CS</span>{!compact && <span className="glitch-logo text-base font-black" data-text="Creator Studio">Creator Studio</span>}</div>;
}

function Nav({ compact, close }: { compact?: boolean; close?: () => void }) {
  const { isAdmin } = useStudio();
  return <nav className="space-y-1 px-2 py-3">{items.filter(([label]) => isAdmin || label !== "Equipe").map(([label, to, Icon]) => <Link key={to} to={to} activeOptions={{ exact: to === "/" }} onClick={close} className="group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"><Icon className="h-[18px] w-[18px] shrink-0 group-data-[status=active]:text-primary" />{!compact && <span>{label}</span>}</Link>)}</nav>;
}

function ProfilePicker() {
  const { activeProfile, activeProfileId, setActiveProfileId } = useStudio();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-10 max-w-[210px] justify-between gap-2 bg-card px-2.5 sm:min-w-[210px]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[9px] font-bold text-secondary-foreground">{activeProfile?.initials ?? "ALL"}</span><span className="min-w-0 flex-1 truncate text-left">{activeProfile?.name ?? "Todos os perfis"}</span><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64"><DropdownMenuLabel>Contexto ativo</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setActiveProfileId("all")} className={activeProfileId === "all" ? "bg-accent" : ""}>Todos os perfis</DropdownMenuItem>{profiles.map(p => <DropdownMenuItem key={p.id} onClick={() => setActiveProfileId(p.id)} className={activeProfileId === p.id ? "bg-accent" : ""}><span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[9px] font-bold">{p.initials}</span>{p.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false);
  const path = useRouterState({ select: s => s.location.pathname }); const { dark, setDark } = useStudio();
  return <div className="min-h-screen bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] md:block ${collapsed ? "w-16" : "w-60"}`}><Brand compact={collapsed}/><Nav compact={collapsed}/><Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} className="absolute bottom-4 right-3">{collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</Button></aside>
    {mobile && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-overlay" onClick={() => setMobile(false)}/><aside className="relative h-full w-72 border-r bg-sidebar"><Brand/><Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => setMobile(false)}><X/></Button><Nav close={() => setMobile(false)}/></aside></div>}
    <div className={`transition-[padding] ${collapsed ? "md:pl-16" : "md:pl-60"}`}><header className="sticky top-0 z-20 grid h-auto min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur-xl lg:px-8"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setMobile(true)}><Menu/></Button><div className="min-w-0"><p className="truncate text-sm font-bold sm:text-lg">{titles[path] ?? "Creator Studio"}</p><p className="hidden text-xs text-muted-foreground sm:block">Conteúdo afiliado, sob controle.</p></div></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><ProfilePicker/><div className="hidden items-center gap-2 rounded-lg border bg-card px-2.5 py-2 sm:flex">{dark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}<Switch aria-label="Alternar tema" checked={!dark} onCheckedChange={(v) => setDark(!v)}/></div><div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-xs font-bold">LA</div></div></header><main className="mx-auto max-w-[1600px] p-4 lg:p-8">{children}</main></div>
  </div>;
}

export function StudioShell({ children }: { children: ReactNode }) { return <StudioProvider><ShellContent>{children}</ShellContent></StudioProvider>; }