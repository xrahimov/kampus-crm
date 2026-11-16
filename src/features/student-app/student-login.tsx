import { Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInPanel, type SignInBot } from "@/features/auth/sign-in-panel";

/**
 * Sign-in for students and parents (A-150, A-196): phone and password, or a
 * code from the Telegram bot the first time. The centre must already have the
 * phone on a student or parent; anyone else lands on the waiting list.
 */
export function StudentLogin({
  brand,
  code,
  bot,
  startUrl,
  error,
  forLesson = false,
}: {
  brand: { name: string; logoUrl: string | null } | null;
  /** A bot can send sign-in codes on this address. */
  code: boolean;
  bot: SignInBot;
  /** The older sign-in on Telegram's own page, where it is set up; null otherwise. */
  startUrl: string | null;
  error: string | null;
  /** The visitor came from a teacher's lesson link (A-195) and joins the lesson after signing in. */
  forLesson?: boolean;
}) {
  const t = useTranslations("studentApp.login");
  return (
    <Card data-testid="student-login">
      <CardHeader className="space-y-2 text-center">
        {brand?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="mx-auto h-12 w-auto" />
        )}
        <CardTitle>{brand ? t("titleAt", { centre: brand.name }) : t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {forLesson && !error && (
          // Every way in on this page (password, code, Telegram's page) goes on to the lesson.
          <Alert className="flex items-start gap-2" data-testid="student-login-lesson">
            <Video className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{t("forLesson")}</span>
          </Alert>
        )}
        <SignInPanel
          door="STUDENT"
          code={code}
          bot={bot}
          widgetUrl={startUrl}
          widgetTestId="student-login-telegram"
          returnedError={error}
          returnedErrorTestId="student-login-error"
        />
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      </CardContent>
    </Card>
  );
}
