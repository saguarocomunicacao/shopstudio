import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Clapperboard, FileText, Images, Package, Send, ShieldCheck, Sparkles, UserSquare2, UsersRound, Video, X, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useStudio } from "./studio-context";

export const OPEN_ONBOARDING_EVENT = "shopstudio:open-onboarding";
export function openOnboarding() { window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT)); }

type Step = { title: string; text: string; todo: string[]; to: string; cta?: string; icon: LucideIcon; mock: string[] };

const STEPS: Step[] = [
  { icon: UsersRound, title: "Crie seu perfil", text: "Cada perfil é um canal do TikTok. Informe nome, @, categoria oficial, tom de voz e idioma. A categoria é o que casa os produtos com o perfil.", todo: ["Abra Perfis e clique em Adicionar perfil", "Preencha as abas Dados e Identidade", "Salve o perfil"], to: "/app/perfis", mock: ["Nome do canal", "@usuario", "Categoria oficial", "Tom de voz"] },
  { icon: UserSquare2, title: "Escolha quem aparece nos vídeos", text: "Use uma pessoa nova a cada vídeo ou uma pessoa fixa com até 5 fotos de referência. Defina o estilo visual (realista, cartoon, 3D) e a voz da narração, padrão ou clonada.", todo: ["Abra o perfil selecionado", "Configure as abas Pessoa/Avatar e Meus avatares", "Escolha a voz na aba Voz"], to: "/app/perfis", mock: ["Pessoa fixa", "Fotos de referência", "Estilo visual", "Voz da narração"] },
  { icon: Package, title: "Garimpe produtos em alta", text: "O Descobrir busca no TikTok Shop produtos com programa de afiliado, com preço, comissão e vendas. Em ascensão mostra os que estão subindo antes de saturar.", todo: ["Abra Produtos e vá em Descobrir", "Filtre por categoria e comissão", "Salve os melhores no catálogo"], to: "/app/produtos", mock: ["Power bank rosa", "Comissão 18%", "Em ascensão", "Salvar no catálogo"] },
  { icon: Clapperboard, title: "Escolha o formato do vídeo", text: "Completo: a IA gera roteiro, cenas e vídeo. Gravar eu mesmo: a IA gera só o roteiro e você grava no estúdio. Novo vídeo próprio: assunto livre, sem produto.", todo: ["Clique em Usar no produto", "Escolha o formato"], to: "/app/produtos", mock: ["Completo", "Gravar eu mesmo", "Novo vídeo próprio"] },
  { icon: FileText, title: "Revise o roteiro", text: "Gancho, corpo, CTA, legenda e hashtags vêm no tom do perfil, inspirados nos vídeos que mais venderam na categoria. Tudo é editável e pode ser gerado de novo.", todo: ["Abra o Pipeline", "Abra o job e ajuste o roteiro", "Avance para a próxima etapa"], to: "/app/pipeline", mock: ["Gancho", "Corpo", "CTA", "Legenda e hashtags"] },
  { icon: Images, title: "Aprove as cenas antes do vídeo", text: "As imagens das cenas são baratas; o vídeo é a parte cara. Gere de novo as que não gostar e só então libere a animação. A estimativa de custo aparece antes.", todo: ["No job, revise as cenas", "Clique em Aprovar e gerar vídeo"], to: "/app/pipeline", mock: ["Cena 1", "Cena 2", "Cena 3", "Estimativa de custo"] },
  { icon: Video, title: "Ou grave no estúdio", text: "O teleprompter fica sobre a câmera, em 9:16, com filtros e redução de ruído. Depois edite: apare as pontas, corte trechos e ajuste o enquadramento.", todo: ["Abra Rascunhos > Roteiros prontos", "Clique em Gravar vídeo"], to: "/app/rascunhos", mock: ["Teleprompter", "Gravar", "Aparar", "Enquadrar"] },
  { icon: ShieldCheck, title: "Revise e aprove", text: "O vídeo pronto entra em Rascunhos > Aguardando revisão. Assista, compartilhe por link público com quem aprova e aprove para postagem.", todo: ["Abra Rascunhos > Aguardando revisão", "Clique em Aprovar para postagem"], to: "/app/rascunhos", mock: ["Assistir", "Link público", "Aprovar para postagem"] },
  { icon: Send, title: "Poste com o kit de postagem", text: "O kit tem o vídeo para baixar, título, legenda, hashtags e o link do produto. A publicação é manual no app do TikTok: suba o vídeo, cole os textos e marque o produto no carrinho. Sem essa marcação não há comissão.", todo: ["Abra Rascunhos > Aprovados", "Clique em Abrir kit de postagem", "Marque o produto no carrinho ao publicar"], to: "/app/rascunhos", mock: ["Baixar vídeo", "Legenda", "Hashtags", "Link do produto"] },
  { icon: Bot, title: "Deixe rodar sozinho", text: "A Automação gera vídeos por IA nos horários que você definir e para em Aguardando revisão. Nada é publicado sem você.", todo: ["Abra Automação", "Defina horários e vídeos por dia"], to: "/app/automacao", mock: ["08:00", "12:00", "19:00", "Aguardando revisão"] },
];

const AFTER_ROTEIRO = ["roteiro_pronto", "gerando_cenas", "cenas_geradas", "gerando_video", "video_pronto", "rascunho_enviado", "publicado"];
const AFTER_CENAS = ["gerando_video", "video_pronto", "rascunho_enviado", "publicado"];

async function has(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await q;
  return !error && (count ?? 0) > 0;
}

export function useOnboarding() {
  const { userId, can, activeProfileId } = useStudio();
  const showAuto = can("automacao", "visualizar", activeProfileId);
  const me = useQuery({
    queryKey: ["onboarding-me", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("app_users").select("onboarding_seen, onboarding_step, onboarding_banner_hidden").eq("id", userId!).maybeSingle();
      return data ?? { onboarding_seen: true, onboarding_step: 0, onboarding_banner_hidden: true };
    },
  });
  const progress = useQuery({
    queryKey: ["onboarding-progress", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const head = { count: "exact" as const, head: true };
      return Promise.all([
        has(supabase.from("profiles").select("id", head)),
        has(supabase.from("profile_video_settings").select("profile_id", head).or("avatar_mode.not.is.null,voice_ref.not.is.null")),
        has(supabase.from("products").select("id", head)),
        has(supabase.from("jobs").select("id", head).in("status", AFTER_ROTEIRO)),
        has(supabase.from("jobs").select("id", head).in("status", AFTER_ROTEIRO)),
        has(supabase.from("jobs").select("id", head).in("status", AFTER_CENAS)),
        has(supabase.from("jobs").select("id", head).not("recorded_at", "is", null)),
        has(supabase.from("jobs").select("id", head).not("approved_at", "is", null)),
        has(supabase.from("jobs").select("id", head).eq("status", "publicado")),
        has(supabase.from("automation_schedules").select("id", head)),
      ]);
    },
  });
  const steps = showAuto ? STEPS : STEPS.slice(0, 9);
  const done = (progress.data ?? []).slice(0, steps.length);
  return { me: me.data, steps, done, doneCount: done.filter(Boolean).length, loaded: !!me.data && !!progress.data };
}

async function saveOnboarding(p: { _seen?: boolean; _step?: number; _banner_hidden?: boolean }) {
  await supabase.rpc("set_my_onboarding", p);
}

/** Mounted once in the shell: opens automatically on first login and on demand. */
export function OnboardingHost() {
  const { approvalStatus } = useStudio();
  const { me, steps, done } = useOnboarding();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const h = () => { setStep(Math.min(me?.onboarding_step ?? 0, steps.length - 1)); setOpen(true); };
    window.addEventListener(OPEN_ONBOARDING_EVENT, h);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, h);
  }, [me?.onboarding_step, steps.length]);

  useEffect(() => {
    if (me && !me.onboarding_seen && approvalStatus === "aprovado") { setStep(me.onboarding_step ?? 0); setOpen(true); }
  }, [me, approvalStatus]);

  const close = async (goTo?: string) => {
    setOpen(false);
    await saveOnboarding({ _seen: true, _step: step });
    qc.invalidateQueries({ queryKey: ["onboarding-me"] });
    if (goTo) navigate({ to: goTo });
  };

  const s = steps[step];
  if (!s) return null;
  const last = step === steps.length - 1;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void close(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[min(720px,92vh)] sm:max-w-[960px] sm:rounded-xl sm:border [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Guia do Shop Studio</DialogTitle>
        <DialogDescription className="sr-only">Passo a passo do perfil ao kit de postagem</DialogDescription>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="font-display text-base font-semibold">Guia do Shop Studio</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => void close()}>Pular por agora</Button>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => void close()}><X /></Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ol className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-3 md:w-[280px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {steps.map((it, i) => {
              const current = i === step;
              return (
                <li key={it.title} className="shrink-0">
                  <button type="button" onClick={() => setStep(i)} className={`relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${current ? "bg-muted font-medium text-foreground before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary" : done[i] ? "text-foreground" : "text-muted-foreground"}`}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done[i] ? "bg-brand-cyan/15 text-brand-cyan" : current ? "bg-primary text-primary-foreground" : "border border-border"}`}>{done[i] ? <Check className="size-3.5" /> : i + 1}</span>
                    <span className="whitespace-nowrap md:whitespace-normal">{it.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
            <h2 className="font-display text-2xl font-semibold">{s.title}</h2>
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
            <StepMock step={s} />
            <p className="mt-6 text-sm font-medium">O que fazer</p>
            <ul className="mt-2 space-y-2">
              {s.todo.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${done[step] ? "border-brand-cyan bg-brand-cyan/15 text-brand-cyan" : "border-border"}`}>{done[step] && <Check className="size-3" />}</span>{t}
                </li>
              ))}
            </ul>
            <Button className="mt-6" onClick={() => void close(s.to)}>Ir para esta etapa</Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground">{step + 1} de {steps.length}</span>
          {last ? <Button onClick={() => void close()}>Concluir</Button> : <Button onClick={() => setStep(step + 1)}>Próximo</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepMock({ step }: { step: Step }) {
  const Icon = step.icon;
  return (
    <div aria-hidden className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="size-2 rounded-full bg-muted-foreground/40" /><span className="size-2 rounded-full bg-muted-foreground/40" /><span className="size-2 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-brand-cyan"><Icon className="size-6" strokeWidth={1.6} /></span>
        <div className="grid flex-1 grid-cols-2 gap-2">
          {step.mock.map((m, i) => (
            <div key={m} className={`rounded-md border px-3 py-2 text-xs ${i === 0 ? "border-primary/50 text-foreground" : "border-border text-muted-foreground"}`}>
              {m}<div className="mt-1.5 h-1 w-2/3 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Faixa discreta na Visão geral enquanto o guia não está completo. */
export function OnboardingBanner() {
  const { me, steps, doneCount, loaded } = useOnboarding();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  if (!loaded || hidden || me?.onboarding_banner_hidden || doneCount >= steps.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2"><Sparkles className="size-4 text-brand-cyan" />Você completou {doneCount} de {steps.length} passos.</span>
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={openOnboarding}>Continuar guia</Button>
          <Button variant="ghost" size="sm" onClick={async () => { setHidden(true); await saveOnboarding({ _banner_hidden: true }); qc.invalidateQueries({ queryKey: ["onboarding-me"] }); }}>Ocultar</Button>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-cyan" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
    </div>
  );
}
