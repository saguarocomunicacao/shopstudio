import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Ao chegar vindo do guia (?guia=alvo), destaca o mesmo alvo da prévia por 5 segundos. */
export function TourHighlighter() {
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    const key = new URL(href, window.location.origin).searchParams.get("guia");
    if (!key) return;
    let el: Element | null = null;
    let tries = 0;
    let off: ReturnType<typeof setTimeout> | undefined;
    const find = setInterval(() => {
      el = document.querySelector(`[data-tour="${CSS.escape(key)}"]`);
      if (el || ++tries > 30) {
        clearInterval(find);
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("tour-live");
        off = setTimeout(() => el?.classList.remove("tour-live"), 5000);
      }
    }, 200);
    return () => { clearInterval(find); if (off) clearTimeout(off); el?.classList.remove("tour-live"); };
  }, [href]);
  return null;
}
