"use client";

import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AssistantAnswerDto } from "@/server/services/ai/assistant.service";

interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = ["debtors", "students", "payments", "today", "sms"] as const;

/** The Assistant page (A-149): a conversation kept in this tab only. */
export function AssistantPage({
  mode,
  model,
  canConfigure,
}: {
  mode: "fake" | "anthropic";
  model: string;
  canConfigure: boolean;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations();
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const dto = await api<AssistantAnswerDto>("/assistant", {
        method: "POST",
        body: { messages: next.map(({ role, content }) => ({ role, content })), locale },
      });
      setTurns([...next, { role: "assistant", content: dto.answer, tools: dto.tools }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="assistant-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="size-6 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        {turns.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTurns([])}
            data-testid="assistant-clear"
          >
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
        <CardContent className="flex min-h-[55vh] flex-col gap-3 p-4">
          <div className="flex-1 space-y-3 overflow-y-auto" data-testid="assistant-messages">
            {turns.length === 0 && (
              <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
                <p>{t("empty")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      onClick={() => ask(t(`suggestions.${s}`))}
                      data-testid="assistant-suggestion"
                    >
                      {t(`suggestions.${s}`)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                data-testid="assistant-message"
                data-role={m.role}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  {m.tools && m.tools.length > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t("usedTools", { tools: m.tools.join(", ") })}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <p className="text-sm text-muted-foreground" data-testid="assistant-thinking">
                {t("thinking")}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error.startsWith("errors.") ? te(error) : error}
            </p>
          )}
          <form
            className="flex items-end gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("placeholder")}
              rows={2}
              className="min-h-0 flex-1"
              data-testid="assistant-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(draft);
                }
              }}
            />
            <Button type="submit" disabled={busy || !draft.trim()} data-testid="assistant-send">
              <Send /> {t("send")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
