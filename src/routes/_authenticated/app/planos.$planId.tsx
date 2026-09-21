import { createFileRoute } from "@tanstack/react-router";
import { PlanDetailPage } from "@/components/plans-card";
import { requireBackofficeRoute } from "@/lib/backoffice-route";

export const Route = createFileRoute("/_authenticated/app/planos/$planId")({
  beforeLoad: requireBackofficeRoute,
  head: () => ({ meta: [
    { title: "Detalhe do plano — Shop Studio" },
    { name: "description", content: "Configure franquias e preços por ação do plano." },
    { property: "og:title", content: "Detalhe do plano — Shop Studio" },
    { property: "og:description", content: "Configure franquias e preços por ação do plano." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PlanDetailRoute,
});

function PlanDetailRoute() {
  const { planId } = Route.useParams();
  return planId === "novo" ? <PlanDetailPage /> : <PlanDetailPage planId={planId} />;
}