import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsPage } from "@/components/approvals-page";

export const Route = createFileRoute("/_authenticated/app/aprovacoes")({
  head: () => ({
    meta: [
      { title: "Aprovação de cadastros — Shop Studio" },
      { name: "description", content: "Libere ou recuse o acesso de novos cadastros ao Shop Studio." },
      { property: "og:title", content: "Aprovação de cadastros — Shop Studio" },
      { property: "og:description", content: "Libere ou recuse o acesso de novos cadastros ao Shop Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApprovalsPage,
});
