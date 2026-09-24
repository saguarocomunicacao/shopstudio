import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ABAS_REFERENCIA, ReferenciasPage } from "@/components/referencias-page";

export const Route = createFileRoute("/_authenticated/app/referencias/$id")({
  validateSearch: (s) => z.object({ tab: z.enum(ABAS_REFERENCIA).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Perfil de referência — Shop Studio" },
      { name: "description", content: "Vídeos, evolução e insights de um perfil do TikTok acompanhado." },
      { property: "og:title", content: "Perfil de referência — Shop Studio" },
      { property: "og:description", content: "Vídeos, evolução e insights de um perfil do TikTok acompanhado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  return <ReferenciasPage refId={id} tab={tab} />;
}
