import type { ReactNode } from "react";
import { ArrowRight, Bot, FileSearch, Lightbulb, MessageSquareText, Radar, Search, Sparkles, UserSearch, Users, Wand2 } from "lucide-react";

const card = "rounded-[22px] border border-landing-line bg-landing-surface/60 p-6";
const mini = "mt-5 rounded-xl border border-landing-line bg-landing-bg/70 p-3 text-[11px] leading-4 text-landing-muted";

function Bento({ icon, title, text, children, className = "" }: { icon: ReactNode; title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <article className={`${card} flex flex-col ${className}`}>
      <span className="text-landing-mint [&_svg]:size-7">{icon}</span>
      <h3 className="landing-display mt-5 text-xl font-semibold text-landing-text">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-landing-muted">{text}</p>
      <div className={`${mini} mt-auto`} aria-hidden="true">{children}</div>
    </article>
  );
}

const Barra = ({ w, c = "bg-landing-mint" }: { w: string; c?: string }) => <div className="h-1.5 rounded-full bg-landing-line"><div className={`h-full rounded-full ${c}`} style={{ width: w }} /></div>;
const Chip = ({ children, forte }: { children: ReactNode; forte?: boolean }) => <span className={`rounded-full px-2 py-0.5 ${forte ? "bg-landing-plasma-c/20 text-landing-text" : "border border-landing-line"}`}>{children}</span>;

export function LandingInteligencia() {
  return (
    <>
      <section id="inteligencia" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 lg:px-8 lg:py-32">
        <div className="max-w-2xl">
          <h2 className="landing-display text-3xl font-bold sm:text-5xl">Antes de gravar, saiba o que funciona</h2>
          <p className="mt-5 text-lg leading-8 text-landing-muted">A Inteligência do Shop Studio lê o TikTok por você: quem vende na sua categoria, o que está subindo agora e por que um vídeo deu certo.</p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Bento icon={<FileSearch />} title="Analisar vídeo" text="Cole um link ou envie um arquivo. Sai transcrição, cenas, gancho, CTA e produto, com os frames de cada cena." className="lg:col-span-2">
            <div className="flex max-w-sm gap-2">{["0:00", "0:03", "0:07", "0:12", "0:18"].map((t, i) => <div key={t} className="flex-1"><div className={`aspect-[9/16] rounded-md ${i % 2 ? "bg-landing-surface-raised" : "bg-landing-plasma-c/25"}`} /><p className="mt-1 text-center">{t}</p></div>)}</div>
            <p className="mt-2"><span className="text-landing-mint">Gancho:</span> "Parei de comprar fronha comum depois disso"</p>
          </Bento>
          <Bento icon={<Users />} title="Perfis de referência" text="Acompanhe os @ que vendem. Analise os vídeos deles em lote e receba insights do que separa os melhores dos piores.">
            {([["@casa.achados", "84%"], ["@dica.da.ju", "61%"], ["@lar.pratico", "42%"]] as const).map(([h, w]) => <div key={h} className="mb-2 last:mb-0"><p>{h}</p><Barra w={w} /></div>)}
          </Bento>
          <Bento icon={<Radar />} title="Radar" text="Todo dia às 6h, o que subiu nas últimas 72h entre os perfis que você acompanha. Antes de saturar.">
            <div className="flex items-center gap-2"><div className="aspect-[9/16] w-10 rounded-md bg-landing-plasma-c/25" /><div className="space-y-1"><Chip forte>3,1x a média do @</Chip><p>@casa.achados · há 18 h</p><p className="text-landing-text">248 mil views</p></div></div>
          </Bento>
          <Bento icon={<Search />} title="Pesquisar" text="Hashtag ou palavra, resultados do Brasil, idioma detectado, hashtags que andam juntas e os @ que mais aparecem.">
            <p className="mb-2 rounded-md border border-landing-line px-2 py-1 text-landing-text">#fronhadecetim</p>
            <div className="flex flex-wrap gap-1"><Chip>#skincare</Chip><Chip>#cabelo</Chip><Chip>#achadinhos</Chip><Chip forte>Português (provável)</Chip></div>
          </Bento>
          <Bento icon={<UserSearch />} title="Criadores" text="Garimpo de perfis por categoria: receita em vídeo, seguidores, crescimento. Um clique para acompanhar.">
            {[["@beleza.real", "R$ 42 mil", "91%"], ["@mae.organizada", "R$ 28 mil", "76%"]].map(([h, r, p]) => <div key={h} className="mb-1.5 flex items-center justify-between last:mb-0"><span>{h}</span><span className="text-landing-text">{r}</span><Chip>{p} vídeo</Chip></div>)}
          </Bento>
          <Bento icon={<MessageSquareText />} title="Comentários" text="Objeções, dúvidas e desejos reais dos compradores, direto para o roteiro." className="md:col-span-2 lg:col-span-3">
            <div className="space-y-1.5"><p><span className="text-landing-mint">Objeção:</span> "Será que desbota na lavagem?"</p><p><span className="text-landing-mint">Dúvida:</span> "Serve pra cama king?"</p><p><span className="text-landing-mint">Desejo:</span> "Queria na cor rosé"</p></div>
          </Bento>
        </div>
      </section>

      <section className="border-y border-landing-line bg-landing-surface/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-28">
          <div>
            <h2 className="landing-display text-3xl font-bold sm:text-5xl">Do insight ao roteiro em um clique</h2>
            <ol className="mt-10 space-y-6">
              {[
                { i: <FileSearch />, t: "Analisar um vídeo campeão", d: "Transcrição, cenas, gancho e chamada de cada vídeo escolhido." },
                { i: <Lightbulb />, t: "Insights: o que os melhores têm em comum", d: "Padrões de gancho, duração e formato comparando os melhores com os piores." },
                { i: <Wand2 />, t: "\"Criar roteiro inspirado\" ou \"Enviar para o roteirista\"", d: "O aprendizado vira roteiro no tom do seu perfil." },
              ].map((s, n) => (
                <li key={s.t} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-landing-line bg-landing-bg text-landing-mint [&_svg]:size-5">{s.i}</span>
                  <div><p className="font-semibold text-landing-text">{n + 1}. {s.t}</p><p className="mt-1 text-sm leading-6 text-landing-muted">{s.d}</p></div>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-xl text-base leading-7 text-landing-muted">O roteirista já escreve inspirado nos vídeos que mais venderam na categoria. Agora ele também aprende com os perfis que você escolher e responde às objeções que os compradores escrevem nos comentários.</p>
          </div>
          <div className="landing-aura rounded-[22px] border border-landing-line bg-landing-bg p-5 text-xs text-landing-muted shadow-2xl shadow-black/40" aria-hidden="true">
            <div className="flex items-center justify-between"><p className="landing-display text-base font-semibold text-landing-text">Insights · @casa.achados</p><Chip>20 vídeos analisados</Chip></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[["Gancho em até 2 s", "8 de 10 melhores"], ["Duração 20 a 35 s", "média dos melhores"], ["Produto na mão", "presente nos 5 melhores"]].map(([a, b]) => <div key={a} className="rounded-lg border border-landing-line bg-landing-surface/60 p-3"><p className="font-semibold text-landing-text">{a}</p><p className="mt-1">{b}</p></div>)}
            </div>
            <p className="mt-5 font-semibold text-landing-text">Ganchos que funcionaram</p>
            <div className="mt-2 grid max-w-xs grid-cols-3 gap-2">{["\"Ninguém te conta isso\"", "\"Testei por 7 dias\"", "\"Pare de errar aqui\""].map((g, i) => <div key={g}><div className={`aspect-[9/16] rounded-md ${i === 1 ? "bg-landing-surface-raised" : "bg-landing-plasma-c/25"}`} /><p className="mt-1">{g}</p></div>)}</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div><p className="mb-2 font-semibold text-landing-mint">5 melhores</p>{["92%", "80%", "74%", "66%", "58%"].map((w) => <div key={w} className="mb-1.5"><Barra w={w} /></div>)}</div>
              <div><p className="mb-2 font-semibold text-landing-text">5 piores</p>{["22%", "18%", "14%", "10%", "6%"].map((w) => <div key={w} className="mb-1.5"><Barra w={w} c="bg-landing-muted" /></div>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-36">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-16">
        <div className="relative order-2 lg:order-1">
          <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-landing-plasma-c/15 blur-[90px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 size-56 rounded-full bg-landing-mint/12 blur-[90px]" aria-hidden="true" />
          <div className="landing-aura relative mx-auto w-full max-w-md overflow-hidden rounded-[24px] border border-landing-line bg-landing-bg/80 backdrop-blur-xl" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-landing-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-landing-mint/10 text-landing-mint"><Bot className="size-4" /></span>
                <div>
                  <p className="text-sm font-semibold text-landing-text">Assistente</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-landing-muted"><span className="size-1.5 rounded-full bg-landing-done" />online agora</p>
                </div>
              </div>
              <div className="flex gap-1.5"><span className="size-2 rounded-full bg-landing-line" /><span className="size-2 rounded-full bg-landing-line" /><span className="size-2 rounded-full bg-landing-line" /></div>
            </div>
            <div className="space-y-4 p-5">
              {[
                { q: "Quanto gastei este mês?", a: <span>Em setembro: <span className="font-semibold text-landing-text">R$ 184,20</span>. O maior gasto foi animação de cenas, <span className="font-semibold text-landing-text">R$ 96,40</span>.</span> },
                { q: "O que está aguardando revisão?", a: <span><span className="font-semibold text-landing-mint">3 vídeos</span> com cenas geradas esperando sua aprovação no Pipeline.</span> },
                { q: "Qual vídeo em alta hoje no radar?", a: <span><span className="font-semibold text-landing-mint">@casa.achados</span>, fronha de cetim: <span className="font-semibold text-landing-text">248 mil views</span> em 18 h, 3,1x a média do @.</span> },
              ].map(({ q, a }) => (
                <div key={q} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-landing-plasma-c px-3.5 py-2.5 text-sm text-landing-text shadow-[0_4px_16px_color-mix(in_oklab,var(--landing-plasma-c)_28%,transparent)]">{q}</p>
                  <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm border border-landing-line bg-landing-surface px-3.5 py-2.5 text-sm leading-6 text-landing-muted">{a}</p>
                </div>
              ))}
              <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm border border-landing-line bg-landing-surface px-3.5 py-3">
                <span className="landing-blink size-1.5 rounded-full bg-landing-muted/60" />
                <span className="landing-blink size-1.5 rounded-full bg-landing-muted/60" style={{ animationDelay: "0.2s" }} />
                <span className="landing-blink size-1.5 rounded-full bg-landing-muted/60" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
            <div className="border-t border-landing-line p-4">
              <div className="flex items-center gap-2 rounded-full border border-landing-line bg-landing-surface px-4 py-2.5">
                <p className="flex-1 text-sm text-landing-muted/60">Pergunte algo sobre seu saldo ou pipeline…</p>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-landing-mint text-landing-bg shadow-[0_0_14px_color-mix(in_oklab,var(--landing-mint)_40%,transparent)]"><ArrowRight className="size-4" /></span>
              </div>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <Sparkles className="size-8 text-landing-mint" />
          <h2 className="landing-display mt-6 text-3xl font-bold sm:text-5xl">Pergunte ao seu <span className="landing-plasma-text">painel</span></h2>
          <p className="mt-5 text-lg leading-8 text-landing-muted">Um assistente que conhece o seu Shop Studio: pipeline, custos, saldo, métricas, referências. Ele consulta o que você já tem acesso e responde com número da tela, não com estimativa.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {["Pipeline", "Custos", "Saldo", "Métricas", "Referências"].map((t) => <span key={t} className="rounded-full border border-landing-line bg-landing-surface px-3 py-1.5 text-xs font-medium text-landing-text">{t}</span>)}
          </div>
          <p className="mt-7 inline-flex items-center gap-2 text-sm text-landing-muted"><ArrowRight className="size-4 text-landing-mint" />Só consulta. Nada é aprovado, publicado ou gasto sem você.</p>
        </div>
        </div>
      </section>
    </>
  );
}
