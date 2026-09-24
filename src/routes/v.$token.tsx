import { createFileRoute } from "@tanstack/react-router";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";
import { getSharedVideo } from "@/lib/share.functions";

export const Route = createFileRoute("/v/$token")({
  ssr: false,
  loader: ({ params }) => getSharedVideo({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Vídeo — Shop Studio" },
      { name: "description", content: "Assista ao vídeo compartilhado pelo Shop Studio." },
      { property: "og:title", content: "Vídeo — Shop Studio" },
      { property: "og:description", content: "Assista ao vídeo compartilhado pelo Shop Studio." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <SharedShell>Este vídeo não está mais disponível.</SharedShell>,
  notFoundComponent: () => <SharedShell>Este vídeo não está mais disponível.</SharedShell>,
  component: SharedVideoPage,
});

function SharedShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-neutral-950 px-4 py-10">
      <img src={logoDarkAsset.url} alt="Shop Studio" className="h-8 w-auto" />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

function SharedVideoPage() {
  const data = Route.useLoaderData();

  if (!data.ok) {
    return (
      <SharedShell>
        <div className="rounded-2xl border border-video/10 bg-video/5 p-8 text-center">
          <p className="text-sm font-bold text-video">Este vídeo não está mais disponível.</p>
          <p className="mt-2 text-xs text-video/60">O link pode ter expirado ou sido revogado.</p>
        </div>
      </SharedShell>
    );
  }

  return (
    <SharedShell>
      <video
        src={data.videoUrl}
        poster={data.thumbnailUrl ?? undefined}
        controls
        autoPlay
        playsInline
        className="aspect-[9/16] w-full rounded-2xl bg-video-bg object-cover shadow-[0_0_60px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
      />
    </SharedShell>
  );
}
