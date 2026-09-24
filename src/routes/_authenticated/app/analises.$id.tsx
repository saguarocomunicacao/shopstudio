import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ABAS_ANALISE, AnalisarVideoPage } from "@/components/analisar-video-page";

export const Route = createFileRoute("/_authenticated/app/analises/$id")({
  validateSearch: (s) => z.object({ tab: z.enum(ABAS_ANALISE).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Análise de vídeo — Shop Studio" },
      { name: "description", content: "Gancho, cenas, transcrição e produto identificados no vídeo." },
      { property: "og:title", content: "Análise de vídeo — Shop Studio" },
      { property: "og:description", content: "Gancho, cenas, transcrição e produto identificados no vídeo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  return <AnalisarVideoPage abertaId={id} tab={tab} />;
}
