"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CallFlow } from "@/features/video/call-flow";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { JoinDto, TrialPageDto } from "@/server/services/video/video.service";

const POLL_MS = 5000;

async function joinTrial(token: string): Promise<JoinDto> {
  const response = await fetch(`/api/v1/public/trial/${encodeURIComponent(token)}`, {
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

/** A trial visitor's page (A-172): the visit's day and time, and the way into the call. */
export function TrialPage({ token, initial }: { token: string; initial: TrialPageDto }) {
  const t = useTranslations("video.trial");
  const fmt = useDateFormat();
  const [page, setPage] = useState(initial);

  useEffect(() => {
    const timer = setInterval(() => {
      fetch(`/api/v1/public/trial/${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      })
        .then((r) => (r.ok ? (r.json() as Promise<TrialPageDto>) : null))
        .then((next) => next && setPage(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [token]);

  const day = parseDateOnly(page.date);
  const when = `${fmt(day, { weekday: "short", day: "numeric", month: "short" })}${
    page.startTime ? `, ${page.startTime}–${page.endTime ?? ""}` : ""
  }`;
  const closed = page.status === "CANCELLED" || page.status === "NO_SHOW";

  return (
    <Card data-testid="trial-page">
      <CardHeader>
        <CardTitle data-testid="trial-title">{t("hello", { name: page.leadName })}</CardTitle>
        <CardDescription>
          {t("intro", { group: page.groupName, center: page.organizationName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" data-testid="trial-when">
          <Badge variant="outline" className="mr-2">
            {t("badge")}
          </Badge>
          {when}
        </p>
        {closed ? (
          <Alert data-testid="trial-closed">{t("closed")}</Alert>
        ) : page.status === "CONVERTED" ? (
          <Alert data-testid="trial-converted">{t("converted")}</Alert>
        ) : !page.enabled ? (
          <Alert>{t("disabled")}</Alert>
        ) : !page.isToday ? (
          <Alert data-testid="trial-not-today">{t("notToday")}</Alert>
        ) : (
          <CallFlow
            role="STUDENT"
            name={page.leadName}
            ready={Boolean(page.roomId)}
            waitingText={t("waiting")}
            join={() => joinTrial(token)}
          />
        )}
        <p className="text-xs text-muted-foreground">{t("tips")}</p>
      </CardContent>
    </Card>
  );
}
