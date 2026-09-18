import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/studio-pages";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do backoffice — Shop Studio" },
      { name: "description", content: "Fontes, custos, orçamento, vozes e prompts padrão do sistema." },
      { property: "og:title", content: "Configurações do backoffice — Shop Studio" },
      { property: "og:description", content: "Fontes, custos, orçamento, vozes e prompts padrão do sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});