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
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import {
  BRIEFING_PERIODS,
  fetchBriefing,
  type Briefing,
  type BriefingDetail,
  type BriefingLine,
  type BriefingPeriod,
  type BriefingStat,
  type BriefingTone,
  type BriefingViewKind,
} from "@/api/office-assistant";
import { Button } from "@/components/button";
import { Press } from "@/components/motion";
import { Card, Divider, Loading, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { useOpenPath } from "@/features/office/site-paths";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useLocaleChoice, useMoney, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme, type Colors } from "@/lib/theme";

const STAT_ICON: Record<string, LucideIcon> = {
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

const TONE: Record<BriefingTone, keyof Colors> = {
  good: "success",
  warn: "warning",
  bad: "destructive",
  neutral: "foreground",
};

/** The sign each plain line opens with, as the model's own lines open with one (the site's signs). */
const RULE_SIGN: Record<string, string> = {
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
  data: Briefing | null;
  error: unknown;
}

/**
 * A person's summary (A-253; the site's A-190): the figures of a period,
 * counted by Kampus, and a conclusion in plain words. Which figures appear is
 * the server's decision from the person's role; this only draws them. The
 * figures come at once; where the centre has a key the model's conclusion
 * follows a few seconds later, and until then the plain lines stand in.
 */
export function BriefingPanel({ onShown }: { onShown?: () => void }) {
  const t = useTranslations();
  const tb = useTranslations("assistant.briefing");
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const date = useDate();
  const [period, setPeriod] = useState<BriefingPeriod>("yesterday");
  const [view, setView] = useState<BriefingViewKind | undefined>(undefined);
  // A new number asks again for the same choice: once to retry, once to have it written again.
  const [attempt, setAttempt] = useState({ n: 0, refresh: false });
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = `${view ?? "auto"}:${period}:${locale}:${attempt.n}`;
  useEffect(() => {
    let stale = false;
    const ask = (write: boolean) =>
      fetchBriefing({ ...(view ? { view } : {}), period, locale, refresh: attempt.refresh, write });
    // The figures first, at once; the model's conclusion follows when it has to be written.
    ask(attempt.refresh)
      .then((data) => {
        if (stale) return;
        setLoaded({ key, data, error: null });
        onShown?.();
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
      .catch((error: unknown) => {
        if (!stale) setLoaded({ key, data: null, error });
      });
    return () => {
      stale = true;
    };
    // `key` names every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loading = loaded?.key !== key;
  // While another period loads, the last one stays on the screen, dimmed.
  const data = loaded?.data ?? null;
  const error = loading ? null : (loaded?.error ?? null);
  const day = (iso: string) => date(dayAsDate(iso), { day: "numeric", month: "short" });

  return (
    <View style={styles.wrap} testID="briefing">
      <Segmented
        options={BRIEFING_PERIODS.map((value) => ({ value, label: tb(`periods.${value}`) }))}
        value={period}
        onChange={setPeriod}
        testID="briefing-period"
      />
      {data && data.views.length > 1 ? (
        <Segmented
          options={data.views.map((value) => ({ value, label: tb(`views.${value}`) }))}
          value={data.view}
          onChange={setView}
          testID="briefing-view"
        />
      ) : null}

      {error ? (
        <View style={styles.tight}>
          <Notice tone="destructive" testID="briefing-problem">
            {errorText(t, error)}
          </Notice>
          <Button
            compact
            variant="outline"
            label={tb("retry")}
            onPress={() => setAttempt((now) => ({ n: now.n + 1, refresh: false }))}
            style={styles.start}
            testID="briefing-retry"
          />
        </View>
      ) : null}

      {!data && !error ? <Loading /> : null}

      {data ? (
        <View style={[styles.wrap, loading ? styles.dim : null]}>
          <Text variant="small" tone="mutedForeground" testID="briefing-scope">
            {data.scope.kind === "groups"
              ? tb("scope.groups")
              : tb(`scope.${data.scope.kind}`, { name: data.scope.name })}
            {", "}
            {data.from === data.to
              ? day(data.from)
              : tb("range", { from: day(data.from), to: day(data.to) })}
          </Text>

          <View
            style={[styles.conclusion, { backgroundColor: colors.accent }]}
            testID="briefing-conclusion"
          >
            <View style={styles.head}>
              <Sparkles size={16} color={colors.accentForeground} />
              <Text variant="bodyStrong" tone="accentForeground" style={styles.fill}>
                {tb("conclusion")}
              </Text>
              {data.mode === "anthropic" && !data.pending ? (
                <Press
                  onPress={() => setAttempt((now) => ({ n: now.n + 1, refresh: true }))}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={tb("refresh")}
                  hitSlop={10}
                  sink={0.88}
                  testID="briefing-refresh"
                >
                  <RefreshCw size={16} color={colors.accentForeground} />
                </Press>
              ) : null}
            </View>
            {data.pending ? (
              <View style={styles.writing} testID="briefing-writing">
                <ActivityIndicator size="small" color={colors.accentForeground} />
                <Text variant="small" tone="accentForeground">
                  {tb("writing")}
                </Text>
              </View>
            ) : (
              data.conclusion.map((line, index) => <ConclusionLine key={index} line={line} />)
            )}
            <Text variant="small" tone="mutedForeground" testID="briefing-note">
              {data.pending
                ? tb("writingNote")
                : data.aiFailed
                  ? tb("failed")
                  : data.mode === "anthropic"
                    ? tb("byModel", { model: data.model })
                    : tb("plain")}
            </Text>
          </View>

          <Card style={styles.flush} testID="briefing-stats">
            {data.stats.map((stat, index) => (
              <View key={stat.key}>
                {index > 0 ? <Divider /> : null}
                <StatRow stat={stat} />
              </View>
            ))}
          </Card>

          {data.branches.length > 0 ? (
            <Card style={styles.flush} testID="briefing-branches">
              {data.branches.map((branch, index) => (
                <View key={branch.name}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.branch} testID={`briefing-branch-${index}`}>
                    <Text variant="bodyStrong">{branch.name}</Text>
                    <View style={styles.cells}>
                      {branch.payments !== null ? (
                        <Cell label={tb("branches.payments")} money value={branch.payments} />
                      ) : null}
                      <Cell label={tb("branches.lessons")} value={branch.lessons} />
                      <Cell label={tb("branches.absent")} value={branch.absent} />
                      <Cell
                        label={tb("branches.unmarked")}
                        value={branch.unmarked}
                        tone={branch.unmarked > 0 ? "destructive" : undefined}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ConclusionLine({ line }: { line: BriefingLine }) {
  const tr = useTranslations("assistant.briefing.rules");
  const money = useMoney();
  if ("text" in line) {
    return (
      <Text selectable tone="accentForeground" testID="briefing-line">
        {line.text}
      </Text>
    );
  }
  const { amount, ...counts } = line.values;
  return (
    <Text selectable tone="accentForeground" testID="briefing-line">
      {RULE_SIGN[line.rule] ?? ""}{" "}
      {tr(line.rule, { ...counts, ...(amount !== undefined ? { amount: money(amount) } : {}) })}
    </Text>
  );
}

/** One figure of a branch, with what it counts above it: a table's cell that reads on a phone. */
function Cell({
  label,
  value,
  money: asMoney = false,
  tone,
}: {
  label: string;
  value: number;
  money?: boolean;
  tone?: keyof Colors;
}) {
  const money = useMoney();
  return (
    <View style={styles.cell}>
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
      <Text variant="figure" tone={tone ?? "foreground"}>
        {asMoney ? money(value) : value}
      </Text>
    </View>
  );
}

function StatRow({ stat }: { stat: BriefingStat }) {
  const tb = useTranslations("assistant.briefing");
  const { colors } = useTheme();
  const money = useMoney();
  const { open } = useOpenPath();
  const Icon = STAT_ICON[stat.key] ?? Sparkles;
  const value = stat.unit === "money" ? money(stat.value) : String(stat.value);
  const label = tb.has(`stats.${stat.key}`) ? tb(`stats.${stat.key}`) : stat.key;
  const href = stat.href;
  return (
    <View style={styles.stat} testID={`briefing-stat-${stat.key}`}>
      <Pressable
        onPress={href ? () => open(href) : undefined}
        disabled={!href}
        accessibilityRole={href ? "button" : undefined}
        accessibilityLabel={`${label}: ${value}`}
        style={styles.statHead}
        testID={`briefing-stat-open-${stat.key}`}
      >
        <Icon size={18} color={colors.mutedForeground} strokeWidth={1.75} />
        <Text style={styles.fill} numberOfLines={2} tone={href ? "primary" : "foreground"}>
          {label}
        </Text>
        <Text variant="figure" tone={TONE[stat.tone]} testID={`briefing-value-${stat.key}`}>
          {value}
        </Text>
      </Pressable>
      {stat.details.length > 0 ? (
        <View style={styles.details}>
          {stat.details.map((detail, index) => (
            <DetailRow key={index} stat={stat} detail={detail} onOpen={open} />
          ))}
          {stat.more ? (
            <Text variant="small" tone="mutedForeground">
              {tb("more", { count: stat.more })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({
  stat,
  detail,
  onOpen,
}: {
  stat: BriefingStat;
  detail: BriefingDetail;
  onOpen: (path: string) => void;
}) {
  const tb = useTranslations("assistant.briefing");
  const money = useMoney();
  const label = detail.label || (stat.key === "debtors" ? tb("owedTotal") : "—");
  const value =
    detail.value === undefined
      ? null
      : detail.unit === "money"
        ? money(detail.value)
        : stat.key === "stoppedComing"
          ? tb("missed", { count: detail.value })
          : String(detail.value);
  const href = detail.href;
  return (
    <Pressable
      onPress={href ? () => onOpen(href) : undefined}
      disabled={!href}
      accessibilityRole={href ? "button" : undefined}
      style={styles.detail}
      testID="briefing-detail"
    >
      <Text variant="small" style={styles.fill} numberOfLines={2}>
        <Text variant="small" tone={href ? "primary" : "foreground"}>
          {label}
        </Text>
        {detail.note ? (
          <Text variant="small" tone="mutedForeground">
            {"  "}
            {detail.note}
          </Text>
        ) : null}
      </Text>
      {value !== null ? (
        <Text variant="small" tone="mutedForeground">
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { gap: space[4] },
  tight: { gap: space[2] },
  start: { alignSelf: "flex-start" },
  dim: { opacity: 0.5 },
  conclusion: { borderRadius: radius.lg, padding: space[4], gap: space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
  writing: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  stat: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  statHead: { flexDirection: "row", alignItems: "center", gap: space[3] },
  // Under the figure's name, clear of its icon.
  details: { paddingLeft: 18 + space[3], gap: space[1] },
  detail: { flexDirection: "row", alignItems: "baseline", gap: space[3], minHeight: 24 },
  branch: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  cells: { flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[2] },
  cell: { gap: 2 },
});
