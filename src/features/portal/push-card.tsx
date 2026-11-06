"use client";

import { Bell, BellOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/*
 * "Notifications on this device" on the student's page (A-176): asks the
 * browser for permission, subscribes through the student app's service worker
 * and tells the server where to push. Hidden where the browser cannot do it.
 */

type State = "checking" | "unsupported" | "off" | "on" | "denied" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushCard({ token }: { token: string }) {
  const t = useTranslations("portal.push");
  const locale = useLocale();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const api = `/api/v1/public/class/${encodeURIComponent(token)}/push`;

  useEffect(() => {
    if (!supported()) {
      // Decided outside render on purpose: the server does not know the browser.
      Promise.resolve().then(() => setState("unsupported"));
      return;
    }
    let cancelled = false;
    (async () => {
      if (Notification.permission === "denied") return "denied" as State;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return "off" as State;
      const response = await fetch(`${api}?endpoint=${encodeURIComponent(subscription.endpoint)}`);
      const known = response.ok && ((await response.json()) as { subscribed: boolean }).subscribed;
      return (known ? "on" : "off") as State;
    })()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/v1/push/key")).json()) as {
        publicKey: string;
      };
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = subscription.toJSON();
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: json.keys,
          locale,
          path: window.location.pathname,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("on");
    } catch {
      setError(t("failed"));
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(api, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  if (state === "checking" || state === "unsupported") return null;
  return (
    <Card data-testid="portal-push" data-state={state}>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        {state === "on" ? (
          <>
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Bell className="size-4" aria-hidden /> {t("on")}
            </span>
            <Button variant="outline" size="sm" onClick={disable} data-testid="portal-push-disable">
              <BellOff /> {t("disable")}
            </Button>
          </>
        ) : state === "denied" ? (
          <span className="text-muted-foreground" data-testid="portal-push-denied">
            {t("denied")}
          </span>
        ) : (
          <Button
            size="sm"
            onClick={enable}
            disabled={state === "busy"}
            data-testid="portal-push-enable"
          >
            <Bell /> {t("enable")}
          </Button>
        )}
        {error && <span className="text-destructive">{error}</span>}
      </CardContent>
    </Card>
  );
}
