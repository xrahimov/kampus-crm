"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import type { ChatMessageDto, GroupChatDto } from "@/server/services/chat/group-chat.service";

/** How often an open chat asks for new messages. */
export const CHAT_POLL_MS = 10_000;

/**
 * The group chat (A-170) as a thread of bubbles with a send box, shared by the
 * group page and the student's page. `load` fetches messages newer than the
 * last one shown (or everything when `after` is null), `send` posts one, and
 * `markRead` is called once the thread is on screen and whenever new messages
 * arrive while it is open.
 */
export function ChatThread({
  initial,
  load,
  send,
  markRead,
  canWrite,
  readOnlyHint,
  emptyText,
  placeholder,
  sendLabel,
  sendingLabel,
  viaTelegramLabel,
  youLabel,
  testId,
}: {
  initial: GroupChatDto;
  load: (after: string | null) => Promise<GroupChatDto>;
  send: (text: string) => Promise<ChatMessageDto>;
  markRead: () => Promise<void>;
  canWrite: boolean;
  readOnlyHint?: string;
  emptyText: string;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  viaTelegramLabel: string;
  youLabel: string;
  testId: string;
}) {
  const te = useTranslations();
  const fmt = useDateFormat();
  const [messages, setMessages] = useState(initial.messages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = messages.length > 0 ? messages[messages.length - 1]!.id : null;

  const append = useCallback((rows: ChatMessageDto[]) => {
    if (rows.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = rows.filter((m) => !seen.has(m.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, []);

  // Opening the thread reads it; new messages while it is open are read as they come.
  useEffect(() => {
    void markRead().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      load(lastId)
        .then((next) => {
          if (next.messages.length > 0) {
            append(next.messages);
            void markRead().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [lastId, load, append, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const created = await send(text);
      append([created]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="space-y-3" data-testid={testId}>
      <div
        className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3"
        data-testid={`${testId}-messages`}
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.mine ? "justify-end" : "justify-start")}
              data-testid={`${testId}-message`}
              data-mine={m.mine ? "true" : "false"}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  m.mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : m.author.kind === "STAFF"
                      ? "rounded-bl-sm border bg-card"
                      : "rounded-bl-sm bg-background",
                )}
              >
                <div
                  className={cn(
                    "mb-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px]",
                    m.mine ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  <span className="font-medium">{m.mine ? youLabel : m.author.name}</span>
                  <span>{fmt(new Date(m.at), { dateStyle: "medium", timeStyle: "short" })}</span>
                  {m.source === "TELEGRAM" && <span>{viaTelegramLabel}</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {canWrite ? (
        <form onSubmit={submit} className="space-y-2" noValidate>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={2}
            maxLength={2000}
            aria-label={placeholder}
            data-testid={`${testId}-input`}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {te.has(error) ? te(error) : te("errors.internal")}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !draft.trim()}
              data-testid={`${testId}-send`}
            >
              <Send /> {busy ? sendingLabel : sendLabel}
            </Button>
          </div>
        </form>
      ) : (
        readOnlyHint && <p className="text-sm text-muted-foreground">{readOnlyHint}</p>
      )}
    </div>
  );
}
