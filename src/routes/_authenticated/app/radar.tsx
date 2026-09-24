import { createFileRoute } from "@tanstack/react-router";
import { RadarPage } from "@/components/radar-page";

export const Route = createFileRoute("/_authenticated/app/radar")({
  head: () => ({
    meta: [
      { title: "Radar de concorrentes — Shop Studio" },
      { name: "description", content: "Vídeos novos dos perfis de referência que estão subindo rápido nas primeiras horas." },
      { property: "og:title", content: "Radar de concorrentes — Shop Studio" },
      { property: "og:description", content: "Vídeos novos dos perfis de referência que estão subindo rápido nas primeiras horas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RadarPage,
});
