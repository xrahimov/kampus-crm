"use client";

import { Check, ExternalLink, ListChecks, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import type {
  CheckingItemDto,
  CheckingQueueDto,
} from "@/server/services/homework/checking-queue.service";

import { AudioPlayer, isAudioUrl } from "./audio-player";

const key = (item: CheckingItemDto) => `${item.homeworkId}:${item.membershipId}`;

/**
 * The checking queue (A-160): every homework answer waiting for the teacher,
 * oldest first, worked through with the keyboard. J/K or the arrows move,
 * A accepts, R opens the return comment, Enter sends it, Escape closes it.
 */
export function CheckingPage({ initial }: { initial: CheckingQueueDto }) {
  const t = useTranslations("checking");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [selected, setSelected] = useState(0);
  const [returning, setReturning] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const current = items[Math.min(selected, items.length - 1)];

  const reload = useCallback(async () => {
    const fresh = await api<CheckingQueueDto>("/homework/queue");
    setItems(fresh.items);
    setTotal(fresh.total);
  }, []);

  const verdict = useCallback(
    async (item: CheckingItemDto, status: "ACCEPTED" | "RETURNED", text?: string) => {
      setBusy(true);
      setError(null);
      try {
        await api(`/homework/${item.homeworkId}/submissions/${item.membershipId}`, {
          method: "PATCH",
          body: { status, teacherComment: text?.trim() || null },
        });
        setItems((list) => list.filter((x) => key(x) !== key(item)));
        setTotal((n) => Math.max(0, n - 1));
        setDone((n) => n + 1);
        setReturning(null);
        setComment("");
        // The page held the oldest hundred; refill from the server once it runs low.
        if (items.length <= 1 && total > items.length) void reload();
      } catch (e) {
        const code = e instanceof ApiError ? e.message : "errors.internal";
        setError(te.has(code) ? te(code) : te("errors.internal"));
      } finally {
        setBusy(false);
      }
    },
    [items.length, reload, te, total],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "Escape" && returning) {
        event.preventDefault();
        setReturning(null);
        setComment("");
        return;
      }
      if (typing) {
        if (event.key === "Enter" && !event.shiftKey && returning && current) {
          event.preventDefault();
          void verdict(current, "RETURNED", comment);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || busy || items.length === 0) return;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          setSelected((i) => Math.min(items.length - 1, i + 1));
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          setSelected((i) => Math.max(0, i - 1));
          break;
        case "a":
        case "A":
          event.preventDefault();
          if (current) void verdict(current, "ACCEPTED");
          break;
        case "r":
        case "R":
          event.preventDefault();
          if (current) {
            setReturning(key(current));
            setComment("");
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, comment, current, items.length, returning, verdict]);

  useEffect(() => {
    if (returning) commentRef.current?.focus();
  }, [returning]);

  useEffect(() => {
    if (!current) return;
    cardRefs.current.get(key(current))?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const when = (iso: string) => fmt(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="checking-summary">
            {total === 0 ? t("none") : t("waiting", { count: total })}
            {done > 0 && ` · ${t("done", { count: done })}`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="checking-keys">
          {t("keys")}
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      {items.length === 0 ? (
        <Card data-testid="checking-empty">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ListChecks className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-3" data-testid="checking-list">
          {items.map((item, index) => {
            const active = index === Math.min(selected, items.length - 1);
            const open = returning === key(item);
            return (
              <li key={key(item)}>
                <Card
                  ref={(el) => {
                    if (el) cardRefs.current.set(key(item), el);
                    else cardRefs.current.delete(key(item));
                  }}
                  className={cn(
                    "transition-shadow",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  onClick={() => setSelected(index)}
                  data-testid="checking-item"
                  data-selected={active ? "true" : "false"}
                >
                  <CardContent className="space-y-3 p-4 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">
                        <Link
                          href={`/students/${item.studentId}`}
                          className="hover:underline"
                          data-testid="checking-student"
                        >
                          {item.fullName}
                        </Link>
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          <Link
                            href={`/groups/${item.groupId}?tab=homework`}
                            className="hover:underline"
                          >
                            {item.groupName}
                          </Link>
                          {" · "}
                          {item.lessonDate
                            ? fmt(parseDateOnly(item.lessonDate), {
                                day: "numeric",
                                month: "short",
                              })
                            : item.title}
                          {item.lessonTopic ? `, ${item.lessonTopic}` : ""}
                        </span>
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {t("sentAt", { when: when(item.submittedAt) })}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{t("task")}:</span> {item.text}
                      {item.linkUrl && (
                        <>
                          {" "}
                          <a
                            href={item.linkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 underline"
                          >
                            {t("taskLink")} <ExternalLink className="size-3" />
                          </a>
                        </>
                      )}
                    </p>
                    <div className="rounded-md bg-muted/40 p-3" data-testid="checking-answer">
                      {item.note ? (
                        <p className="whitespace-pre-wrap">{item.note}</p>
                      ) : (
                        !item.attachmentUrl && (
                          <p className="text-muted-foreground">{t("noNote")}</p>
                        )
                      )}
                      {item.attachmentUrl &&
                        (isAudioUrl(item.attachmentUrl) ? (
                          <AudioPlayer src={item.attachmentUrl} />
                        ) : (
                          <a
                            href={item.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline"
                          >
                            {t("attachment")} <ExternalLink className="size-3" />
                          </a>
                        ))}
                    </div>
                    {open ? (
                      <form
                        className="space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void verdict(item, "RETURNED", comment);
                        }}
                      >
                        <Textarea
                          ref={commentRef}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder={t("commentPlaceholder")}
                          rows={2}
                          aria-label={t("comment")}
                          data-testid="checking-comment"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            data-testid="checking-return-send"
                          >
                            <Undo2 /> {t("returnSend")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReturning(null);
                              setComment("");
                            }}
                          >
                            {te("common.cancel")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void verdict(item, "ACCEPTED")}
                          data-testid="checking-accept"
                        >
                          <Check /> {t("accept")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setSelected(index);
                            setReturning(key(item));
                            setComment("");
                          }}
                          data-testid="checking-return"
                        >
                          <Undo2 /> {t("return")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
