import { createFileRoute } from "@tanstack/react-router";
import { ProfileEditorPage } from "@/components/profile-editor-page";

export const Route = createFileRoute("/_authenticated/app/perfis/novo")({
  head: () => ({
    meta: [
      { title: "Adicionar perfil — Shop Studio" },
      { name: "description", content: "Cadastre um novo perfil de conteúdo." },
      { property: "og:title", content: "Adicionar perfil — Shop Studio" },
      { property: "og:description", content: "Cadastre um novo perfil de conteúdo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ProfileEditorPage profileId={null} />,
});
