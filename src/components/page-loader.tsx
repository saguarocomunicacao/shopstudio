import loaderMark from "@/assets/loader-mark.png.asset.json";
import { cn } from "@/lib/utils";

/** Loader da marca (mesmo das transições), sem texto. Usar em qualquer carregamento de tela/bloco. */
export function PageLoader({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const ring = size === "sm" ? "2.25rem" : "4.5rem";
  const logo = size === "sm" ? "1.1rem" : "2.25rem";
  return (
    <div role="status" aria-label="Carregando" className={cn("flex w-full items-center justify-center", size === "sm" ? "py-2" : "py-12", className)}>
      <div className="route-loader-mark" style={{ width: ring, height: ring }}>
        <span className="route-loader-ring" aria-hidden="true" />
        <img src={loaderMark.url} alt="" className="route-loader-logo" style={{ width: logo, height: logo }} />
      </div>
    </div>
  );
}
