"use client";

import { Check, Flame, RotateCcw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ApiErrorBody } from "@/lib/api-client";
import type { PortalVocabCardDto, PortalVocabDto } from "@/server/services/vocab/vocab.service";

/**
 * Flashcards on the student's Course tab (A-165): the figures, then a run
 * through the cards due (term → flip → "I knew it" / "Again").
 */
export function PortalVocabCard({ token, initial }: { token: string; initial: PortalVocabDto }) {
  const t = useTranslations("portal.vocab");
  const te = useTranslations();
  const [data, setData] = useState(initial);
  const [queue, setQueue] = useState<PortalVocabCardDto[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.total === 0) return null;
  const current = queue?.[0] ?? null;

  function start() {
    setQueue(data.cards);
    setDone(0);
    setFlipped(false);
    setError(null);
  }

  async function answer(known: boolean) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/public/class/${encodeURIComponent(token)}/vocab/${current.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ known }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(payload?.error?.message ?? "errors.internal");
        return;
      }
      setData((await response.json()) as PortalVocabDto);
      // A missed word comes round again at the end of this run.
      setQueue((q) => (q ? (known ? q.slice(1) : [...q.slice(1), q[0]!]) : q));
      if (known) setDone((n) => n + 1);
      setFlipped(false);
    } catch {
      setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="portal-vocab">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{t("title")}</span>
          <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span data-testid="vocab-learned">
              {t("learned", { learned: data.learned, total: data.total })}
            </span>
            <span data-testid="vocab-due">{t("due", { count: data.due })}</span>
            <span className="inline-flex items-center gap-1" data-testid="vocab-streak">
              <Flame className="size-3.5" aria-hidden /> {t("streak", { count: data.streak })}
            </span>
          </span>
        </div>

        {queue === null ? (
          data.due > 0 ? (
            <Button size="sm" onClick={start} data-testid="vocab-start">
              <Sparkles /> {t("start", { count: Math.min(data.due, data.cards.length) })}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="vocab-nothing-due">
              {t("nothingDue")}
            </p>
          )
        ) : current ? (
          <div className="space-y-3" data-testid="vocab-run">
            <p className="text-xs text-muted-foreground">
              {t("progress", { done, total: done + queue.length })} · {current.topicTitle}
            </p>
            <button
              type="button"
              className="w-full rounded-lg border bg-muted/30 px-4 py-6 text-center"
              onClick={() => setFlipped(true)}
              data-testid="vocab-flip"
            >
              <div className="text-lg font-semibold" data-testid="vocab-term">
                {current.term}
              </div>
              {flipped ? (
                <div className="mt-2 space-y-1" data-testid="vocab-translation">
                  <div>{current.translation}</div>
                  {current.example && (
                    <div className="text-xs text-muted-foreground">{current.example}</div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">{t("tapToFlip")}</div>
              )}
            </button>
            {flipped && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void answer(false)}
                  data-testid="vocab-again"
                >
                  <RotateCcw /> {t("again")}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void answer(true)}
                  data-testid="vocab-known"
                >
                  <Check /> {t("known")}
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {te.has(error) ? te(error) : te("errors.internal")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2" data-testid="vocab-done">
            <p className="font-medium">{t("finished", { count: done })}</p>
            {data.due > 0 ? (
              <Button size="sm" variant="outline" onClick={start} data-testid="vocab-start">
                {t("start", { count: Math.min(data.due, data.cards.length) })}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("nothingDue")}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
