import loaderMark from "@/assets/loader-mark.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Loader da marca, idêntico ao das transições entre telas (overlay escuro com blur,
 * anel ciano/magenta e logo). Usar em qualquer carregamento de tela ou bloco.
 */
export function PageLoader({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const ring = size === "sm" ? "3.5rem" : "7.5rem";
  const logo = size === "sm" ? "1.75rem" : "3.75rem";
  return (
    <div role="status" aria-label="Carregando" className={cn("route-loader", className)}>
      <div className="route-loader-mark" style={{ width: ring, height: ring }}>
        <span className="route-loader-ring" aria-hidden="true" />
        <img src={loaderMark.url} alt="" className="route-loader-logo" style={{ width: logo, height: logo }} />
      </div>
    </div>
  );
}
