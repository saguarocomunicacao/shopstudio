import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo: agora a lista fica em /app/analises.
export const Route = createFileRoute("/_authenticated/app/analisar")({
  beforeLoad: () => {
    throw redirect({ to: "/app/analises", replace: true });
  },
});
