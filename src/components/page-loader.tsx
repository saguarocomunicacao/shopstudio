import loaderMark from "@/assets/loader-mark.png.asset.json";
import { cn } from "@/lib/utils";

/** Loader da marca (mesmo das transições), sem texto. Usar em qualquer carregamento de tela/bloco. */
export function PageLoader({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "size-8" : "size-14";
  return (
    <div role="status" aria-label="Carregando" className={cn("flex w-full items-center justify-center", size === "sm" ? "py-3" : "py-12", className)}>
      <div className={cn("route-loader-mark", box)} style={{ width: undefined, height: undefined }}>
        <span className="route-loader-ring" aria-hidden="true" />
        <img src={loaderMark.url} alt="" className="route-loader-logo" />
      </div>
    </div>
  );
}
