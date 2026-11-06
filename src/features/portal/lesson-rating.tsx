"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiErrorBody } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PortalLessonDto } from "@/server/services/portal/portal.service";

/**
 * The student's 1-5 rating of a past lesson with an optional line (A-168).
 * A tap on a star saves at once; the line opens after the first rating.
 */
export function LessonRatingCell({ token, lesson }: { token: string; lesson: PortalLessonDto }) {
  const t = useTranslations("portal.lessons");
  const te = useTranslations();
  const [rating, setRating] = useState(lesson.rating);
  const [comment, setComment] = useState(lesson.rating?.comment ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(stars: number, line: string | null, closeAfter = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/public/class/${encodeURIComponent(token)}/lessons/${lesson.id}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ rating: stars, comment: line }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(payload?.error?.message ?? "errors.internal");
        return;
      }
      const saved = (await response.json()) as { rating: number; comment: string | null };
      setRating(saved);
      if (closeAfter) setOpen(false);
    } catch {
      setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  if (!lesson.canRate && !rating) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="inline-flex flex-col items-end gap-1" data-testid="portal-rating">
      <div className="flex" role="radiogroup" aria-label={t("yourRating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating?.rating === n}
            aria-label={t("stars", { count: n })}
            disabled={busy || !lesson.canRate}
            onClick={() => {
              void save(n, comment.trim() || null);
              if (!rating) setOpen(true);
            }}
            className="rounded p-0.5 disabled:cursor-default"
            data-testid={`portal-rate-${n}`}
          >
            <Star
              className={cn(
                "size-4",
                rating && n <= rating.rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/50",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {rating && lesson.canRate && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="portal-rate-comment-open"
        >
          {rating.comment ? t("changeComment") : t("addComment")}
        </button>
      )}
      {rating?.comment && !open && (
        <p
          className="max-w-48 text-xs text-muted-foreground"
          data-testid="portal-rate-comment-text"
        >
          {rating.comment}
        </p>
      )}
      {open && rating && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save(rating.rating, comment.trim() || null, true);
          }}
        >
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder={t("commentPlaceholder")}
            className="h-8 w-44 text-xs"
            data-testid="portal-rate-comment"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="portal-rate-send"
          >
            {t("send")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {te.has(error) ? te(error) : te("errors.internal")}
        </p>
      )}
    </div>
  );
}
