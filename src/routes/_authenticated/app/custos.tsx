import { createFileRoute } from "@tanstack/react-router";
import { CostsPage } from "@/components/costs-page";

export const Route = createFileRoute("/_authenticated/app/custos")({
  head: () => ({
    meta: [
      { title: "Custos — Shop Studio" },
      { name: "description", content: "Acompanhe o custo real de cada vídeo, etapa e busca de produto." },
      { property: "og:title", content: "Custos — Shop Studio" },
      { property: "og:description", content: "Acompanhe o custo real de cada vídeo, etapa e busca de produto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CostsPage,
});
