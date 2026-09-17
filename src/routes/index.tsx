import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown, ArrowRight, BarChart3, Bookmark, Check, ChevronRight, CircleCheck,
  Clock3, Film, Heart, LockKeyhole, MessageCircle, PackageSearch, Play, Share2,
  ShoppingBag, Sparkles, Users, WandSparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDark from "@/assets/logo-dark.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shop Studio — vídeos para TikTok Shop" },
      { name: "description", content: "Do produto em alta ao vídeo pronto para postar. Escale sua produção no TikTok Shop com inteligência artificial." },
      { property: "og:title", content: "Shop Studio — vídeos para TikTok Shop" },
      { property: "og:description", content: "Garimpe produtos, crie roteiros e gere vídeos para TikTok Shop em uma única linha de produção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const steps = [
    ["Garimpa", "Produtos em alta do TikTok Shop BR, só afiliáveis, com hype score."],
    ["Roteiriza", "Gancho, corpo e chamada para o carrinho no tom de cada perfil."],
    ["Cria as cenas", "Pessoa ou mão usando o produto real. Você revisa antes de animar."],
    ["Anima e monta", "Vídeo real com narração em português, legenda e tela cheia vertical."],
    ["Você posta", "Revise, marque o produto no TikTok e publique."],
  ];

  return (
    <div className="landing-page min-h-screen overflow-x-hidden selection:bg-landing-mint selection:text-landing-bg">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-landing-line bg-landing-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#inicio" className="landing-focus flex items-center"><img src={logoDark.url} alt="Shop Studio" className="h-8 w-auto sm:h-9" /></a>
          <nav aria-label="Navegação principal" className="hidden items-center gap-7 text-sm text-landing-muted lg:flex">
            <a className="landing-focus transition-colors hover:text-landing-text" href="#como-funciona">Como funciona</a>
            <a className="landing-focus transition-colors hover:text-landing-text" href="#recursos">Recursos</a>
            <a className="landing-focus transition-colors hover:text-landing-text" href="#estudio">O estúdio de IA</a>
            <a className="landing-focus transition-colors hover:text-landing-text" href="#controle">Controle</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="landing-focus text-landing-text hover:bg-landing-surface-raised hover:text-landing-text"><Link to="/entrar">Entrar</Link></Button>
            <Button asChild className="landing-focus landing-magenta h-10 rounded-xl border-0 px-4 text-landing-text shadow-none hover:opacity-90"><Link to="/entrar">Começar agora</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section id="inicio" className="relative mx-auto grid min-h-[900px] max-w-7xl scroll-mt-24 items-center gap-12 px-5 pb-20 pt-28 lg:min-h-[820px] lg:grid-cols-[1.08fr_.92fr] lg:gap-8 lg:px-8 lg:pt-24">
          <div className="max-w-2xl text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-landing-mint/25 bg-landing-mint/5 px-3 py-1.5 text-xs font-medium text-landing-muted">
              <Sparkles className="size-3.5 text-landing-mint" aria-hidden="true" /> Produção de vídeo no piloto automático
            </div>
            <h1 className="landing-display text-[2.8rem] font-bold leading-[1.05] sm:text-6xl lg:text-7xl">
              Do produto que vende ao <span className="landing-glitch" data-text="vídeo pronto">vídeo pronto</span> pra postar
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-landing-muted lg:mx-0">
              Garimpa o produto em alta, escreve o roteiro no tom do canal e gera o vídeo com uma pessoa usando o produto. Você só revisa e posta.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button asChild size="lg" className="landing-focus landing-magenta h-13 rounded-xl border-0 px-6 text-base text-landing-text"><Link to="/entrar">Criar minha conta <ArrowRight aria-hidden="true" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="landing-focus landing-outline h-13 rounded-xl px-6 text-base"><a href="#como-funciona">Ver como funciona <ArrowDown aria-hidden="true" /></a></Button>
            </div>
          </div>

          <div className="flex min-h-[600px] items-center justify-center lg:min-h-0">
            <div className="landing-phone-stage relative w-full max-w-[540px]">
              <div className="landing-phone-glow" aria-hidden="true" />
              <div className="landing-phone-frame relative mx-auto aspect-[9/16] w-[270px] overflow-hidden rounded-[44px] p-[7px] sm:w-[310px]">
                <div className="landing-phone-screen relative h-full overflow-hidden rounded-[37px]">
                  <div className="landing-video-scene absolute inset-0" aria-hidden="true">
                    <div className="landing-person-silhouette" />
                    <div className="landing-product-prop"><span /><span /></div>
                  </div>
                  <div className="landing-video-vignette absolute inset-0" />
                  <div className="absolute left-1/2 top-2.5 z-20 h-[25px] w-[92px] -translate-x-1/2 rounded-full bg-landing-bg shadow-sm">
                    <span className="absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-landing-surface-raised" />
                  </div>
                  <div className="absolute right-3.5 top-[31%] z-10 flex flex-col items-center gap-4" aria-label="Ações do vídeo">
                    <div className="relative mb-1"><div className="landing-avatar grid size-11 place-items-center rounded-full border-2 border-landing-text"><span className="landing-display text-xs font-bold">SS</span></div><span className="absolute -bottom-1 left-1/2 grid size-4 -translate-x-1/2 place-items-center rounded-full bg-landing-plasma-c text-[12px] font-bold leading-none">+</span></div>
                    <PhoneAction icon={<Heart />} label="18,4K" />
                    <PhoneAction icon={<MessageCircle />} label="326" />
                    <PhoneAction icon={<Bookmark />} label="1.2K" />
                    <PhoneAction icon={<Share2 />} label="Enviar" />
                  </div>
                  <div className="absolute inset-x-4 bottom-5 z-10 pr-12 text-left">
                    <p className="text-[13px] font-bold text-landing-text">@achadinhosdalu</p>
                    <p className="mt-1.5 text-[15px] font-bold leading-5 text-landing-text">Bateria no fim na hora de sair?</p>
                    <p className="mt-1 text-[11px] leading-4 text-landing-text/65">#tiktokshop #achadinhos #bateriaportatil</p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-landing-text px-3 py-2 text-[11px] font-bold text-landing-bg shadow-lg"><ShoppingBag className="size-3.5" /> Toque no carrinho <ChevronRight className="size-3.5" /></div>
                  </div>
                </div>
              </div>
              <FloatChip className="left-0 top-12" icon={<PackageSearch />} text="Produto em alta detectado" accent="cyan" delay="one" />
              <FloatChip className="right-0 top-[43%]" icon={<WandSparkles />} text="Roteiro escrito por IA" accent="cyan" delay="two" />
              <FloatChip className="bottom-14 left-0" icon={<Film />} text="Vídeo com pessoa real" accent="magenta" delay="three" />
            </div>
          </div>
        </section>

        <div className="border-y border-landing-line bg-landing-surface/50 px-5 py-5 text-center text-sm leading-6 text-landing-muted">
          Feito para afiliados e criadores que vendem no TikTok Shop Brasil e querem escalar sem virar máquina de gravar vídeo.
        </div>

        <section id="como-funciona" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 lg:px-8 lg:py-32">
          <SectionTitle title="Cinco etapas. Uma linha de montagem." text="Do sinal de venda à publicação, cada etapa fica visível e sob seu controle." />
          <div className="relative mt-16 grid gap-8 md:grid-cols-5 md:gap-4">
            <div className="absolute bottom-auto left-5 top-6 h-[calc(100%-3rem)] w-px bg-landing-line md:left-[10%] md:right-[10%] md:top-5 md:h-px md:w-auto" />
            {steps.map(([title, text], index) => <div key={title} className="relative pl-14 md:pl-0 md:pt-12">
              <span className="landing-plasma-bg landing-display absolute left-0 top-0 grid size-11 place-items-center rounded-full text-sm font-bold text-landing-text md:left-1/2 md:-translate-x-1/2">{index + 1}</span>
              <h3 className="landing-display text-lg font-semibold md:text-center">{title}</h3><p className="mt-2 text-sm leading-6 text-landing-muted md:text-center">{text}</p>
            </div>)}
          </div>
        </section>

        <section className="border-y border-landing-line bg-landing-surface/40">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-28">
            <CompareColumn title="Fazendo na mão" items={["Garimpar por horas","Gravar e editar cada vídeo","Cuidar de um perfil só","Publicar em volume baixo"]} negative />
            <CompareColumn title="Com o Shop Studio" items={["Produtos que vendem chegam prontos","Vídeo com pessoa sai sozinho","Vários perfis ao mesmo tempo","Mais conteúdo no ar"]} />
          </div>
        </section>

        <section id="recursos" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 lg:px-8 lg:py-32">
          <SectionTitle title="Um estúdio inteiro. Sem a complexidade." text="Cada ferramenta existe para acelerar a produção sem tirar sua decisão do processo." />
          <div className="mt-14 grid auto-rows-[minmax(230px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-3">
            <article className="landing-feature-glow landing-aura relative overflow-hidden rounded-[22px] border border-landing-line p-7 md:col-span-2 md:row-span-2 lg:p-10">
              <Film className="size-9 text-landing-mint" /><h3 className="landing-display mt-12 max-w-xl text-3xl font-semibold sm:text-4xl">Vídeo com pessoa real usando o produto</h3><p className="mt-5 max-w-xl text-base leading-7 text-landing-muted">Nada de foto girando. A IA cria uma cena com pessoa ou mão manuseando o produto real e anima com movimento natural.</p><span className="mt-8 inline-flex rounded-full border border-landing-line bg-landing-bg/50 px-3 py-1.5 text-xs text-landing-text">Gemini + Veo + montagem automática</span>
            </article>
            <Feature icon={<BarChart3 />} title="Garimpo inteligente" text="Hype score, vendas, crescimento e somente produtos afiliáveis." />
            <Feature icon={<WandSparkles />} title="Roteiro no seu tom" text="Voz, idioma e estilo próprios para cada perfil." />
            <Feature icon={<Play />} title="Pipeline visual" text="Avance, volte e refaça sem perder trabalho, com histórico de tempo." wide />
            <Feature icon={<Users />} title="Equipe com permissões" text="Vários usuários, papéis por perfil e controle fino de acesso." />
          </div>
        </section>

        <section id="estudio" className="border-y border-landing-line bg-landing-surface/40">
          <div className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 lg:px-8 lg:py-28">
            <SectionTitle title="Como um vídeo profissional nasce em três passos" text="Três tecnologias especializadas trabalham em sequência para entregar um vídeo pronto." />
            <div className="mt-14 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
              <AiStep number="1" title="Cria a imagem" text="Cena com pessoa a partir da foto real, mantendo o produto fiel." icon={<Sparkles />} />
              <ChevronRight className="mx-auto hidden text-landing-muted lg:block" />
              <AiStep number="2" title="Dá vida à cena" text="Transforma a imagem aprovada em vídeo com movimento real." icon={<Play />} />
              <ChevronRight className="mx-auto hidden text-landing-muted lg:block" />
              <AiStep number="3" title="Monta o vídeo final" text="Narração em português, legenda, chamada e tela cheia vertical." icon={<Film />} />
            </div>
          </div>
        </section>

        <section id="controle" className="mx-auto grid max-w-7xl scroll-mt-24 gap-14 px-5 py-24 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-8 lg:py-32">
          <div><SectionTitle title="Controle o processo. E o custo." text="Automação não precisa ser uma caixa-preta. Você decide onde a inteligência artificial avança." />
            <div className="mt-10 space-y-8">
              <ControlItem icon={<CircleCheck />} title="Aprove antes de gastar" text="Revise imagens baratas e libere a animação cara só com seu ok." />
              <ControlItem icon={<WandSparkles />} title="Prompts na sua mão" text="Edite as instruções da IA, no padrão geral ou por perfil, sem código." />
              <ControlItem icon={<LockKeyhole />} title="Acesso liberado por você" text="Cada cadastro passa pela sua aprovação antes de entrar." />
            </div>
          </div>
          <PipelinePanel />
        </section>

        <section className="px-5 pb-24 lg:px-8 lg:pb-32">
          <div className="landing-plasma-border landing-aura mx-auto max-w-7xl overflow-hidden rounded-[22px] px-6 py-16 text-center sm:px-12 lg:py-20">
            <h2 className="landing-display text-4xl font-bold sm:text-5xl">Coloque sua produção no automático</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-landing-muted">Transforme sinais de venda em vídeos prontos, com revisão humana no ponto certo.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="landing-focus landing-magenta h-13 rounded-xl px-6 text-base text-landing-text hover:opacity-90"><Link to="/entrar">Criar minha conta <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="ghost" className="landing-focus h-13 rounded-xl px-6 text-base text-landing-text hover:bg-landing-surface-raised hover:text-landing-text"><a href="#como-funciona">Rever como funciona</a></Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-landing-line px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-[1fr_auto_auto]">
          <div><img src={logoDark.url} alt="Shop Studio" className="h-9 w-auto" /><p className="mt-3 max-w-xs text-sm leading-6 text-landing-muted">A esteira de vídeo do TikTok Shop, do produto ao post.</p></div>
          <FooterLinks title="Produto" links={[["Como funciona","#como-funciona"],["Recursos","#recursos"],["O estúdio de IA","#estudio"],["Controle","#controle"]]} />
          <FooterLinks title="Conta" links={[["Entrar","/entrar"],["Criar conta","/entrar"]]} />
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-landing-line pt-6 text-sm text-landing-muted">© 2026 Shop Studio · shopstudio.com.br</div>
      </footer>
    </div>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) { return <div className="max-w-2xl"><h2 className="landing-display text-3xl font-bold sm:text-5xl">{title}</h2><p className="mt-5 text-lg leading-8 text-landing-muted">{text}</p></div>; }

function PhoneAction({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="flex w-12 flex-col items-center gap-0.5 text-landing-text"><span className="drop-shadow-md [&_svg]:size-[23px] [&_svg]:stroke-[2]">{icon}</span><span className="text-[9px] font-semibold drop-shadow-md">{label}</span></div>; }

function FloatChip({ icon, text, className, accent, delay }: { icon: React.ReactNode; text: string; className: string; accent: "cyan" | "magenta"; delay: "one" | "two" | "three" }) { return <div className={`landing-float landing-float-${delay} absolute hidden items-center gap-2.5 rounded-xl border border-landing-line bg-landing-surface/80 px-3.5 py-2.5 text-xs font-semibold text-landing-text shadow-xl backdrop-blur-xl sm:flex ${className}`}><span className={`${accent === "magenta" ? "text-landing-plasma-c" : "text-landing-mint"} [&_svg]:size-4`}>{icon}</span>{text}</div>; }

function CompareColumn({ title, items, negative = false }: { title: string; items: string[]; negative?: boolean }) { return <article className={`rounded-[22px] border p-7 sm:p-10 ${negative ? "border-landing-line bg-landing-bg/30" : "landing-feature-glow border-landing-line"}`}><h2 className="landing-display text-2xl font-semibold">{title}</h2><ul className="mt-8 space-y-5">{items.map(item => <li key={item} className="flex items-center gap-3 text-landing-muted">{negative ? <X className="size-5 shrink-0 opacity-60" /> : <Check className="size-5 shrink-0 text-landing-mint" />}<span>{item}</span></li>)}</ul></article>; }

function Feature({ icon, title, text, wide = false }: { icon: React.ReactNode; title: string; text: string; wide?: boolean }) { return <article className={`rounded-[22px] border border-landing-line bg-landing-surface p-7 ${wide ? "lg:col-span-2" : ""}`}><span className="text-landing-mint [&_svg]:size-7">{icon}</span><h3 className="landing-display mt-10 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-landing-muted">{text}</p></article>; }

function AiStep({ number, title, text, icon }: { number: string; title: string; text: string; icon: React.ReactNode }) { return <article className="min-h-64 rounded-[22px] border border-landing-line bg-landing-surface p-7"><div className="flex items-center justify-between"><span className="landing-plasma-bg landing-display grid size-10 place-items-center rounded-full font-bold">{number}</span><span className="text-landing-mint [&_svg]:size-7">{icon}</span></div><h3 className="landing-display mt-12 text-2xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-landing-muted">{text}</p></article>; }

function ControlItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex gap-4"><span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-landing-surface text-landing-mint [&_svg]:size-5">{icon}</span><div><h3 className="landing-display text-lg font-semibold">{title}</h3><p className="mt-1 leading-7 text-landing-muted">{text}</p></div></div>; }

function PipelinePanel() { const rows = [["Produto escolhido","pronto"],["Roteiro","pronto"],["Cenas geradas","aguardando você"],["Gerando vídeo","na fila"],["Pronto pra postar","próximo"]]; return <div className="landing-aura rounded-[22px] border border-landing-line bg-landing-surface p-5 sm:p-8"><div className="flex items-center justify-between border-b border-landing-line pb-5"><div><p className="landing-display font-semibold">Produção de hoje</p><p className="mt-1 text-sm text-landing-muted">Vídeo #0248</p></div><Clock3 className="text-landing-muted" /></div><div className="mt-3">{rows.map(([label,status],index)=><div key={label} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-landing-line py-4 last:border-0"><span className={`grid size-6 place-items-center rounded-full text-xs ${index < 2 ? "bg-landing-mint text-landing-bg" : index === 2 ? "landing-plasma-bg text-landing-text" : "bg-landing-surface-raised text-landing-muted"}`}>{index < 2 ? <Check className="size-3.5" /> : index + 1}</span><span className="text-sm font-medium">{label}</span><span className={`text-xs ${index < 2 ? "text-landing-mint" : "text-landing-muted"}`}>{status}</span></div>)}</div></div>; }

function FooterLinks({ title, links }: { title: string; links: [string,string][] }) { return <div><h3 className="landing-display text-sm font-semibold">{title}</h3><ul className="mt-4 space-y-3">{links.map(([label,href])=><li key={label}><a className="landing-focus text-sm text-landing-muted transition-colors hover:text-landing-text" href={href}>{label}</a></li>)}</ul></div>; }
