import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDark from "@/assets/logo-dark.png.asset.json";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Shop Studio" },
      { name: "description", content: "Como a Shop Studio trata dados pessoais em conformidade com a LGPD." },
      { property: "og:title", content: "Política de Privacidade — Shop Studio" },
      { property: "og:description", content: "Como a Shop Studio trata dados pessoais em conformidade com a LGPD." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://shopstudio.com.br/privacidade" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://shopstudio.com.br/privacidade" }],
  }),
  component: PrivacidadePage,
});

const SECTIONS = [
  {
    n: "1",
    title: "Quais dados coletamos",
    body: [
      "Dados de cadastro do usuário da plataforma: nome e e-mail.",
      "Dados de conta de criador do TikTok Shop, quando o usuário conecta sua conta por autorização (OAuth): identificador da conta, tokens de acesso, e dados de desempenho de afiliado (pedidos e comissões gerados pelo próprio criador).",
      "Dados técnicos de uso da plataforma necessários ao seu funcionamento.",
    ],
  },
  {
    n: "2",
    title: "Como usamos os dados",
    body: [
      "Usamos os dados exclusivamente para operar a plataforma: autenticar o usuário, exibir ao próprio criador o desempenho de suas vendas de afiliado, e apoiar a produção de conteúdo. Não vendemos dados pessoais e não os compartilhamos com terceiros para fins de marketing.",
    ],
  },
  {
    n: "3",
    title: "Base legal",
    body: [
      "O tratamento se baseia no consentimento do titular (concedido via autorização OAuth) e na execução do contrato de uso da plataforma.",
    ],
  },
  {
    n: "4",
    title: "Autorização e integração com o TikTok Shop",
    body: [
      "O acesso aos dados de afiliado do criador ocorre somente após autorização explícita do próprio criador, por meio do fluxo oficial de autorização (OAuth) do TikTok Shop. O criador pode revogar essa autorização a qualquer momento, o que interrompe o acesso e remove os tokens armazenados.",
    ],
  },
  {
    n: "5",
    title: "Armazenamento e segurança",
    body: [
      "Os dados são armazenados em infraestrutura gerenciada (Supabase), com criptografia em trânsito (TLS/HTTPS) e em repouso. O acesso é restrito por controle de acesso baseado em papéis (RBAC) e políticas de segurança em nível de banco de dados (RLS), seguindo o princípio do menor privilégio. Credenciais e tokens são mantidos apenas no servidor, nunca expostos no frontend.",
    ],
  },
  {
    n: "6",
    title: "Retenção e exclusão",
    body: [
      "Os dados são mantidos enquanto durar a relação de uso. O usuário pode desconectar sua conta a qualquer momento, o que revoga e exclui os tokens armazenados. Ao encerrar a relação, os dados pessoais associados são excluídos.",
    ],
  },
  {
    n: "7",
    title: "Direitos do titular",
    body: [
      "Nos termos da LGPD, o titular pode solicitar acesso, correção, exclusão, portabilidade e informações sobre o tratamento de seus dados. As solicitações podem ser feitas pelo contato abaixo.",
    ],
  },
  {
    n: "8",
    title: "Encarregado pelo tratamento de dados (DPO)",
    body: ["Contato do encarregado: saguaro.comunicacao@gmail.com"],
  },
  {
    n: "9",
    title: "Notificação de incidentes",
    body: [
      "Em caso de incidente de segurança que possa acarretar risco aos titulares, notificaremos os afetados e as autoridades competentes conforme exigido pela LGPD.",
    ],
  },
  { n: "10", title: "Contato", body: ["Saguaro Comunicação Ltda — saguaro.comunicacao@gmail.com"] },
];

function PrivacidadePage() {
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
          <span className="grid size-12 place-items-center rounded-2xl border border-landing-mint/25 bg-landing-mint/5 text-landing-mint"><ShieldCheck className="size-6" aria-hidden="true" /></span>
          <p className="text-sm text-landing-muted">Shop Studio · LGPD</p>
        </div>
        <h1 className="landing-display text-4xl font-bold leading-tight sm:text-5xl">Política de Privacidade</h1>
        <p className="mt-4 text-sm text-landing-muted">Última atualização: 19 de setembro de 2026</p>

        <div className="mt-8 rounded-2xl border border-landing-line bg-landing-surface/50 p-6 text-base leading-8 text-landing-muted">
          A Shop Studio é uma plataforma desenvolvida e operada pela Saguaro Comunicação Ltda, CNPJ 08.732.946/0001-54, com sede em Florianópolis/SC. Esta política descreve como tratamos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
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
          <Button asChild variant="outline" className="landing-focus landing-outline h-11 rounded-xl px-5"><Link to="/seguranca">Ver Política de Segurança</Link></Button>
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
