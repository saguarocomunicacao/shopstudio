import { createFileRoute } from "@tanstack/react-router";
import { InvestmentPage } from "@/components/investment-page";

const descricao = "Acompanhe aportes, saldo e cota de cada fornecedor do Shop Studio sem abrir plataformas externas.";

export const Route = createFileRoute("/_authenticated/app/investimento")({
  head: () => ({
    meta: [
      { title: "Investimento — Shop Studio" },
      { name: "description", content: descricao },
      { property: "og:title", content: "Investimento — Shop Studio" },
      { property: "og:description", content: descricao },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvestmentPage,
});
