import { MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Sign-in for students and parents (A-150): Telegram proves who they are and
 * their phone; the centre must already have that phone on a student or parent.
 */
export function StudentLogin({
  brand,
  available,
  startUrl,
  botUrl,
  error,
}: {
  brand: { name: string; logoUrl: string | null } | null;
  available: boolean;
  startUrl: string;
  botUrl: string | null;
  error: string | null;
}) {
  const t = useTranslations("studentApp.login");
  const te = useTranslations("errors");
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
        {error && (
          <Alert variant="destructive" data-testid="student-login-error">
            {te(error)}
          </Alert>
        )}
        {available ? (
          <>
            <Button asChild className="w-full" size="lg">
              <a href={startUrl} data-testid="student-login-telegram">
                <Send /> {t("withTelegram")}
              </a>
            </Button>
            {botUrl && (
              <Button asChild variant="outline" className="w-full">
                <a href={botUrl} target="_blank" rel="noreferrer" data-testid="student-login-bot">
                  <MessageCircle /> {t("withBot")}
                </a>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("privacy")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="student-login-off">
            {t("off")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
