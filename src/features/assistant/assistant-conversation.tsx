"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useAssistantChat } from "./assistant-store";

/** Who is asking decides the questions offered first: the office's or a teacher's. */
export type AssistantAudience = "office" | "teacher";

const SUGGESTIONS: Record<AssistantAudience, readonly string[]> = {
  office: ["debtors", "students", "payments", "today", "sms"],
  teacher: ["myDay", "checking", "absentees", "lessonPlan", "parentMessage"],
};

/**
 * The conversation itself: the turns, the box to type in and, while it is
 * empty, a few questions to start from. The Assistant page and the floating
 * assistant both show it over the same conversation.
 */
export function AssistantConversation({
  userId,
  audience,
  page,
  testId = "assistant",
  className,
}: {
  userId: string;
  audience: AssistantAudience;
  /** The page the question is asked from, for the floating assistant. */
  page?: string;
  /** Prefix of the test ids, so the page and the bubble can be told apart. */
  testId?: string;
  className?: string;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations();
  const locale = useLocale();
  const { turns, busy, error, send } = useAssistantChat(userId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, busy]);

  function ask(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    void send(text, locale, page);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" data-testid={`${testId}-messages`}>
        {turns.length === 0 && (
          <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
            <p>{t("empty")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS[audience].map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
                  onClick={() => ask(t(`suggestions.${s}`))}
                  data-testid={`${testId}-suggestion`}
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
            data-testid={`${testId}-message`}
            data-role={m.role}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <p className="break-words whitespace-pre-wrap">{m.content}</p>
              {m.tools && m.tools.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("usedTools", { tools: m.tools.join(", ") })}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid={`${testId}-thinking`}
          >
            <span className="kampus-ai-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
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
          ask(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          rows={2}
          className="min-h-0 flex-1"
          data-testid={`${testId}-input`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
        />
        <Button type="submit" disabled={busy || !draft.trim()} data-testid={`${testId}-send`}>
          <Send /> {t("send")}
        </Button>
      </form>
    </div>
  );
}
