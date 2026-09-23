import { createFileRoute } from "@tanstack/react-router";
import { AutomationPage } from "@/components/automation-page";

const descricao = "Configure agendas para o Shop Studio gerar vídeos por IA sozinho e parar em Aguardando revisão.";

export const Route = createFileRoute("/_authenticated/app/automacao")({
  head: () => ({
    meta: [
      { title: "Automação — Shop Studio" },
      { name: "description", content: descricao },
      { property: "og:title", content: "Automação — Shop Studio" },
      { property: "og:description", content: descricao },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationPage,
});
