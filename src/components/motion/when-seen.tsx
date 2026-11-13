"use client";

import { useEffect, useRef } from "react";

/**
 * Holds back the animations inside it until it is scrolled into view (A-192):
 * a chart at the foot of a long page draws itself when someone gets there,
 * not while nobody is looking. It marks its element with `data-seen` once;
 * `.when-seen` in globals.css keeps the animations paused until then.
 */
export function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.seen = "";
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.seen = "";
          watcher.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  return ref;
}

export function WhenSeen({ className, ...props }: React.ComponentProps<"div">) {
  const ref = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={className ? `when-seen ${className}` : "when-seen"} {...props} />
  );
}
