import { useEffect, useState } from "react";

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
  // eslint-disable-next-line no-var
  var __APP_BUILT_AT__: string;
}

/** Versao embutida neste bundle (carimbada no build). */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const APP_BUILT_AT = typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : "";

const CHECK_INTERVAL = 60_000;

const isChunkError = (value: unknown) => {
  const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  return (
    /ChunkLoadError/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
};

/** Limpa caches/service workers e recarrega na versao nova. */
export async function forceReload() {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // segue para o reload mesmo se a limpeza falhar
  }
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}

/** Observa /version.json e avisa quando sai versao nova. */
export function useAppVersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || updateAvailable) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (!cancelled && data.version && data.version !== APP_VERSION) setUpdateAvailable(true);
      } catch {
        // offline ou deploy em andamento: tenta de novo no proximo ciclo
      }
    };

    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onChunkError = (event: Event) => {
      const reason = event instanceof PromiseRejectionEvent ? event.reason : (event as ErrorEvent).error ?? (event as ErrorEvent).message;
      if (isChunkError(reason)) setUpdateAvailable(true);
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("error", onChunkError);
    window.addEventListener("unhandledrejection", onChunkError);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("error", onChunkError);
      window.removeEventListener("unhandledrejection", onChunkError);
    };
  }, [updateAvailable]);

  return updateAvailable;
}
