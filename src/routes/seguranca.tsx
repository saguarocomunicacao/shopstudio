import { createFileRoute, Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDark from "@/assets/logo-dark.png.asset.json";

export const Route = createFileRoute("/seguranca")({
  head: () => ({
    meta: [
      { title: "Política de Segurança da Informação — Shop Studio" },
      { name: "description", content: "Práticas de segurança da informação adotadas pela Shop Studio." },
      { property: "og:title", content: "Política de Segurança da Informação — Shop Studio" },
      { property: "og:description", content: "Práticas de segurança da informação adotadas pela Shop Studio." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://shopstudio.com.br/seguranca" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://shopstudio.com.br/seguranca" }],
  }),
  component: SegurancaPage,
});

const SECTIONS = [
  {
    n: "1",
    title: "Controle de acesso",
    body: [
      "O acesso a dados pessoais é restrito por controle de acesso baseado em papéis (RBAC), aplicado no nível do banco de dados por políticas de segurança (RLS), seguindo o princípio do menor privilégio. Cada usuário acessa apenas os dados dos perfis para os quais tem permissão.",
    ],
  },
  {
    n: "2",
    title: "Criptografia",
    body: [
      "Todos os dados trafegam por conexões criptografadas (TLS/HTTPS) e são armazenados com criptografia em repouso. Tokens de acesso e segredos de aplicação são mantidos exclusivamente no servidor.",
    ],
  },
  {
    n: "3",
    title: "Autenticação",
    body: ["Contas administrativas e de infraestrutura utilizam senhas fortes e autenticação multifator (MFA)."],
  },
  {
    n: "4",
    title: "Infraestrutura",
    body: [
      "A plataforma opera sobre infraestrutura gerenciada (Supabase) com isolamento de rede, firewall gerenciado, atualizações automáticas de segurança e monitoramento de ameaças em nível de provedor.",
    ],
  },
  {
    n: "5",
    title: "Gestão de vulnerabilidades",
    body: [
      "Acompanhamos avisos de segurança do provedor e aplicamos correções por meio de infraestrutura gerenciada com atualização automática.",
    ],
  },
  {
    n: "6",
    title: "Resposta a incidentes",
    body: [
      "Mantemos um procedimento de resposta a incidentes que define responsáveis, canais de comunicação e etapas de notificação. Em caso de incidente com risco aos titulares, notificamos os afetados e as autoridades competentes conforme a LGPD.",
    ],
  },
  {
    n: "7",
    title: "Retenção e descarte",
    body: [
      "Os dados são retidos apenas pelo tempo necessário. Ao encerrar a relação de uso, os tokens e dados pessoais associados são excluídos.",
    ],
  },
  { n: "8", title: "Contato", body: ["saguaro.comunicacao@gmail.com"] },
];

function SegurancaPage() {
  return (
    <div className="landing-page min-h-screen overflow-x-clip selection:bg-landing-mint selection:text-landing-bg">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-landing-line bg-landing-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="/" className="landing-focus flex items-center"><img src={logoDark.url} alt="Shop Studio" className="h-8 w-auto sm:h-9" /></a>
          <Button asChild variant="ghost" className="landing-focus text-landing-text hover:bg-landing-surface-raised hover:text-landing-text"><Link to="/">Voltar ao início</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-32 lg:px-8 lg:pt-40">
        <div className="mb-10 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl border border-landing-mint/25 bg-landing-mint/5 text-landing-mint"><LockKeyhole className="size-6" aria-hidden="true" /></span>
          <p className="text-sm text-landing-muted">Shop Studio · Segurança</p>
        </div>
        <h1 className="landing-display text-4xl font-bold leading-tight sm:text-5xl">Política de Segurança da Informação</h1>
        <p className="mt-4 text-sm text-landing-muted">Última atualização: 19 de setembro de 2026</p>

        <div className="mt-8 rounded-2xl border border-landing-line bg-landing-surface/50 p-6 text-base leading-8 text-landing-muted">
          A Saguaro Comunicação Ltda, operadora da plataforma Shop Studio, mantém práticas de segurança da informação para proteger os dados de seus usuários.
        </div>

        <div className="mt-12 space-y-12">
          {SECTIONS.map((s) => (
            <section key={s.n} className="scroll-mt-24">
              <h2 className="landing-display flex items-baseline gap-3 text-2xl font-semibold">
                <span className="text-landing-mint">{s.n}.</span>
                <span>{s.title}</span>
              </h2>
              <div className="mt-4 space-y-4 pl-7">
                {s.body.map((p, i) => (
                  <p key={i} className="text-base leading-8 text-landing-muted">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap gap-3">
          <Button asChild className="landing-focus landing-magenta h-11 rounded-xl border-0 px-5 text-landing-text hover:opacity-90"><Link to="/">Voltar ao Shop Studio</Link></Button>
          <Button asChild variant="outline" className="landing-focus landing-outline h-11 rounded-xl px-5"><Link to="/privacidade">Ver Política de Privacidade</Link></Button>
        </div>
      </main>

      <footer className="border-t border-landing-line px-5 py-12 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <img src={logoDark.url} alt="Shop Studio" className="h-9 w-auto" />
          <div className="flex gap-5 text-sm text-landing-muted">
            <Link to="/privacidade" className="landing-focus transition-colors hover:text-landing-text">Política de Privacidade</Link>
            <Link to="/seguranca" className="landing-focus transition-colors hover:text-landing-text">Política de Segurança</Link>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-3xl border-t border-landing-line pt-6 text-sm text-landing-muted">© 2026 Shop Studio · shopstudio.com.br</div>
      </footer>
    </div>
  );
}
