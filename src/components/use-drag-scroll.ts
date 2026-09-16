import { useEffect, useRef } from "react";

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let down = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;

    const isInteractive = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("button,a,input,textarea,select,[role='button']");

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
    };

    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("is-dragging");
      }
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
    };

    const end = (e: PointerEvent) => {
      if (moved) {
        el.classList.remove("is-dragging");
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      down = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", end);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("pointerleave", end);
    };
  }, []);

  return ref;
}
