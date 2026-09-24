import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PesquisaPage } from "@/components/pesquisa-page";

export const Route = createFileRoute("/_authenticated/app/pesquisa/")({
  validateSearch: (s) => z.object({ q: z.string().max(100).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Pesquisar no TikTok — Shop Studio" },
      { name: "description", content: "Veja o que está sendo postado agora sobre um tema ou hashtag no TikTok." },
      { property: "og:title", content: "Pesquisar no TikTok — Shop Studio" },
      { property: "og:description", content: "Veja o que está sendo postado agora sobre um tema ou hashtag no TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { q } = Route.useSearch();
  return <PesquisaPage termoInicial={q} />;
}
