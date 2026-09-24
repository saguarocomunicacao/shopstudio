import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PesquisaPage } from "@/components/pesquisa-page";

export const Route = createFileRoute("/_authenticated/app/pesquisa/$id")({
  validateSearch: (s) => z.object({ tab: z.enum(["videos", "insights"]).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Resultado da pesquisa — Shop Studio" },
      { name: "description", content: "Volume, engajamento, hashtags e ganchos dos vídeos de um tema no TikTok." },
      { property: "og:title", content: "Resultado da pesquisa — Shop Studio" },
      { property: "og:description", content: "Volume, engajamento, hashtags e ganchos dos vídeos de um tema no TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  return <PesquisaPage pesquisaId={id} tab={tab} />;
}
