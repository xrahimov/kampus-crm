"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { parseWordLines, VOCAB_WORDS_MAX, wordLines } from "@/lib/validation/vocab";
import type { TopicWordsDto } from "@/server/services/vocab/vocab.service";

/** The topic's word list for the vocabulary trainer, one "term — translation — example" per line (A-165). */
export function WordsPanel({ topicId }: { topicId: string }) {
  const t = useTranslations("vocab.editor");
  const te = useTranslations();
  const [data, setData] = useState<TopicWordsDto | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<TopicWordsDto>(`/topics/${topicId}/words`)
      .then((d) => {
        if (!live) return;
        setData(d);
        setText(wordLines(d.words));
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => {
      live = false;
    };
  }, [topicId]);

  const parsed = parseWordLines(text);
  const bad = parsed.filter((w) => !w.term || !w.translation).length;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api<TopicWordsDto>(`/topics/${topicId}/words`, {
        method: "PUT",
        body: { words: parsed },
      });
      setData(next);
      setText(wordLines(next.words));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  return (
    <section className="space-y-2 rounded-md border p-3" data-testid="words-panel">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <span className="text-xs text-muted-foreground" data-testid="words-count">
          {t("count", { count: data.words.length })}
        </span>
      </div>
      {data.canEdit ? (
        <>
          <Label htmlFor="words-text" className="text-xs text-muted-foreground">
            {t("hint")}
          </Label>
          <Textarea
            id="words-text"
            rows={Math.min(12, Math.max(4, parsed.length + 1))}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            placeholder={t("placeholder")}
            data-testid="words-text"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={bad > 0 ? "text-destructive" : "text-muted-foreground"}>
              {bad > 0
                ? t("badLines", { count: bad })
                : t("parsed", { count: parsed.length, max: VOCAB_WORDS_MAX })}
            </span>
            <span className="flex items-center gap-2">
              {saved && <span className="text-muted-foreground">{te("common.saved")}</span>}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || bad > 0 || parsed.length > VOCAB_WORDS_MAX}
                onClick={() => void save()}
                data-testid="words-save"
              >
                {t("save")}
              </Button>
            </span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {te.has(error) ? te(error) : te("errors.internal")}
            </p>
          )}
        </>
      ) : data.words.length > 0 ? (
        <ul className="divide-y text-sm">
          {data.words.map((w) => (
            <li key={w.id} className="flex flex-wrap gap-2 py-1">
              <span className="font-medium">{w.term}</span>
              <span className="text-muted-foreground">— {w.translation}</span>
              {w.example && (
                <span className="w-full text-xs text-muted-foreground">{w.example}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
    </section>
  );
}
