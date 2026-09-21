export function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

export async function enterMobileFullscreen() {
  if (!isMobileViewport() || typeof document === "undefined" || document.fullscreenElement) return;
  const root = document.documentElement;
  if (!root.requestFullscreen) return;
  await root.requestFullscreen().catch(() => undefined);
}

export async function exitMobileFullscreen() {
  if (typeof document === "undefined" || !document.fullscreenElement || !document.exitFullscreen) return;
  await document.exitFullscreen().catch(() => undefined);
}