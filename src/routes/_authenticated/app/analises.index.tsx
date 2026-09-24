import { createFileRoute } from "@tanstack/react-router";
import { AnalisarVideoPage } from "@/components/analisar-video-page";

export const Route = createFileRoute("/_authenticated/app/analises/")({
  head: () => ({
    meta: [
      { title: "Analisar vídeo — Shop Studio" },
      { name: "description", content: "Analise vídeos enviados ou de links do TikTok, YouTube e Instagram: gancho, cenas, transcrição e produto." },
      { property: "og:title", content: "Analisar vídeo — Shop Studio" },
      { property: "og:description", content: "Analise vídeos enviados ou de links do TikTok, YouTube e Instagram: gancho, cenas, transcrição e produto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AnalisarVideoPage />,
});
