import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import loaderMark from "@/assets/loader-mark.png.asset.json";

const APPEAR_DELAY_MS = 150;
const FADE_OUT_MS = 260;

/**
 * Overlay global de transicao entre telas do app.
 * Atrelado ao estado real de navegacao do router (pending/loading),
 * sem timeout fixo para esconder.
 */
export function RouteLoader() {
  const isNavigating = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading,
  });
  const isAppRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/app"),
  });

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const appearTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearAppear = () => {
      if (appearTimer.current !== null) window.clearTimeout(appearTimer.current);
      appearTimer.current = null;
    };
    const clearLeave = () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    };

    if (isNavigating && isAppRoute) {
      clearLeave();
      setLeaving(false);
      if (!visible && appearTimer.current === null) {
        appearTimer.current = window.setTimeout(() => {
          appearTimer.current = null;
          setVisible(true);
        }, APPEAR_DELAY_MS);
      }
      return clearAppear;
    }

    clearAppear();
    if (visible && !leaving) {
      setLeaving(true);
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = null;
        setVisible(false);
        setLeaving(false);
      }, FADE_OUT_MS);
    }
    return clearLeave;
  }, [isNavigating, isAppRoute, visible, leaving]);

  useEffect(
    () => () => {
      if (appearTimer.current !== null) window.clearTimeout(appearTimer.current);
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      className={`route-loader${leaving ? " route-loader-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Carregando tela"
    >
      <div className="route-loader-mark">
        <span className="route-loader-ring" aria-hidden="true" />
        <img src={loaderMark.url} alt="" className="route-loader-logo" />
      </div>
    </div>
  );
}
