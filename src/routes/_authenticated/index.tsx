import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/studio-pages";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Creator Studio" }, { name: "description", content: "Visão geral da operação de conteúdo afiliado." }, { property: "og:title", content: "Dashboard — Creator Studio" }, { property: "og:description", content: "Visão geral da operação de conteúdo afiliado." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: DashboardPage,
});
