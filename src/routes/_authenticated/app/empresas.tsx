import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsPage } from "@/components/approvals-page";

export const Route = createFileRoute("/_authenticated/app/empresas")({
  head: () => ({ meta: [
    { title: "Empresas — Shop Studio" },
    { name: "description", content: "Gerencie empresas, acessos e planos no Shop Studio." },
    { property: "og:title", content: "Empresas — Shop Studio" },
    { property: "og:description", content: "Gerencie empresas, acessos e planos no Shop Studio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ApprovalsPage,
});