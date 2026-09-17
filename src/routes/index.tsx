import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shop Studio — conteúdo afiliado para TikTok Shop" },
      { name: "description", content: "Crie, organize e publique vídeos afiliados do TikTok Shop com múltiplos perfis, pipeline e geração assistida." },
      { property: "og:title", content: "Shop Studio — conteúdo afiliado para TikTok Shop" },
      { property: "og:description", content: "Crie, organize e publique vídeos afiliados do TikTok Shop com múltiplos perfis, pipeline e geração assistida." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-xl text-center">
        <span className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-full bg-foreground text-sm font-black text-background">SS</span>
        <h1 className="glitch-logo text-4xl font-black" data-text="Shop Studio">Shop Studio</h1>
        <p className="mt-4 text-base text-muted-foreground">
          Produção de conteúdo afiliado para TikTok Shop: múltiplos perfis, garimpo de produtos, roteiro, vídeo e publicação em um só lugar.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/entrar" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Entrar
          </Link>
          <Link to="/app" className="inline-flex h-11 items-center justify-center rounded-lg bg-secondary px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80">
            Ir para o painel
          </Link>
        </div>
      </div>
    </main>
  );
}
