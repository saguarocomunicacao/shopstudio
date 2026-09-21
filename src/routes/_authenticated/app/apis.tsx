import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPage } from "@/components/api-keys-page";

export const Route = createFileRoute("/_authenticated/app/apis")({
  head: () => ({
    meta: [
      { title: "Minhas APIs — Shop Studio" },
      { name: "description", content: "Cadastre as chaves das suas próprias contas de Gemini, JSON2Video, ElevenLabs e Kalodata." },
      { property: "og:title", content: "Minhas APIs — Shop Studio" },
      { property: "og:description", content: "Cadastre as chaves das suas próprias contas de Gemini, JSON2Video, ElevenLabs e Kalodata." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiKeysPage,
});
