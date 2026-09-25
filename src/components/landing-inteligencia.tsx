import type { ReactNode } from "react";
import { RobotIcon } from "@/components/robot-icon";
import { Anchor, AudioLines, Film, Gauge, Hash, Package, ArrowRight, Equal, Eye, Send, ShieldCheck, Bot, FileSearch, Lightbulb, MessageSquareText, Radar, Search, Sparkles, UserSearch, Users, Wand2 } from "lucide-react";

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
        <div className="mt-14 space-y-12 lg:space-y-16">
          <Sub label="1. Encontrar">
            <div className="grid gap-4 md:grid-cols-2">
              <Card icon={<Search />} title="Pesquisar" text="Hashtag ou palavra, resultados do Brasil, idioma detectado, hashtags que andam juntas e os @ que mais aparecem.">
                <p className="rounded-md border border-landing-line bg-landing-bg px-2.5 py-1.5 text-landing-text">#fronhadecetim</p>
                <div className="mt-2 flex flex-wrap gap-1"><Chip>#skincare</Chip><Chip>#cabelo</Chip><Chip>#achadinhos</Chip><Chip forte>Português (provável)</Chip></div>
                <div className="mt-3 grid grid-cols-3 gap-2">{[["@casa.achados", "248 mil"], ["@dica.da.ju", "96 mil"], ["@lar.pratico", "41 mil"]].map(([h, v]) => <div key={h} className="rounded-md border border-landing-line p-2"><p className="truncate">{h}</p><p className="text-landing-text">{v} views</p></div>)}</div>
              </Card>
              <Card icon={<UserSearch />} title="Criadores" text="Garimpo de perfis por categoria: receita em vídeo, seguidores, crescimento. Um clique para acompanhar.">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
                  <span className="text-[10px] uppercase">Criador</span><span className="text-[10px] uppercase">Receita</span><span className="text-[10px] uppercase">% vídeo</span>
                  {[["@beleza.real", "R$ 42 mil", "91%"], ["@mae.organizada", "R$ 28 mil", "76%"], ["@achados.da.bia", "R$ 19 mil", "68%"]].map(([h, r, pc], i) => (
                    <div key={h} className="contents"><span className="flex items-center gap-2 truncate">{h}{i === 2 && <span className="rounded border border-landing-line px-1.5 py-0.5 text-[10px] text-landing-text">Acompanhar</span>}</span><span className="text-landing-text">{r}</span><span className="text-landing-mint">{pc}</span></div>
                  ))}
                </div>
              </Card>
            </div>
          </Sub>
          <Sub label="2. Acompanhar">
            <div className="grid gap-4 md:grid-cols-2">
              <Card icon={<Users />} title="Perfis de referência" text="Acompanhe os @ que vendem. Coleta todo dia, analisa os vídeos em lote e mostra o que separa os melhores dos piores.">
                {([["@casa.achados", "84%"], ["@dica.da.ju", "61%"], ["@lar.pratico", "42%"]] as const).map(([h, w]) => <div key={h} className="mb-2.5 last:mb-0"><p className="mb-1 flex justify-between"><span>{h}</span><span>20 vídeos analisados</span></p><Barra w={w} /></div>)}
              </Card>
              <Card icon={<Radar />} title="Radar" text="Todo dia às 6h, o que subiu nas últimas 72h entre os perfis que você acompanha. Antes de saturar.">
                <div className="flex gap-3"><div className="aspect-[9/16] w-12 shrink-0 rounded-md bg-landing-surface-raised" /><div className="space-y-1.5"><span className="inline-block rounded-full bg-landing-plasma-c px-2 py-0.5 text-landing-text">3,1x a média do @</span><p>@casa.achados · há 18 h</p><p className="text-landing-text">248 mil views</p><div className="flex flex-wrap gap-1.5 pt-1"><span className="rounded border border-landing-line px-2 py-0.5 text-landing-text">Analisar</span><span className="rounded border border-landing-line px-2 py-0.5 text-landing-text">Criar roteiro inspirado</span></div></div></div>
              </Card>
            </div>
          </Sub>
          <Sub label="3. Entender">
            <div className="grid gap-10 rounded-[14px] border border-landing-line bg-landing-surface p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="text-landing-mint [&_svg]:size-7"><FileSearch /></span>
                <h3 className="landing-display mt-5 text-2xl font-semibold text-landing-text">Analisar vídeo</h3>
                <p className="mt-3 leading-7 text-landing-muted">Cole um link do TikTok, YouTube ou Instagram, ou envie um arquivo. Em um minuto sai tudo que o vídeo tem.</p>
                <ul className="mt-6 grid gap-3 text-sm text-landing-text sm:grid-cols-2">
                  {([[<AudioLines key="a" />, "Transcrição com tempos"], [<Film key="b" />, "Cenas com frame de cada uma"], [<Anchor key="c" />, "Gancho e chamada"], [<Package key="d" />, "Produto e como aparece"], [<Gauge key="e" />, "Tom e ritmo"], [<Hash key="f" />, "Hashtags usadas"]] as const).map(([ic, t]) => <li key={t} className="flex items-center gap-2.5"><span className="text-landing-mint [&_svg]:size-4">{ic}</span>{t}</li>)}
                </ul>
                <p className="mt-6 text-sm text-landing-muted">Roda em segundo plano. Você é avisado quando termina.</p>
              </div>
              <div className="rounded-[14px] border border-landing-line bg-landing-bg p-4 text-[11px] leading-4 text-landing-muted" aria-hidden="true">
                <p className="text-sm font-semibold text-landing-text">Fronha de cetim · @casa.achados · 248 mil views</p>
                <div className="mt-3 flex gap-2">{["0:00", "0:03", "0:07", "0:12", "0:18"].map((t, i) => <div key={t} className="flex-1"><div className={`aspect-[9/16] rounded-md ${i % 2 ? "bg-landing-surface-raised" : "bg-landing-plasma-c/25"}`} /><p className="mt-1 text-center">{t}</p></div>)}</div>
                <div className="mt-3 rounded-lg border border-landing-line p-2.5"><p className="font-semibold text-landing-mint">Gancho</p><p className="mt-1 text-landing-text">"Parei de comprar fronha comum depois disso"</p></div>
                <div className="mt-2 rounded-lg border border-landing-line p-2.5"><p className="font-semibold text-landing-mint">Cenas</p>
                  {[["0:00", "Rosto amassado ao acordar", "pessoa"], ["0:03", "Fronha rosé em close", "mão"], ["0:12", "Cabelo liso de manhã", "pessoa"]].map(([t, d, sl]) => <p key={t} className="mt-1.5 flex items-center gap-2"><span className="w-7 text-landing-text">{t}</span><span className="flex-1">{d}</span><Chip>{sl}</Chip></p>)}
                </div>
                <div className="mt-2 rounded-lg border border-landing-line p-2.5"><p className="font-semibold text-landing-mint">Produto</p><p className="mt-1 text-landing-text">Fronha de cetim rosé, mostrada na mão aos 0:03</p></div>
                <div className="mt-2 flex gap-1.5"><Chip>Tom: Direto</Chip><Chip>Ritmo: Rápido</Chip></div>
              </div>
            </div>
          </Sub>
          <Sub label="4. Ouvir">
            <div className="grid gap-8 rounded-[14px] border border-landing-line bg-landing-surface p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="text-landing-mint [&_svg]:size-7"><MessageSquareText /></span>
                <h3 className="landing-display mt-5 text-2xl font-semibold text-landing-text">Comentários</h3>
                <p className="mt-3 leading-7 text-landing-muted">Objeções, dúvidas e desejos reais dos compradores, classificados pela IA. O gancho responde à objeção mais comum; o corpo cobre as duas dúvidas mais frequentes.</p>
              </div>
              <div className="rounded-[14px] border border-landing-line bg-landing-bg p-4 text-xs text-landing-muted" aria-hidden="true">
                <div className="flex items-center justify-between"><span>120 comentários lidos</span><span className="rounded-md bg-landing-plasma-c px-2.5 py-1 font-medium text-landing-text">Usar no roteiro</span></div>
                <div className="mt-3 space-y-2">{[["Objeção", "Será que desbota na lavagem?"], ["Dúvida", "Serve pra cama king?"], ["Desejo", "Queria na cor rosé"]].map(([c, t]) => <p key={c} className="flex items-center gap-2.5 rounded-lg border border-landing-line p-2.5"><span className="rounded-full bg-landing-mint/15 px-2 py-0.5 text-landing-mint">{c}</span><span className="text-landing-text">"{t}"</span></p>)}</div>
              </div>
            </div>
          </Sub>
        </div>
      </section>

      <section className="border-y border-landing-line bg-landing-surface/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-28">
          <div>
            <h2 className="landing-display text-3xl font-bold sm:text-5xl">Do insight ao roteiro em um clique</h2>
            <ol className="mt-10 space-y-6">
              {[
                { i: <FileSearch />, t: "Escolha de onde vem a referência", d: "Vídeo analisado, perfil acompanhado ou pesquisa." },
                { i: <Lightbulb />, t: "Insights: o que os melhores têm em comum", d: "Padrões de gancho, duração e formato, melhores contra piores." },
                { i: <Wand2 />, t: "Criar roteiro inspirado ou Enviar para o roteirista", d: "O aprendizado vira roteiro no tom do seu perfil, com as objeções dos comentários respondidas." },
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

      <section className="border-y border-landing-line bg-landing-surface/40">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-20 lg:px-8 lg:py-32">
          <div>
            <h2 className="landing-display text-3xl font-bold sm:text-5xl">Pergunte ao seu painel</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-landing-muted">Um assistente que conhece o seu Shop Studio: pipeline, custos, saldo, métricas, referências. Ele consulta o que você já tem acesso e responde com o número da tela, não com estimativa.</p>
            <div className="mt-10 space-y-8">
              <Item icon={<Equal />} title="Mesmo número da tela" text="Nada é calculado por conta própria. O que ele responde é o que a tela mostra." />
              <Item icon={<ShieldCheck />} title="Respeita sua permissão" text="Vê só o que o seu usuário vê. Nunca chaves, nunca outros clientes." />
              <Item icon={<Eye />} title="Só consulta" text="Nada é aprovado, publicado ou gasto sem você." />
            </div>
          </div>
          <div className="w-full overflow-hidden rounded-[14px] border border-landing-line bg-landing-bg lg:w-[420px]" aria-hidden="true">
            <div className="flex items-center justify-between gap-3 border-b border-landing-line px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="relative grid size-8 place-items-center rounded-lg bg-landing-plasma-c text-landing-text"><RobotIcon className="size-4" /><span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-landing-bg bg-landing-mint" /></span>
                <div><p className="text-sm font-semibold text-landing-text">Assistente</p><p className="text-[11px] text-landing-muted">Perfil: @promosdaregina</p></div>
              </div>
              <span className="rounded-md px-2 py-1 text-xs text-landing-muted">Nova conversa</span>
            </div>
            <div className="space-y-3 p-4 text-[13px] leading-5">
              <Par q="Quanto gastei este mês?"><span>Em setembro: <b className="font-semibold text-landing-text">R$ 184,20</b>. O maior gasto foi animação de cenas, <b className="font-semibold text-landing-text">R$ 96,40</b>.</span></Par>
              <Par q="O que está aguardando revisão?"><span>3 vídeos com cenas geradas esperando sua aprovação no Pipeline.</span><span className="mt-1.5 flex items-center gap-1 font-medium text-landing-mint">Abrir Pipeline <ArrowRight className="size-3.5" /></span></Par>
              <Par q="Qual vídeo em alta hoje no radar?"><span className="flex gap-2.5"><span className="aspect-[9/16] w-8 shrink-0 rounded bg-landing-surface-raised" /><span><b className="font-semibold text-landing-text">@casa.achados</b>, fronha de cetim: 248 mil views em 18 h, 3,1x a média do @.</span></span></Par>
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">{["Meu saldo", "Últimas execuções", "Vídeos publicados"].map((t) => <span key={t} className="rounded-full border border-landing-line px-2.5 py-1 text-[11px] text-landing-muted">{t}</span>)}</div>
            <div className="border-t border-landing-line p-3">
              <div className="flex items-center gap-2 rounded-lg border border-landing-line bg-landing-surface px-3 py-2">
                <p className="flex-1 text-[13px] text-landing-muted">Pergunte sobre o seu painel...</p>
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-landing-plasma-c text-landing-text"><Send className="size-3.5" /></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Item({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex gap-4"><span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-landing-surface text-landing-mint [&_svg]:size-5">{icon}</span><div><h3 className="landing-display text-lg font-semibold">{title}</h3><p className="mt-1 leading-7 text-landing-muted">{text}</p></div></div>;
}

function Par({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-landing-plasma-c px-3 py-2 text-landing-text">{q}</p>
      <div className="flex w-fit max-w-[92%] flex-col rounded-xl rounded-bl-sm border border-landing-line bg-landing-surface px-3 py-2 text-landing-muted">{children}</div>
    </div>
  );
}

function Sub({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-4 text-xs font-medium uppercase tracking-wider text-landing-muted">{label}</p>{children}</div>;
}

function Card({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <article className="flex flex-col rounded-[14px] border border-landing-line bg-landing-surface p-6">
      <span className="text-landing-mint [&_svg]:size-7">{icon}</span>
      <h3 className="landing-display mt-5 text-xl font-semibold text-landing-text">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-landing-muted">{text}</p>
      <div className="mt-5 rounded-xl border border-landing-line bg-landing-bg/70 p-3 text-[11px] leading-4 text-landing-muted" aria-hidden="true">{children}</div>
    </article>
  );
}
