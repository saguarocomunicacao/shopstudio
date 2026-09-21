import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/account-page";

export const Route = createFileRoute("/_authenticated/app/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Shop Studio" },
      { name: "description", content: "Seus dados de acesso, foto de perfil e plano contratado no Shop Studio." },
      { property: "og:title", content: "Minha conta — Shop Studio" },
      { property: "og:description", content: "Seus dados de acesso, foto de perfil e plano contratado no Shop Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});
