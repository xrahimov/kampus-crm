"use client";

import { CheckCircle2, Circle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { SetupChecklistDto } from "@/server/services/dashboard/setup.service";

/** "Set up your centre" on the home page (A-128): each step with a tick and a link. */
export function SetupChecklist({ data }: { data: SetupChecklistDto }) {
  const t = useTranslations("dashboard.setup");
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (hidden || !data.shown || data.done >= data.total) return null;
  const percent = Math.round((data.done / data.total) * 100);

  async function hide() {
    await api("/dashboard/setup", { method: "PATCH", body: { shown: false } });
    setHidden(true);
    startTransition(() => router.refresh());
  }

  return (
    <Card data-testid="setup-checklist">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle>{t("title")}</CardTitle>
          <p className="text-sm text-muted-foreground" data-testid="setup-progress">
            {t("progress", { done: data.done, total: data.total })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={hide}
          disabled={isPending}
          title={t("hideHint")}
          data-testid="setup-hide"
        >
          <X /> {t("hide")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.steps.map((step) => (
            <li
              key={step.key}
              className="flex items-start gap-3 rounded-lg border px-3 py-2"
              data-testid={`setup-step-${step.key}`}
              data-done={String(step.done)}
            >
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{t(`steps.${step.key}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {step.done
                    ? step.count === null
                      ? t("connected")
                      : t("have", { count: step.count })
                    : t(`todo.${step.key}`)}
                </p>
              </div>
              {!step.done && (
                <Button asChild variant="outline" size="sm">
                  <Link href={step.href}>{t("open")}</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
