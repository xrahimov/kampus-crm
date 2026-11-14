"use client";

import {
  Banknote,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  HandCoins,
  PhoneMissed,
  RefreshCw,
  Sparkles,
  UserMinus,
  UserPlus,
  UserRoundX,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import { cn } from "@/lib/utils";
import {
  BRIEFING_PERIODS,
  type BriefingPeriod,
  type BriefingView as View,
} from "@/lib/validation/ai";
import type {
  BriefingDetail,
  BriefingDto,
  BriefingLine,
  BriefingRule,
  BriefingStat,
  BriefingStatKey,
  BriefingTone,
} from "@/server/services/ai/briefing.service";

const STAT_ICON: Record<BriefingStatKey, LucideIcon> = {
  payments: Banknote,
  todayLessons: CalendarClock,
  lessons: CalendarDays,
  absent: UserX,
  unmarked: ClipboardList,
  homeworkToCheck: GraduationCap,
  stoppedComing: UserRoundX,
  newLeads: Users,
  uncontactedLeads: PhoneMissed,
  newStudents: UserPlus,
  leftStudents: UserMinus,
  debtors: HandCoins,
};

const TONE: Record<BriefingTone, string> = {
  good: "text-success",
  warn: "kampus-ai-warn",
  bad: "text-destructive",
  neutral: "text-foreground",
};

/** The sign each plain line opens with, as the model's own lines open with one. */
const RULE_SIGN: Record<BriefingRule, string> = {
  quiet: "🌙",
  payments: "💰",
  noPayments: "💤",
  allMarked: "✅",
  unmarked: "⚠️",
  absent: "👥",
  leadsWaiting: "📞",
  studentsFlow: "🎓",
  debtors: "💳",
  homeworkWaiting: "📝",
  stoppedComing: "🚩",
  todayLessons: "📅",
  noLessonsToday: "☕",
};

interface Loaded {
  key: string;
  data: BriefingDto | null;
  error: string | null;
}

/**
 * A person's summary (A-190): the figures of a period, counted by Kampus,
 * and under them a conclusion in plain words. Which figures appear is the
 * server's decision from the person's role; this only draws them.
 */
export function BriefingView() {
  const t = useTranslations("assistant.briefing");
  const te = useTranslations();
  const locale = useLocale();
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const [period, setPeriod] = useState<BriefingPeriod>("yesterday");
  const [view, setView] = useState<View | undefined>(undefined);
  // A new number asks again for the same choice: once to retry, once to have it written again.
  const [attempt, setAttempt] = useState<{ n: number; refresh: boolean }>({ n: 0, refresh: false });
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = `${view ?? "auto"}:${period}:${locale}:${attempt.n}`;
  useEffect(() => {
    let stale = false;
    const ask = (write: boolean) =>
      api<BriefingDto>("/assistant/briefing", {
        method: "POST",
        body: { ...(view ? { view } : {}), period, locale, refresh: attempt.refresh, write },
      });
    // The figures first, at once; the model's conclusion follows when it has to be written.
    ask(attempt.refresh)
      .then((data) => {
        if (stale) return;
        setLoaded({ key, data, error: null });
        if (!data.pending) return;
        return ask(true)
          .then((full) => {
            if (!stale) setLoaded({ key, data: full, error: null });
          })
          .catch(() => {
            // The figures stay; the plain lines stand in for the conclusion.
            if (!stale) {
              setLoaded({
                key,
                data: { ...data, pending: false, aiFailed: true, mode: "fake" },
                error: null,
              });
            }
          });
      })
      .catch((e: unknown) => {
        if (stale) return;
        setLoaded({ key, data: null, error: e instanceof Error ? e.message : "errors.internal" });
      });
    return () => {
      stale = true;
    };
    // `key` names every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loading = loaded?.key !== key;
  // While another period loads, the last one stays on screen, dimmed.
  const data = loaded?.data ?? null;
  const error = !loading ? (loaded?.error ?? null) : null;

  const day = (iso: string) =>
    // Midnight UTC is five in the morning of the same day in Tashkent, the zone dates are shown in.
    fmt(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short" });

  return (
    <div className="space-y-4" data-testid="briefing" data-loading={loading ? "true" : "false"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-md border bg-muted/60 p-0.5"
          role="group"
          aria-label={t("period")}
        >
          {BRIEFING_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              data-testid={`briefing-period-${p}`}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
                period === p
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`periods.${p}`)}
            </button>
          ))}
        </div>
        {data && data.views.length > 1 && (
          <div
            className="inline-flex rounded-md border bg-muted/60 p-0.5"
            role="group"
            aria-label={t("viewLabel")}
          >
            {data.views.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={data.view === v}
                data-testid={`briefing-view-${v}`}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
                  data.view === v
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`views.${v}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm" role="alert">
          <p className="text-destructive">{error.startsWith("errors.") ? te(error) : t("error")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAttempt((a) => ({ n: a.n + 1, refresh: false }))}
          >
            {t("retry")}
          </Button>
        </div>
      )}

      {!data && !error && (
        <div className="space-y-3" aria-busy="true" aria-label={t("loading")}>
          {[72, 56, 64, 48, 60].map((w, i) => (
            <div key={i} className="flex items-center justify-between gap-6">
              <div className="kampus-ai-skeleton h-4" style={{ width: `${w}%` }} />
              <div className="kampus-ai-skeleton h-4 w-10" />
            </div>
          ))}
          <div className="kampus-ai-skeleton h-24 w-full" />
        </div>
      )}

      {data && (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-50")}>
          <p className="text-xs text-muted-foreground" data-testid="briefing-scope">
            {data.scope.kind === "groups"
              ? t("scope.groups")
              : t(`scope.${data.scope.kind}`, { name: data.scope.name })}
            {", "}
            {data.from === data.to
              ? day(data.from)
              : t("range", { from: day(data.from), to: day(data.to) })}
          </p>

          <section
            className="rounded-lg border border-accent-foreground/15 bg-accent/60 p-3.5"
            data-testid="briefing-conclusion"
            data-mode={data.mode}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-accent-foreground">
                <Sparkles className="size-4" /> {t("conclusion")}
              </h3>
              {data.mode === "anthropic" && !data.pending && (
                <button
                  type="button"
                  onClick={() => setAttempt((a) => ({ n: a.n + 1, refresh: true }))}
                  disabled={loading}
                  title={t("refresh")}
                  aria-label={t("refresh")}
                  data-testid="briefing-refresh"
                  className="rounded-md p-1 text-accent-foreground/70 transition-colors hover:bg-card/70 hover:text-accent-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                </button>
              )}
            </div>
            {data.pending ? (
              <div className="space-y-2 py-0.5" aria-busy="true" data-testid="briefing-writing">
                <p className="flex items-center gap-2 text-sm text-accent-foreground/80">
                  <span className="kampus-ai-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  {t("writing")}
                </p>
                <div className="kampus-ai-skeleton h-3.5 w-11/12 opacity-60" />
                <div className="kampus-ai-skeleton h-3.5 w-8/12 opacity-60" />
              </div>
            ) : (
              // Keyed by when it was written, so a new text arrives line by line again.
              <ul className="space-y-1.5 text-sm leading-relaxed" key={data.generatedAt}>
                {data.conclusion.map((line, i) => (
                  <li
                    key={i}
                    className="kampus-ai-line"
                    style={{ "--i": i } as React.CSSProperties}
                    data-testid="briefing-line"
                  >
                    <ConclusionLine line={line} money={money} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2.5 text-[11px] text-muted-foreground" data-testid="briefing-note">
              {data.pending
                ? t("writingNote")
                : data.aiFailed
                  ? t("failed")
                  : data.mode === "anthropic"
                    ? t("byModel", { model: data.model })
                    : t("plain")}
            </p>
          </section>

          <ul className="divide-y rounded-lg border" data-testid="briefing-stats">
            {data.stats.map((s) => (
              <StatRow key={s.key} stat={s} money={money} />
            ))}
          </ul>

          {data.branches.length > 0 && (
            <div className="overflow-x-auto rounded-lg border" data-testid="briefing-branches">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("branches.branch")}</th>
                    {data.branches[0]?.payments !== null && (
                      <th className="px-3 py-2 text-right font-medium">{t("branches.payments")}</th>
                    )}
                    <th className="px-3 py-2 text-right font-medium">{t("branches.lessons")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("branches.absent")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("branches.unmarked")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.branches.map((b) => (
                    <tr key={b.name}>
                      <td className="px-3 py-2 font-medium">{b.name}</td>
                      {b.payments !== null && (
                        <td className="px-3 py-2 text-right tabular-nums">{money(b.payments)}</td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums">{b.lessons}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.absent}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          b.unmarked > 0 && "font-medium text-destructive",
                        )}
                      >
                        {b.unmarked}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConclusionLine({ line, money }: { line: BriefingLine; money: (n: number) => string }) {
  const t = useTranslations("assistant.briefing.rules");
  if ("text" in line) return <>{line.text}</>;
  const { amount, ...counts } = line.values;
  return (
    <>
      {RULE_SIGN[line.rule]}{" "}
      {t(line.rule, { ...counts, ...(amount !== undefined ? { amount: money(amount) } : {}) })}
    </>
  );
}

function StatRow({ stat, money }: { stat: BriefingStat; money: (n: number) => string }) {
  const t = useTranslations("assistant.briefing");
  const Icon = STAT_ICON[stat.key];
  const value = stat.unit === "money" ? money(stat.value) : String(stat.value);
  const label = t(`stats.${stat.key}`);
  return (
    <li className="px-3 py-2" data-testid={`briefing-stat-${stat.key}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Icon className="size-4 shrink-0 self-center text-muted-foreground" strokeWidth={1.75} />
          {stat.href ? (
            <Link href={stat.href} className="truncate underline-offset-4 hover:underline">
              {label}
            </Link>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </span>
        <span
          className={cn("shrink-0 text-sm font-semibold tabular-nums", TONE[stat.tone])}
          data-testid="briefing-value"
        >
          {value}
        </span>
      </div>
      {stat.details.length > 0 && (
        <ul className="mt-1.5 space-y-1 pl-6 text-xs text-muted-foreground">
          {stat.details.map((d, i) => (
            <DetailRow key={i} stat={stat} detail={d} money={money} />
          ))}
          {stat.more ? <li>{t("more", { count: stat.more })}</li> : null}
        </ul>
      )}
    </li>
  );
}

function DetailRow({
  stat,
  detail,
  money,
}: {
  stat: BriefingStat;
  detail: BriefingDetail;
  money: (n: number) => string;
}) {
  const t = useTranslations("assistant.briefing");
  const label = detail.label || (stat.key === "debtors" ? t("owedTotal") : "—");
  const value =
    detail.value === undefined
      ? null
      : detail.unit === "money"
        ? money(detail.value)
        : stat.key === "stoppedComing"
          ? t("missed", { count: detail.value })
          : String(detail.value);
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">
        {detail.href ? (
          <Link
            href={detail.href}
            className="text-foreground/80 underline-offset-4 hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span className="text-foreground/80">{label}</span>
        )}
        {detail.note ? <span className="ml-1.5">{detail.note}</span> : null}
      </span>
      {value !== null && <span className="shrink-0 tabular-nums">{value}</span>}
    </li>
  );
}
