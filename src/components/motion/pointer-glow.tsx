"use client";

import { useEffect } from "react";

/**
 * Tells cards and the sign-in wall where the mouse is (A-192): one listener
 * for the whole page writes --mx/--my, in pixels from the element's corner,
 * on the `.card-link` or `[data-glow]` under the pointer, and the stylesheet
 * paints a soft light there. Touch screens are left alone: there is no
 * pointer to follow, and no work to do.
 */
export function PointerGlow() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      const event = last;
      if (!event) return;
      const el = (event.target as Element | null)?.closest?.<HTMLElement>(
        ".card-link, [data-glow]",
      );
      if (!el) return;
      const box = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${event.clientX - box.left}px`);
      el.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
