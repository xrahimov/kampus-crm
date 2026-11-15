"use client";

import { GraduationCap, LayoutGrid, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { VIEW_HOME, type StaffView } from "@/lib/rbac/views";
import { cn } from "@/lib/utils";

const HINT_KEY = (userId: string) => `kampus.viewHint.${userId}`;
const noop = () => () => undefined;

function hintSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY(userId)) === "seen";
  } catch {
    return true;
  }
}

export interface ViewSwitchProps {
  userId: string;
  current: StaffView;
  /** The names on the two sides, e.g. "Teacher" and "Branch manager". */
  teachingLabel: string;
  fullLabel: string;
  /** The person has never used the switch: a one-time note points at it. */
  pristine?: boolean;
  className?: string;
}

/**
 * The view switch (A-194): two sides of one account. Someone who teaches and
 * also runs a branch picks the teaching side to see only lessons, homework
 * and their own students, and the other side for everything else. The choice
 * is kept on the account, so the phone opens the same way as the laptop.
 */
export function ViewSwitch({
  userId,
  current,
  teachingLabel,
  fullLabel,
  pristine = false,
  className,
}: ViewSwitchProps) {
  const t = useTranslations("view");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The side just pressed: the thumb sets off before the server has answered.
  const [picked, setPicked] = useState<StaffView | null>(null);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const seen = useSyncExternalStore(
    noop,
    () => hintSeen(userId),
    () => true,
  );
  const shown = picked ?? current;
  const hint = pristine && !seen && !dismissed && picked === null;

  function closeHint() {
    setDismissed(true);
    try {
      window.localStorage.setItem(HINT_KEY(userId), "seen");
    } catch {
      // A private window: the note comes back next time, which is harmless.
    }
  }

  async function choose(view: StaffView) {
    if (view === shown || isPending) return;
    setPicked(view);
    setFailed(false);
    closeHint();
    try {
      await api("/auth/view", { method: "POST", body: { view } });
      startTransition(() => {
        router.replace(VIEW_HOME[view]);
        router.refresh();
      });
    } catch {
      setPicked(null);
      setFailed(true);
    }
  }

  const sides: Array<{ view: StaffView; label: string; icon: typeof GraduationCap }> = [
    { view: "TEACHING", label: teachingLabel, icon: GraduationCap },
    { view: "FULL", label: fullLabel, icon: LayoutGrid },
  ];

  return (
    <div className={cn("relative", className)}>
      <div
        role="radiogroup"
        aria-label={t("label")}
        data-testid="view-switch"
        data-view={shown}
        className={cn(
          "relative grid h-9 grid-cols-2 rounded-full bg-muted p-0.5 text-sm dark:ring-1 dark:ring-white/10",
          failed && "animate-shake",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-sidebar shadow-card transition-transform dark:bg-sidebar-muted duration-300 ease-arrive",
            shown === "FULL" && "translate-x-full",
          )}
        />
        {sides.map(({ view, label, icon: Icon }) => {
          const on = shown === view;
          return (
            <button
              key={view}
              type="button"
              role="radio"
              aria-checked={on}
              title={view === "TEACHING" ? t("teachingHint") : t("fullHint")}
              onClick={() => void choose(view)}
              data-testid={view === "TEACHING" ? "view-teaching" : "view-full"}
              className={cn(
                "relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 font-medium transition-colors duration-200",
                on ? "text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn("size-4 shrink-0 transition-colors", on && "text-sidebar-active")}
                strokeWidth={1.75}
              />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {hint && (
        <div
          role="note"
          data-testid="view-hint"
          className="absolute top-full left-1/2 z-50 mt-2 w-64 -translate-x-1/2 animate-rise rounded-lg bg-sidebar p-3 text-sm text-sidebar-foreground shadow-lift before:absolute before:-top-1 before:left-1/2 before:size-2.5 before:-translate-x-1/2 before:rotate-45 before:bg-sidebar"
        >
          <p className="pr-5 font-medium text-white">{t("hintTitle", { role: teachingLabel })}</p>
          <p className="mt-0.5">{t("hintText")}</p>
          <button
            type="button"
            onClick={closeHint}
            aria-label={t("hintClose")}
            className="absolute top-2 right-2 rounded p-0.5 hover:bg-sidebar-muted hover:text-white focus-visible:outline-sidebar-active"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One press to the other side, staying on the page: shown where a page turns
 * the teaching view away but the person's other role may open it.
 */
export function SwitchViewButton({ view, label }: { view: StaffView; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await api("/auth/view", { method: "POST", body: { view } });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void go()}
      disabled={busy || isPending}
      data-testid="switch-view"
      className="press inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-glaze hover:bg-primary/90 disabled:opacity-50"
    >
      <LayoutGrid className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}
