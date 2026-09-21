import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/components/plans-card";
import { requireBackofficeRoute } from "@/lib/backoffice-route";

export const Route = createFileRoute("/_authenticated/app/planos/")({
  beforeLoad: requireBackofficeRoute,
  head: () => ({ meta: [
    { title: "Planos — Shop Studio" },
    { name: "description", content: "Gerencie o catálogo de planos do Shop Studio." },
    { property: "og:title", content: "Planos — Shop Studio" },
    { property: "og:description", content: "Gerencie o catálogo de planos do Shop Studio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PlansPage,
});