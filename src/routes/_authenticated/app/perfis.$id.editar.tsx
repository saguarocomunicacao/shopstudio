import { createFileRoute } from "@tanstack/react-router";
import { ProfileEditorPage } from "@/components/profile-editor-page";

export const Route = createFileRoute("/_authenticated/app/perfis/$id/editar")({
  head: () => ({
    meta: [
      { title: "Editar perfil — Shop Studio" },
      { name: "description", content: "Ajuste os dados, a identidade e a geração de vídeo do perfil." },
      { property: "og:title", content: "Editar perfil — Shop Studio" },
      { property: "og:description", content: "Ajuste os dados, a identidade e a geração de vídeo do perfil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditarPerfil,
});

function EditarPerfil() {
  const { id } = Route.useParams();
  return <ProfileEditorPage profileId={id} />;
}
