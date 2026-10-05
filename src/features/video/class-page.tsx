"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { weekdayLabel } from "@/features/groups/weekday";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import type { Weekday } from "@/lib/validation/groups";
import { useDateFormat } from "@/lib/use-date-format";
import type { ClassPageDto, JoinDto } from "@/server/services/video/video.service";

import { CallFlow } from "./call-flow";

const POLL_MS = 5000;

async function joinClass(token: string): Promise<JoinDto> {
  const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error ?? { code: "INTERNAL", message: "errors.internal" },
    );
  }
  return (await response.json()) as JoinDto;
}

/** A student's link: waits for the teacher to start, then lets them in. */
export function ClassPage({ token, initial }: { token: string; initial: ClassPageDto }) {
  const t = useTranslations("video.class");
  const fmt = useDateFormat();
  const [page, setPage] = useState(initial);

  // Keeps checking whether the teacher has started (or ended) the lesson.
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch(`/api/v1/public/class/${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      })
        .then((r) => (r.ok ? (r.json() as Promise<ClassPageDto>) : null))
        .then((next) => next && setPage(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="class-title">{t("hello", { name: page.studentName })}</CardTitle>
        <CardDescription>
          {t("group", { group: page.groupName, center: page.organizationName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!page.enabled ? (
          <Alert>{t("disabled")}</Alert>
        ) : (
          <CallFlow
            role="STUDENT"
            name={page.studentName}
            ready={Boolean(page.roomId)}
            waitingText={t("waiting")}
            join={() => joinClass(token)}
          />
        )}
        {page.schedule.length > 0 && (
          <div className="border-t pt-3 text-sm">
            <h3 className="mb-1 font-medium">{t("schedule")}</h3>
            <ul>
              {page.schedule.map((s) => (
                <li key={s.weekday} className="flex justify-between gap-2 py-0.5">
                  <span>{weekdayLabel(fmt, s.weekday as Weekday, "long")}</span>
                  <span className="tabular-nums">
                    {s.startTime} – {s.endTime}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
