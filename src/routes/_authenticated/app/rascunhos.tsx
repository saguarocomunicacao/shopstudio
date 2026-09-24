import { createFileRoute } from "@tanstack/react-router";
import { DraftsPage } from "@/components/drafts-page";

export const Route = createFileRoute("/_authenticated/app/rascunhos")({
  validateSearch: (search: Record<string, unknown>): { jobId?: string | undefined; perfil?: string | undefined; tab?: string | undefined; guia?: string | undefined } => ({
    jobId: typeof search["jobId"] === "string" ? search["jobId"] : undefined,
    perfil: typeof search["perfil"] === "string" ? search["perfil"] : undefined,
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
    guia: typeof search["guia"] === "string" ? search["guia"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Rascunhos — Shop Studio" },
      { name: "description", content: "Revise e publique vídeos prontos." },
      { property: "og:title", content: "Rascunhos — Shop Studio" },
      { property: "og:description", content: "Revise e publique vídeos prontos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DraftsRoute,
});

function DraftsRoute() {
  const { jobId } = Route.useSearch();
  return <DraftsPage initialJobId={jobId} />;
}