"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";

import { SignInPanel, type SignInBot } from "@/features/auth/sign-in-panel";

/**
 * The staff sign-in page's form (A-196): phone and password, or a code from
 * the Telegram bot. Students and parents who come here are signed in to their
 * own side too.
 */
export function LoginForm({
  code = false,
  bot = { username: null, url: null },
  widget = false,
}: {
  /** A bot can send sign-in codes on this address. */
  code?: boolean;
  bot?: SignInBot;
  /** The older sign-in on Telegram's own page is set up here (A-180). */
  widget?: boolean;
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const params = new URLSearchParams({ locale });
  const next = searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) params.set("next", next);
  return (
    <SignInPanel
      door="STAFF"
      code={code}
      bot={bot}
      widgetUrl={widget ? `/api/v1/auth/telegram/start?${params.toString()}` : null}
      returnedError={searchParams.get("error")}
    />
  );
}
