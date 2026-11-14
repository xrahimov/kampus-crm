"use client";

import { Maximize2, RotateCcw, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { AssistantConversation, type AssistantAudience } from "./assistant-conversation";
import { useAssistantChat } from "./assistant-store";
import { BriefingView } from "./briefing-view";

import "./assistant.css";

type Tab = "summary" | "chat";

const SEEN_KEY = (userId: string) => `kampus.summary.seen.${userId}`;
const AUTO_KEY = "kampus.summary.auto";

/** The centre's day (Tashkent, UTC+5), which is the day a summary belongs to. */
function centreDay(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Browser storage can be switched off; the assistant then simply forgets. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the summary will offer itself again.
  }
}

/**
 * The assistant that floats over every staff page (A-191): a round button in
 * the corner that opens the person's summary and a conversation, without
 * leaving the page they are on. Once a day, on the first page a person opens,
 * the summary opens by itself (A-190), as the centres were used to; a switch
 * in the panel turns that off for this browser.
 */
export function AssistantLauncher({
  userId,
  userName,
  audience,
}: {
  userId: string;
  userName: string;
  audience: AssistantAudience;
}) {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const { turns, mode, clear } = useAssistantChat(userId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  // Whether today's summary still waits to be looked at, and whether it may open by itself.
  const [fresh, setFresh] = useState(false);
  const [auto, setAuto] = useState(true);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // After the page has settled, so the summary arrives as its own moment.
    const id = window.setTimeout(() => {
      const unseen = read(SEEN_KEY(userId)) !== centreDay();
      const allowed = read(AUTO_KEY) !== "off";
      setAuto(allowed);
      setFresh(unseen);
      if (unseen && allowed) {
        setTab("summary");
        setOpen(true);
      }
    }, 900);
    return () => window.clearTimeout(id);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // `close` only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function seen() {
    write(SEEN_KEY(userId), centreDay());
    setFresh(false);
  }

  function close() {
    seen();
    setOpen(false);
    fabRef.current?.focus();
  }

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  return (
    <div className="print:hidden" data-testid="assistant-launcher">
      {open && (
        <section
          role="dialog"
          aria-label={t("title")}
          data-testid="assistant-panel"
          className={cn(
            "kampus-ai-panel fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card",
            "inset-x-2 top-16 bottom-2",
            "sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-24 sm:h-[min(41rem,calc(100dvh-7.5rem))] sm:w-[27rem]",
          )}
        >
          <header className="bg-sidebar px-4 pt-3.5 text-sidebar-foreground">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">
                  {t("launcher.greeting", { name: userName })}
                </p>
                <p className="text-xs">{t("launcher.tagline")}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("launcher.close")}
                data-testid="assistant-panel-close"
                className="-mr-1 rounded-md p-1.5 transition-colors hover:bg-sidebar-muted hover:text-white focus-visible:outline-sidebar-active"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-1" role="tablist" aria-label={t("title")}>
              {(["summary", "chat"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  data-testid={`assistant-tab-${key}`}
                  className={cn(
                    "border-b-2 px-3 pb-2 text-sm font-medium transition-colors focus-visible:outline-sidebar-active",
                    tab === key
                      ? "border-sidebar-active text-white"
                      : "border-transparent hover:text-white",
                  )}
                >
                  {t(`launcher.${key}`)}
                </button>
              ))}
            </div>
          </header>

          {tab === "summary" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <BriefingView />
              </div>
              <footer className="flex items-center justify-between gap-3 border-t px-4 py-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={auto}
                    onCheckedChange={(on) => {
                      setAuto(on);
                      write(AUTO_KEY, on ? "on" : "off");
                    }}
                    data-testid="briefing-auto"
                  />
                  {t("launcher.auto")}
                </label>
                <Button size="sm" onClick={close} data-testid="briefing-understood">
                  {t("launcher.understood")}
                </Button>
              </footer>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-2 flex items-center justify-end gap-1">
                {turns.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clear}
                    data-testid="assistant-panel-clear"
                  >
                    <RotateCcw /> {t("clear")}
                  </Button>
                )}
                {pathname !== "/assistant" && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/assistant" onClick={close}>
                      <Maximize2 /> {t("launcher.fullPage")}
                    </Link>
                  </Button>
                )}
              </div>
              {mode === "fake" && (
                <p
                  className="mb-2 rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  data-testid="assistant-panel-test-mode"
                >
                  {t("testMode")}
                </p>
              )}
              <AssistantConversation
                userId={userId}
                audience={audience}
                page={pathname}
                testId="assistant-panel"
              />
            </div>
          )}
        </section>
      )}

      <button
        ref={fabRef}
        type="button"
        onClick={toggle}
        aria-label={open ? t("launcher.close") : t("launcher.open")}
        aria-expanded={open}
        title={open ? t("launcher.close") : t("launcher.open")}
        data-fresh={fresh && !open ? "true" : "false"}
        data-testid="assistant-fab"
        className={cn(
          "kampus-ai-fab fixed right-4 bottom-4 z-40 size-13 rounded-full sm:right-5 sm:bottom-5",
          "focus-visible:outline-offset-4",
          // On a phone the open panel fills the screen and carries its own close button.
          open && "max-sm:hidden",
        )}
      >
        <span
          aria-hidden
          className="kampus-ai-fab-face absolute inset-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          {open ? <X className="size-5" /> : <Sparkles className="size-5.5" />}
        </span>
      </button>
    </div>
  );
}
