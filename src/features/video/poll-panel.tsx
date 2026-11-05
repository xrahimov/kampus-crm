"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
} from "@/lib/validation/video";
import { cn } from "@/lib/utils";

import type { CallEngine } from "./call-engine";

/**
 * Polls inside the call (A-153): the teacher writes a question and answers and
 * sees results come in; students tap an answer; once closed everyone sees the
 * result.
 */
export function PollPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.poll");
  const poll = engine.poll;
  const isHost = engine.self.role === "HOST";
  const isStudent = engine.self.role === "STUDENT";
  const [composing, setComposing] = useState(false);

  if (isHost && (composing || !poll)) {
    return (
      <PollForm
        onOpen={(question, options) => {
          engine.openPoll(question, options);
          setComposing(false);
        }}
        onCancel={poll ? () => setComposing(false) : undefined}
      />
    );
  }
  if (!poll) {
    return <p className="py-6 text-center text-xs opacity-70">{t("none")}</p>;
  }

  const showCounts = poll.counts !== null;
  const max = Math.max(1, ...(poll.counts ?? [0]));
  return (
    <div className="space-y-3 text-sm" data-testid="poll">
      <div>
        <p className="text-xs opacity-70">{poll.open ? t("open") : t("closed")}</p>
        <p className="font-medium text-white" data-testid="poll-question">
          {poll.question}
        </p>
      </div>
      <ul className="space-y-1.5">
        {poll.options.map((option, i) => {
          const count = poll.counts?.[i] ?? 0;
          const mine = poll.myVote === i;
          const voters = poll.voters?.filter((v) => v.option === i).map((v) => v.name) ?? [];
          const body = (
            <>
              {showCounts && (
                <span
                  className="absolute inset-y-0 left-0 rounded-md bg-sidebar-active/35"
                  style={{ width: `${(count / max) * 100}%` }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {mine && <Check className="size-3.5 shrink-0" aria-label={t("yourAnswer")} />}
                  <span className="break-words">{option}</span>
                </span>
                {showCounts && <span className="shrink-0 tabular-nums">{count}</span>}
              </span>
            </>
          );
          return (
            <li key={i} title={voters.length > 0 ? voters.join(", ") : undefined}>
              {isStudent && poll.open ? (
                <button
                  type="button"
                  onClick={() => engine.votePoll(i)}
                  aria-pressed={mine}
                  data-testid="poll-option"
                  className={cn(
                    "relative w-full rounded-md border border-sidebar px-2.5 py-2 text-left hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-sidebar-active",
                    mine && "border-sidebar-active bg-sidebar text-white",
                  )}
                >
                  {body}
                </button>
              ) : (
                <div
                  className={cn(
                    "relative rounded-md border border-sidebar px-2.5 py-2",
                    mine && "border-sidebar-active text-white",
                  )}
                  data-testid="poll-result"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs opacity-70" data-testid="poll-total">
        {isStudent && poll.open
          ? poll.myVote === null
            ? t("tapToAnswer")
            : t("canChange")
          : t("answers", { count: poll.total })}
      </p>
      {isHost && (
        <div className="flex flex-wrap gap-2">
          {poll.open ? (
            <button
              type="button"
              onClick={() => engine.closePoll()}
              disabled={engine.pollPending}
              data-testid="poll-close"
              className="rounded-md bg-sidebar-active px-3 py-1.5 text-sm text-white hover:bg-sidebar-active/80 disabled:opacity-50"
            >
              {t("close")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid="poll-new"
            className="rounded-md border border-sidebar px-3 py-1.5 text-sm hover:bg-sidebar"
          >
            {t("new")}
          </button>
        </div>
      )}
    </div>
  );
}

function PollForm({
  onOpen,
  onCancel,
}: {
  onOpen: (question: string, options: string[]) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("video.poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= POLL_MIN_OPTIONS;
  const field =
    "w-full rounded-md border border-sidebar bg-sidebar px-2.5 py-1.5 text-sm text-white placeholder:text-sidebar-foreground/60 focus-visible:outline-2 focus-visible:outline-sidebar-active";

  return (
    <form
      className="space-y-2 text-sm"
      data-testid="poll-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onOpen(question.trim(), filled);
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs opacity-70">{t("question")}</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={POLL_QUESTION_MAX}
          rows={2}
          className={cn(field, "resize-none")}
          data-testid="poll-question-input"
        />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs opacity-70">{t("options")}</legend>
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={option}
              onChange={(e) =>
                setOptions((cur) => cur.map((o, j) => (j === i ? e.target.value : o)))
              }
              maxLength={POLL_OPTION_MAX}
              aria-label={t("option", { number: i + 1 })}
              placeholder={t("option", { number: i + 1 })}
              className={field}
              data-testid="poll-option-input"
            />
            {options.length > POLL_MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))}
                aria-label={t("removeOption", { number: i + 1 })}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-sidebar"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {options.length < POLL_MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setOptions((cur) => [...cur, ""])}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-sidebar"
            data-testid="poll-add-option"
          >
            <Plus className="size-3.5" /> {t("addOption")}
          </button>
        )}
      </fieldset>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!ready}
          data-testid="poll-open"
          className="rounded-md bg-sidebar-active px-3 py-1.5 text-sm text-white hover:bg-sidebar-active/80 disabled:opacity-40"
        >
          {t("ask")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-sidebar px-3 py-1.5 text-sm hover:bg-sidebar"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
