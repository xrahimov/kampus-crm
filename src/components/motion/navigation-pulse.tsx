"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** A page that has not arrived after this long is not coming; stop signalling. */
const GIVE_UP_MS = 8000;

/** Where a click on this link would take the browser, or null when it is not a page change. */
function destination(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.hasAttribute("download")) return null;
  if (link.target && link.target !== "_self") return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Files and API answers open or download; the page itself stays where it is.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return null;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

/**
 * Says "the next page is on its way" from the moment a link is pressed until
 * the address changes (A-192): it sets `data-navigating` on <html>, and the
 * stylesheet turns the brand star and draws a thin line across the top while
 * the attribute is there. No state of its own, so it never re-renders a page.
 */
function Pulse() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    let timer: number | undefined;
    const onClick = (event: MouseEvent) => {
      if (!destination(event)) return;
      document.documentElement.dataset.navigating = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delete document.documentElement.dataset.navigating;
      }, GIVE_UP_MS);
    };
    // Capture phase: the framework's own link handler calls preventDefault later.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
    };
  }, []);

  // The address changed: the page has arrived.
  useEffect(() => {
    delete document.documentElement.dataset.navigating;
  }, [pathname, search]);

  return <div className="route-line" aria-hidden="true" data-testid="route-line" />;
}

export function NavigationPulse() {
  // useSearchParams needs a boundary on pages that are built ahead of time.
  return (
    <Suspense fallback={null}>
      <Pulse />
    </Suspense>
  );
}
