import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bot, Camera, CircleGauge, Clapperboard, Copy, Download, FileClock, KanbanSquare, Compass, Package, PiggyBank, Plus, Radar, Sparkles, Upload, UserSquare2, Wallet, Menu } from "lucide-react";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";

/** Prévias fiéis (dados de exemplo fixos) das telas reais usadas no guia. */

const NAV: [string | null, [string, typeof CircleGauge][]][] = [
  [null, [["Visão geral", CircleGauge]]],
  ["Configurar", [["Perfis", UserSquare2], ["Automação", Bot]]],
  ["Produzir", [["Explorar", Compass], ["Pipeline", KanbanSquare], ["Rascunhos", FileClock], ["Vídeos", Clapperboard]]],
  ["Inteligência", [["Analisar vídeo", Sparkles], ["Perfis de referência", Radar], ["Radar", Radar]]],
  ["Acompanhar", [["Métricas", BarChart3], ["Custos", Wallet], ["Investimento", PiggyBank]]],
];

/** Alvo destacado: contorno magenta de 2px com pulsação e número opcional. */
function T({ n, children, className = "" }: { n?: number | undefined; children: ReactNode; className?: string }) {
  return (
    <span className={`tour-target relative inline-flex rounded-lg ${className}`}>
      {children}
      {n !== undefined && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</span>}
    </span>
  );
}

function Btn({ children, variant = "primary", small }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost"; small?: boolean }) {
  const v = variant === "primary" ? "bg-primary text-primary-foreground" : variant === "secondary" ? "border border-border bg-secondary text-foreground" : "text-muted-foreground";
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium ${small ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm"} ${v}`}>{children}</span>;
}

function Tabs({ items, active, target, targetN }: { items: string[]; active: string; target?: string; targetN?: number }) {
  return (
    <div className="mb-4 flex gap-5 border-b border-border">
      {items.map((it) => {
        const el = <span className={`-mb-px inline-block h-9 border-b-2 px-0.5 text-sm font-medium leading-9 ${it === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{it}</span>;
        return it === target ? <T key={it} n={targetN}>{el}</T> : <span key={it}>{el}</span>;
      })}
    </div>
  );
}

function Header({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div><h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>{desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}</div>
      {action}
    </div>
  );
}

const Badge = ({ c, children }: { c: string; children: string }) => <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
const Thumb = ({ className = "" }: { className?: string }) => <span className={`block rounded-md bg-gradient-to-br from-primary/40 to-brand-cyan/30 ${className}`} />;

function Chrome({ active, crumb, mobile, children }: { active: string; crumb: string; mobile: boolean; children: ReactNode }) {
  return (
    <div className="flex h-full bg-background text-foreground">
      {!mobile && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex h-14 items-center px-5"><img src={logoDarkAsset.url} alt="" className="h-6" /></div>
          <div className="px-3 pt-2">
            {NAV.map(([g, list], i) => (
              <div key={g ?? "top"} className={i > 0 ? "mt-3 border-t border-sidebar-border pt-3" : ""}>
                {g && <p className="px-3 pb-1.5 text-xs font-medium text-sidebar-label">{g}</p>}
                {list.map(([label, Icon]) => (
                  <div key={label} className={`relative flex h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium ${label === active ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand-cyan" : "text-sidebar-foreground"}`}>
                    <Icon strokeWidth={1.8} className="size-[18px]" />{label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <span className="flex items-center gap-3 text-sm text-muted-foreground">{mobile && <Menu className="size-5" />}{mobile ? crumb.split(" / ").pop() : crumb}</span>
          <span className="flex items-center gap-2 rounded-full border border-border bg-secondary py-1 pl-1 pr-3 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-full bg-foreground text-[9px] font-bold text-background">BL</span>{!mobile && "Beleza em alta"}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">{children}</div>
      </div>
    </div>
  );
}

const PRODUCTS = [["Power bank rosa 10.000 mAh", "R$ 89,90", "18%", "12,4 mil"], ["Garrafa térmica 1L", "R$ 59,90", "15%", "8,1 mil"], ["Escova secadora 3 em 1", "R$ 129,00", "20%", "5,7 mil"], ["Kit skincare noturno", "R$ 74,50", "22%", "3,9 mil"]];

function ProductsTable({ action }: { action: (i: number) => ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[1fr_110px_100px_110px_190px] border-b border-border px-4 py-2 text-xs text-muted-foreground"><span>Produto</span><span>Preço</span><span>Comissão</span><span>Vendas</span><span /></div>
      {PRODUCTS.map(([n, p, c, v], i) => (
        <div key={n} className="grid grid-cols-[1fr_110px_100px_110px_190px] items-center border-b border-border px-4 py-2.5 text-sm last:border-0">
          <span className="flex items-center gap-3"><Thumb className="size-9" />{n}</span><span>{p}</span><span className="text-brand-cyan">{c}</span><span>{v}</span><span className="flex justify-end">{action(i)}</span>
        </div>
      ))}
    </div>
  );
}

function DraftCards({ tab, button }: { tab: string; button: (i: number) => ReactNode }) {
  return (
    <>
      <Header title="Rascunhos" desc="Cada vídeo pronto vira um kit de postagem." />
      <div className="mb-5 inline-flex rounded-lg bg-muted p-1 text-sm">
        {["Roteiros prontos", "Aguardando revisão", "Aprovados", "Publicados", "Lixeira"].map((t) => <span key={t} className={`rounded-md px-3 py-1.5 ${t === tab ? "bg-background font-medium text-foreground" : "text-muted-foreground"}`}>{t}</span>)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["Power bank que salva o dia", "3 motivos pra ter essa garrafa", "Secadora que virou febre"].map((t, i) => (
          <div key={t} className="rounded-lg border border-border bg-card p-3">
            <Thumb className="mb-3 aspect-[9/12] w-full" />
            <p className="truncate text-sm font-semibold">{t}</p>
            <p className="mb-3 text-xs text-muted-foreground">Beleza em alta  há 2 h</p>
            {button(i)}
          </div>
        ))}
      </div>
    </>
  );
}

function JobDetail({ scenes }: { scenes: boolean }) {
  return (
    <div className="grid h-full place-items-center bg-overlay/40">
      <div className="w-[760px] rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><p className="font-display text-lg font-semibold">Power bank que salva o dia</p><Badge c={scenes ? "status-cyan" : "status-violet"}>{scenes ? "Cenas geradas" : "Roteiro pronto"}</Badge></div>
        {scenes ? (
          <>
            <T n={1} className="w-full"><div className="grid w-full grid-cols-4 gap-3 p-1">{[1, 2, 3, 4].map((i) => <div key={i}><Thumb className="aspect-[9/16] w-full" /><p className="mt-1 text-xs text-muted-foreground">Cena {i}</p></div>)}</div></T>
            <div className="mt-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">Estimativa: R$ 4,80</span><T n={2}><Btn><Clapperboard className="size-4" />Aprovar e gerar vídeo</Btn></T></div>
          </>
        ) : (
          <>
            <T n={1} className="w-full"><div className="grid w-full gap-2 p-1">{[["Gancho", "Seu celular morreu de novo no meio do dia?"], ["Corpo", "Esse power bank carrega duas vezes e cabe no bolso."], ["CTA", "Toca no carrinho e garante o seu."]].map(([l, v]) => <div key={l}><p className="text-xs text-muted-foreground">{l}</p><div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{v}</div></div>)}</div></T>
            <div className="mt-4 flex justify-end gap-2"><Btn variant="secondary">Salvar</Btn><T n={2}><Btn>Avançar</Btn></T></div>
          </>
        )}
      </div>
    </div>
  );
}

function Screen({ i, mobile }: { i: number; mobile: boolean }) {
  switch (i) {
    case 0: return <Chrome active="Perfis" crumb="Configurar / Perfis" mobile={mobile}>
      <Header title="Perfis" desc="Cada perfil é um canal do TikTok." action={<T><Btn><Plus className="size-4" />Adicionar perfil</Btn></T>} />
      <div className="rounded-lg border border-border bg-card">{["Beleza em alta", "Casa prática"].map((n) => <div key={n} className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0"><span className="grid size-8 place-items-center rounded-full bg-foreground text-xs font-bold text-background">{n[0]}</span><span className="flex-1">{n}</span><Badge c="status-lime">Ativo</Badge></div>)}</div>
    </Chrome>;
    case 1: return <Chrome active="Perfis" crumb="Configurar / Perfis" mobile={mobile}>
      <Header title="Beleza em alta" />
      <Tabs items={["Dados do perfil", "Identidade", "Geração de vídeo", "Pessoa / Avatar", "Meus avatares", "Voz"]} active="Pessoa / Avatar" />
      <p className="mb-1 text-sm text-muted-foreground">Modo</p>
      <T n={1}><div className="w-72 rounded-lg border border-border bg-background px-3 py-2 text-sm">Sempre a mesma pessoa</div></T>
      <div className="mt-4 rounded-xl bg-secondary p-4"><p className="text-sm font-semibold">Pessoa fixa do perfil</p><div className="mt-3 inline-flex rounded-lg bg-background p-1 text-xs font-bold"><span className="px-3 py-1.5 text-muted-foreground">Gerar por IA</span><T n={2}><span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"><Upload className="mr-1 inline size-3" />Enviar fotos</span></T></div><div className="mt-3 flex gap-2">{[1, 2, 3].map((k) => <Thumb key={k} className="size-16" />)}</div></div>
    </Chrome>;
    case 2: return <Chrome active="Explorar" crumb="Produzir / Explorar" mobile={mobile}>
      <Header title="Explorar" desc="Produtos e criadores em alta no TikTok Shop, vindos do Kalodata" />
      <Tabs items={["Catálogo", "Descobrir", "Em ascensão"]} active="Descobrir" target="Descobrir" targetN={1} />
      <ProductsTable action={(k) => k === 0 ? <T n={2}><Btn small variant="secondary">Salvar no catálogo</Btn></T> : <Btn small variant="secondary">Salvar no catálogo</Btn>} />
    </Chrome>;
    case 3: return <Chrome active="Explorar" crumb="Produzir / Explorar" mobile={mobile}>
      <Header title="Explorar" />
      <Tabs items={["Catálogo", "Descobrir", "Em ascensão"]} active="Catálogo" />
      <div className="relative">
        <ProductsTable action={() => <Btn small><Sparkles className="size-3.5" />Usar</Btn>} />
        <div className="absolute right-4 top-16 w-72 rounded-xl border border-border bg-card p-2 shadow-xl">
          <T className="w-full"><div className="grid w-full gap-1 p-1">{[["Completo", "IA gera roteiro, cenas e vídeo"], ["Gravar eu mesmo", "IA gera o roteiro, você grava"], ["Novo vídeo próprio", "Assunto livre, sem produto"]].map(([t, d]) => <div key={t} className="rounded-lg px-3 py-2 hover:bg-muted"><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-foreground">{d}</p></div>)}</div></T>
        </div>
      </div>
    </Chrome>;
    case 4: return <Chrome active="Pipeline" crumb="Produzir / Pipeline" mobile={mobile}><JobDetail scenes={false} /></Chrome>;
    case 5: return <Chrome active="Pipeline" crumb="Produzir / Pipeline" mobile={mobile}><JobDetail scenes /></Chrome>;
    case 6: return <Chrome active="Rascunhos" crumb="Produzir / Rascunhos" mobile={mobile}>
      <DraftCards tab="Roteiros prontos" button={(k) => { const b = <Btn small><Camera className="size-3.5" />Gravar vídeo</Btn>; return k === 0 ? <T>{b}</T> : b; }} />
    </Chrome>;
    case 7: return <Chrome active="Rascunhos" crumb="Produzir / Rascunhos" mobile={mobile}>
      <DraftCards tab="Aguardando revisão" button={(k) => { const b = <Btn small>Aprovar para postagem</Btn>; return k === 0 ? <T>{b}</T> : b; }} />
    </Chrome>;
    case 8: return <Chrome active="Rascunhos" crumb="Produzir / Rascunhos" mobile={mobile}>
      <div className="grid h-full place-items-center bg-overlay/40">
        <div className="flex w-[720px] gap-5 rounded-xl border border-border bg-card p-5 shadow-xl">
          <div className="w-48 shrink-0"><Thumb className="aspect-[9/16] w-full" /><div className="mt-3"><T n={1} className="w-full"><Btn><Download className="size-4" />Baixar vídeo</Btn></T></div></div>
          <div className="grid flex-1 content-start gap-3">
            <p className="font-display text-lg font-semibold">Kit de postagem</p>
            {[["Título", "Power bank que salva o dia"], ["Legenda", "Nunca mais fique sem bateria 🔋"], ["Hashtags", "#tiktokshop #achadinhos #powerbank"]].map(([l, v], k) => (
              <div key={l}><p className="text-xs text-muted-foreground">{l}</p><div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"><span className="flex-1 truncate">{v}</span>{k === 1 ? <T n={2}><Btn small variant="ghost"><Copy className="size-3.5" />Copiar</Btn></T> : <Btn small variant="ghost"><Copy className="size-3.5" />Copiar</Btn>}</div></div>
            ))}
          </div>
        </div>
      </div>
    </Chrome>;
    default: return <Chrome active="Automação" crumb="Configurar / Automação" mobile={mobile}>
      <Header title="Automação" desc="Gera vídeos por IA nos horários definidos." />
      <div className="mb-4 flex items-center justify-between"><div><p className="font-display text-lg font-semibold">Agendas de Beleza em alta</p><p className="text-sm text-muted-foreground">1 agenda · 1 ativa</p></div><T n={1}><Btn><Plus className="size-4" />Nova agenda</Btn></T></div>
      <div className="rounded-lg border border-border bg-card p-4"><p className="mb-3 text-sm font-medium">Agenda diária</p><T n={2}><div className="flex gap-2 p-1">{["08:00", "12:00", "19:00"].map((h) => <span key={h} className="rounded-lg border border-border px-3 py-1.5 text-sm">{h}</span>)}</div></T></div>
    </Chrome>;
  }
}

export function ScreenPreview({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const upd = () => setMobile(mq.matches);
    upd(); mq.addEventListener("change", upd);
    const ro = new ResizeObserver(([e]) => setW(e?.contentRect.width ?? 0));
    if (ref.current) ro.observe(ref.current);
    return () => { mq.removeEventListener("change", upd); ro.disconnect(); };
  }, []);
  const baseW = mobile ? 390 : 1280;
  const baseH = mobile ? 700 : 800;
  const scale = w ? w / baseW : 0;
  return (
    <div aria-hidden className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="size-2 rounded-full bg-muted-foreground/40" /><span className="size-2 rounded-full bg-muted-foreground/40" /><span className="size-2 rounded-full bg-muted-foreground/40" />
      </div>
      <div ref={ref} className="pointer-events-none relative w-full select-none overflow-hidden" style={{ aspectRatio: `${baseW} / ${baseH}` }}>
        {scale > 0 && <div className="absolute left-0 top-0 origin-top-left" style={{ width: baseW, height: baseH, transform: `scale(${scale})` }}><Screen i={index} mobile={mobile} /></div>}
      </div>
    </div>
  );
}
