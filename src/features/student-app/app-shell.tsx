"use client";

import { Download, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/** Chrome's deferred "Add to home screen" prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "kampus.studentInstallDismissed";
const STUDENT_PATH = /^\/(uz|ru|en)\/(class|student|family)(\/|$)/;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const readOffline = () => !navigator.onLine;
const serverOffline = () => false;

function dismissedBefore(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The student app's shell (A-173) on the public pages: registers the service
 * worker that keeps the last pages for offline use, shows a banner while the
 * network is away, and offers "Add to home screen" where the browser allows it.
 */
export function StudentAppShell() {
  const t = useTranslations("studentApp.shell");
  const pathname = usePathname();
  const studentPage = STUDENT_PATH.test(pathname ?? "");
  const offline = useSyncExternalStore(subscribeOnline, readOffline, serverOffline);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  // The bar only appears after the browser's event, so the first render never shows it.
  const [hidden, setHidden] = useState(dismissedBefore);

  useEffect(() => {
    if (!studentPage) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/student-sw.js", { scope: "/" }).catch(() => undefined);
    }
    const before = (event: Event) => {
      event.preventDefault();
      setInstall(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", before);
    return () => window.removeEventListener("beforeinstallprompt", before);
  }, [studentPage]);

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* private mode: the bar comes back next time */
    }
  }

  async function doInstall() {
    if (!install) return;
    await install.prompt();
    const choice = await install.userChoice;
    if (choice.outcome === "accepted") dismiss();
    setInstall(null);
  }

  if (!studentPage) return null;
  return (
    <>
      {offline && (
        <div
          role="status"
          className="mx-auto mb-4 flex w-full max-w-2xl items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          data-testid="student-offline"
        >
          <WifiOff className="size-4 shrink-0" /> {t("offline")}
        </div>
      )}
      {install && !hidden && (
        <div
          className="mx-auto mb-4 flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
          data-testid="student-install"
        >
          <Download className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">{t("installHint")}</span>
          <Button size="sm" onClick={() => void doInstall()} data-testid="student-install-go">
            {t("install")}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} aria-label={t("later")}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
}
