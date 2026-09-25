import { SiTiktok } from "react-icons/si";
import { cn } from "@/lib/utils";

/** Ícone oficial do TikTok (Simple Icons, monocromático). Cor herdada do texto. */
export function TikTokIcon({ size, className }: { size?: number | string; className?: string }) {
  // SiTiktok tem menos respiro que os ícones lucide; 0.9 iguala a altura óptica.
  return <SiTiktok size={size ?? "1em"} className={cn("shrink-0 scale-90", className)} color="currentColor" aria-hidden="true" focusable="false" />;
}
