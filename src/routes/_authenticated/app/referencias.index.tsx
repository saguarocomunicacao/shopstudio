import { createFileRoute } from "@tanstack/react-router";
import { ReferenciasPage } from "@/components/referencias-page";

export const Route = createFileRoute("/_authenticated/app/referencias/")({
  head: () => ({
    meta: [
      { title: "Perfis de referência — Shop Studio" },
      { name: "description", content: "Acompanhe perfis do TikTok, analise vídeos em lote e descubra os padrões dos que mais performam." },
      { property: "og:title", content: "Perfis de referência — Shop Studio" },
      { property: "og:description", content: "Acompanhe perfis do TikTok, analise vídeos em lote e descubra os padrões dos que mais performam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferenciasPage,
});
