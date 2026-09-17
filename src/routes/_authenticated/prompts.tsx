import { createFileRoute } from "@tanstack/react-router";
import { PromptsPage } from "@/components/prompts-page";

export const Route = createFileRoute("/_authenticated/prompts")({
  head: () => ({
    meta: [
      { title: "Prompts do sistema — Shop Studio" },
      { name: "description", content: "Edite os prompts padrão usados pela IA." },
      { property: "og:title", content: "Prompts do sistema — Shop Studio" },
      { property: "og:description", content: "Edite os prompts padrão usados pela IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PromptsPage,
});
