"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

import { AssistantConversation, type AssistantAudience } from "./assistant-conversation";
import { useAssistantChat } from "./assistant-store";

/** The Assistant page (A-149): the conversation of this tab, the same one the floating assistant shows. */
export function AssistantPage({
  userId,
  audience,
  mode,
  model,
  canConfigure,
}: {
  userId: string;
  audience: AssistantAudience;
  mode: "fake" | "anthropic";
  model: string;
  canConfigure: boolean;
}) {
  const t = useTranslations("assistant");
  const { turns, clear } = useAssistantChat(userId);

  return (
    <div className="space-y-4" data-testid="assistant-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="size-6 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(audience === "teacher" ? "hintTeacher" : "hint")}
          </p>
        </div>
        {turns.length > 0 && (
          <Button variant="outline" size="sm" onClick={clear} data-testid="assistant-clear">
            <RotateCcw /> {t("clear")}
          </Button>
        )}
      </div>

      {mode === "fake" ? (
        <Alert data-testid="assistant-mode" data-mode="fake">
          <span>{t("testMode")}</span>{" "}
          {canConfigure && (
            <Link href="/settings/integrations" className="underline">
              {t("settings")}
            </Link>
          )}
        </Alert>
      ) : (
        <p
          className="text-xs text-muted-foreground"
          data-testid="assistant-mode"
          data-mode="anthropic"
        >
          {t("liveMode", { model })}
        </p>
      )}

      <Card>
        <CardContent className="flex h-[60vh] min-h-[22rem] flex-col p-4">
          <AssistantConversation userId={userId} audience={audience} />
        </CardContent>
      </Card>
    </div>
  );
}
