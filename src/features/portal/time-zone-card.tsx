"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_TIME_ZONE } from "@/lib/dates";
import { listTimeZones, timeZoneLabel } from "@/lib/time-zones";

/*
 * "Your time zone" on the student's page (A-177). A student abroad picks the
 * zone they live in, or takes the one their device reports; lesson times on
 * the page and in reminders then follow it. Empty returns to the centre's time.
 */
export function TimeZoneCard({ token, timeZone }: { token: string; timeZone: string | null }) {
  const t = useTranslations("portal.timeZone");
  const router = useRouter();
  const [value, setValue] = useState(timeZone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const device =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const deviceDiffers = device && device !== (timeZone ?? APP_TIME_ZONE);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}/time-zone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: next.trim() || null }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setValue(next.trim());
      router.refresh();
    } catch {
      setError(t("invalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="portal-time-zone">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4" aria-hidden /> {t("title")}
        </CardTitle>
        <CardDescription>
          {timeZone
            ? t("current", { zone: timeZoneLabel(timeZone), centre: timeZoneLabel(APP_TIME_ZONE) })
            : t("centre", { centre: timeZoneLabel(APP_TIME_ZONE) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(value);
          }}
        >
          <Input
            list="portal-time-zone-list"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={APP_TIME_ZONE}
            className="w-64"
            aria-label={t("title")}
            data-testid="portal-time-zone-input"
          />
          <datalist id="portal-time-zone-list">
            {listTimeZones().map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <Button type="submit" size="sm" disabled={busy} data-testid="portal-time-zone-save">
            {t("save")}
          </Button>
          {deviceDiffers && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void save(device)}
              data-testid="portal-time-zone-device"
            >
              {t("useDevice", { zone: device })}
            </Button>
          )}
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
