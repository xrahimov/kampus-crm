import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { CalendarClock, CalendarPlus, CalendarX2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import {
  bookLesson,
  cancelLesson,
  moveLesson,
  ownKeys,
  rebookLesson,
  useClassPage,
  usePortalSchedule,
} from "@/api/portal-own";
import type { LessonTime, PortalSchedule, WeeklyTime } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Divider, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { addDays, dayAsDate, weekdayAsDate } from "@/lib/days";
import { APP_TIME_ZONE, errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { WordChip } from "./answer-parts";
import { TimeZoneCard } from "./time-zone-card";

/** Days offered when the student names a time themselves. */
const OWN_DAYS = 21;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Today in the centre's calendar (Tashkent, UTC+5). */
const centreToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

/**
 * "Tue, Nov 24": a weekday with its day. The two are formatted apart because
 * Uzbek dates are spelled by Kampus itself, one piece at a time.
 */
function useDay(): (iso: string) => string {
  const formatDate = useDate();
  return (iso) => {
    const date = dayAsDate(iso);
    return `${formatDate(date, { weekday: "short" })}, ${formatDate(date, { day: "numeric", month: "short" })}`;
  };
}

type Upcoming = PortalSchedule["upcoming"][number];
type Picking =
  | { kind: "book"; length: number }
  | { kind: "move"; lesson: Upcoming }
  | { kind: "rebook"; dayOffId: string; length: number };

/**
 * The group's times on the student's side, in the app (A-216): the weekly
 * times, the next lessons, and for a one-to-one student what the centre lets
 * them arrange: move or cancel a lesson inside the window, pick a new time for
 * a lesson that was taken off, and book an extra one. The student's time zone
 * sits at the end, because it changes the times shown here.
 */
export function ScheduleScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const { wide } = useLayout();
  const formatDate = useDate();
  const day = useDay();
  const portal = usePortal(token);
  const page = useClassPage(token);
  const query = usePortalSchedule(token);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = (
    <Header back title={t("portal.tabs.schedule")} subtitle={portal.data?.portal.group.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const data = query.data;
  const weekly = page.data ? (page.data.localSchedule ?? page.data.schedule) : [];
  const usual = weekly[0] ? minutes(weekly[0].endTime) - minutes(weekly[0].startTime) : 60;

  /** Every change answers with the schedule as it now stands. */
  const run = (work: Promise<PortalSchedule>) => {
    setBusy(true);
    setProblem(null);
    work
      .then((next) => {
        client.setQueryData(ownKeys.schedule(token), next);
        setPicking(null);
        setAsking(null);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };
  const pick = (at: LessonTime) => {
    if (!picking) return;
    run(
      picking.kind === "move"
        ? moveLesson(token, picking.lesson.id, at)
        : picking.kind === "rebook"
          ? rebookLesson(token, picking.dayOffId, at)
          : bookLesson(token, at),
    );
  };
  const start = (next: Picking) => {
    // A change is on its way: its answer would close what opens now.
    if (busy) return;
    setProblem(null);
    setAsking(null);
    setPicking(next);
  };
  const refresh = () => {
    void query.refetch();
    void page.refetch();
    void portal.refetch();
  };

  const times = (
    <Card testID="weekly">
      <Text variant="heading">{t("mobile.schedule.weekly")}</Text>
      {weekly.length === 0 ? (
        <Text tone="mutedForeground">{t("portal.schedule.empty")}</Text>
      ) : (
        weekly.map((slot: WeeklyTime) => (
          <View key={slot.weekday} style={styles.line} testID={`weekly-${slot.weekday}`}>
            <Text style={styles.fill}>
              {formatDate(weekdayAsDate(slot.weekday), { weekday: "long" })}
            </Text>
            <Text variant="figure">
              {slot.startTime}–{slot.endTime}
            </Text>
          </View>
        ))
      )}
      {portal.data ? (
        <Text variant="small" tone="mutedForeground">
          {t("portal.schedule.until", {
            date: formatDate(dayAsDate(portal.data.portal.group.endDate), {
              day: "numeric",
              month: "short",
            }),
          })}
          {page.data?.timeZone
            ? ` ${t("portal.schedule.inZone", { zone: page.data.timeZone })}`
            : ""}
        </Text>
      ) : null}
    </Card>
  );

  const waiting =
    data.cancelled.length > 0 ? (
      <Card testID="cancelled">
        <Heading Icon={CalendarX2} text={t("portal.schedule.cancelledTitle")} warning />
        {data.cancelled.map((lesson, index) => (
          <View key={lesson.dayOffId} style={styles.rows}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.line} testID={`cancelled-${lesson.dayOffId}`}>
              <View style={styles.fill}>
                <Text>
                  {day(lesson.date)}
                  {lesson.startTime ? `, ${lesson.startTime}` : ""}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {lesson.reason.startsWith("@student.")
                    ? t(`portal.schedule.reasons.${lesson.reason.slice("@student.".length)}`)
                    : lesson.reason}
                </Text>
              </View>
              <Button
                compact
                variant="outline"
                label={t("portal.schedule.pickTime")}
                disabled={busy}
                onPress={() =>
                  start({
                    kind: "rebook",
                    dayOffId: lesson.dayOffId,
                    length:
                      lesson.startTime && lesson.endTime
                        ? minutes(lesson.endTime) - minutes(lesson.startTime)
                        : usual,
                  })
                }
                testID={`rebook-${lesson.dayOffId}`}
              />
            </View>
          </View>
        ))}
      </Card>
    ) : null;

  const left = Math.max(0, data.rules.bookingLimit - data.rules.bookedAhead);
  const booking = data.rules.enabled ? (
    <Card testID="booking">
      <Heading Icon={CalendarPlus} text={t("portal.schedule.bookTitle")} />
      <Text variant="small" tone="mutedForeground" testID="booking-left">
        {t("portal.schedule.bookHint", { left })}
      </Text>
      {left > 0 && picking?.kind !== "book" ? (
        <Button
          variant="outline"
          label={t("portal.schedule.book")}
          disabled={busy}
          onPress={() => start({ kind: "book", length: usual })}
          style={styles.start}
          testID="book"
        />
      ) : null}
    </Card>
  ) : null;

  const upcoming =
    data.upcoming.length > 0 ? (
      <Card testID="upcoming">
        <Heading Icon={CalendarClock} text={t("portal.schedule.upcomingTitle")} />
        {data.rules.enabled ? (
          <Text variant="small" tone="mutedForeground" testID="rule">
            {t("portal.schedule.rule", { hours: data.rules.hours })}
          </Text>
        ) : null}
        {page.data?.timeZone ? (
          // The weekly times follow the student's zone; single lessons are the centre's.
          <Text variant="small" tone="mutedForeground" testID="centre-times">
            {t("mobile.schedule.centreTimes", { centre: APP_TIME_ZONE })}
          </Text>
        ) : null}
        {data.upcoming.map((lesson, index) => (
          <View key={lesson.id} style={styles.rows}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.lesson} testID={`upcoming-${lesson.id}`}>
              <View style={styles.line}>
                <Text style={styles.fill}>{day(lesson.date)}</Text>
                <Text variant="figure">
                  {lesson.startTime}–{lesson.endTime}
                </Text>
              </View>
              {lesson.topic ? (
                <Text variant="small" tone="mutedForeground">
                  {lesson.topic}
                </Text>
              ) : null}
              {!data.rules.enabled ? null : !lesson.canChange ? (
                <Text variant="small" tone="mutedForeground" testID={`too-late-${lesson.id}`}>
                  {t("portal.schedule.tooLate", {
                    deadline: formatDate(new Date(lesson.deadline), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </Text>
              ) : asking === lesson.id ? (
                // Cancelling takes a second press: the teacher is told at once.
                <View style={styles.ask} testID={`cancel-ask-${lesson.id}`}>
                  <Text variant="small" style={styles.fill}>
                    {t("mobile.schedule.cancelAsk", { date: day(lesson.date) })}
                  </Text>
                  <View style={styles.buttons}>
                    <Button
                      compact
                      variant="destructive"
                      label={t("mobile.schedule.cancelYes")}
                      loading={busy}
                      onPress={() => run(cancelLesson(token, lesson.id))}
                      testID={`cancel-yes-${lesson.id}`}
                    />
                    <Button
                      compact
                      variant="ghost"
                      label={t("mobile.schedule.keep")}
                      disabled={busy}
                      onPress={() => setAsking(null)}
                      testID={`cancel-no-${lesson.id}`}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.buttons}>
                  <Button
                    compact
                    variant="outline"
                    label={t("portal.schedule.move")}
                    disabled={busy}
                    onPress={() => start({ kind: "move", lesson })}
                    testID={`move-${lesson.id}`}
                  />
                  <Button
                    compact
                    variant="ghost"
                    label={t("portal.schedule.cancel")}
                    disabled={busy}
                    onPress={() => {
                      setProblem(null);
                      setPicking(null);
                      setAsking(lesson.id);
                    }}
                    testID={`cancel-${lesson.id}`}
                  />
                </View>
              )}
            </View>
          </View>
        ))}
      </Card>
    ) : null;

  const picker = picking ? (
    <PickTime
      key={picking.kind === "move" ? picking.lesson.id : picking.kind}
      title={
        picking.kind === "move"
          ? `${t("portal.schedule.pickTitle")}: ${day(picking.lesson.date)}, ${picking.lesson.startTime}`
          : picking.kind === "book"
            ? t("portal.schedule.bookTitle")
            : t("portal.schedule.pickTitle")
      }
      length={
        picking.kind === "move"
          ? minutes(picking.lesson.endTime) - minutes(picking.lesson.startTime)
          : picking.length
      }
      rules={data.rules}
      slots={data.hasAvailability ? data.slots : null}
      busy={busy}
      problem={problem}
      onPick={pick}
      onCancel={() => {
        setPicking(null);
        setProblem(null);
      }}
    />
  ) : null;
  const trouble =
    problem && !picking ? (
      <Text variant="small" tone="destructive" accessibilityRole="alert" testID="schedule-problem">
        {problem}
      </Text>
    ) : null;
  const zone = (
    <TimeZoneCard
      token={token}
      timeZone={page.data?.timeZone ?? null}
      onSaved={() => {
        void page.refetch();
        void portal.refetch();
      }}
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={refresh}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : styles.block}
    >
      {wide ? (
        <>
          <View style={styles.column}>
            {waiting}
            {upcoming}
            {trouble}
          </View>
          <View style={styles.column}>
            {picker}
            {booking}
            {times}
            {zone}
          </View>
        </>
      ) : (
        <>
          {picker}
          {waiting}
          {booking}
          {times}
          {upcoming}
          {trouble}
          {zone}
        </>
      )}
    </Screen>
  );
}

function Heading({
  Icon,
  text,
  warning = false,
}: {
  Icon: typeof CalendarClock;
  text: string;
  warning?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.heading}>
      <Icon size={18} color={warning ? colors.warning : colors.primary} />
      <Text variant="heading" style={styles.fill}>
        {text}
      </Text>
    </View>
  );
}

/** Times to tap, one row per day. `chosen` is the one picked so far. */
function SlotList({
  slots,
  chosen,
  onPick,
  testID,
}: {
  slots: LessonTime[];
  chosen: LessonTime | null;
  onPick: (slot: LessonTime) => void;
  testID: string;
}) {
  const day = useDay();
  const days = [...new Set(slots.map((slot) => slot.date))];
  return (
    <View style={styles.slots} testID={`${testID}s`}>
      {days.map((date) => (
        <View key={date} style={styles.slotDay}>
          <Text variant="small" tone="mutedForeground">
            {day(date)}
          </Text>
          <View style={styles.chips}>
            {slots
              .filter((slot) => slot.date === date)
              .map((slot) => (
                <WordChip
                  key={slot.startTime}
                  label={slot.startTime}
                  chosen={chosen?.date === slot.date && chosen.startTime === slot.startTime}
                  onPress={() => onPick(slot)}
                  testID={`${testID}-${slot.date}-${slot.startTime}`}
                />
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Choosing a time for a lesson: one of the teacher's free times when they keep
 * booking hours (the server takes no other), otherwise a day and a start on
 * the centre's grid. Nothing is sent until **Confirm**; the end follows the
 * start by the lesson's length.
 */
function PickTime({
  title,
  length,
  rules,
  slots,
  busy,
  problem,
  onPick,
  onCancel,
}: {
  title: string;
  /** The lesson's length in minutes. */
  length: number;
  rules: PortalSchedule["rules"];
  /** The teacher's free times, or null when they keep no booking hours. */
  slots: LessonTime[] | null;
  busy: boolean;
  problem: string | null;
  onPick: (at: LessonTime) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const day = useDay();
  const { colors } = useTheme();
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const today = centreToday();
  const days = Array.from({ length: OWN_DAYS }, (_, index) => addDays(today, index));
  const step = Math.max(5, rules.stepMinutes);
  const starts: string[] = [];
  for (let m = minutes(rules.workStart); m + length <= minutes(rules.workEnd); m += step) {
    starts.push(hhmm(m));
  }
  const chosen: LessonTime | null =
    date && startTime ? { date, startTime, endTime: hhmm(minutes(startTime) + length) } : null;
  return (
    <Card style={{ borderColor: colors.ring }} testID="pick-time">
      <Text variant="heading">{title}</Text>
      {slots ? (
        // The teacher keeps booking hours: only their free times can be taken.
        slots.length > 0 ? (
          <SlotList
            slots={slots}
            chosen={chosen}
            onPick={(slot) => {
              setDate(slot.date);
              setStartTime(slot.startTime);
            }}
            testID="pick-slot"
          />
        ) : (
          <Text variant="small" tone="mutedForeground" testID="no-slots">
            {t("portal.schedule.noSlots")}
          </Text>
        )
      ) : (
        <>
          <Text variant="smallStrong">{t("portal.schedule.newDate")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
            keyboardShouldPersistTaps="handled"
          >
            {days.map((iso) => (
              <WordChip
                key={iso}
                label={day(iso)}
                chosen={date === iso}
                onPress={() => setDate(iso)}
                testID={`pick-day-${iso}`}
              />
            ))}
          </ScrollView>
          <Text variant="smallStrong">{t("portal.schedule.newTime")}</Text>
          <View style={styles.chips}>
            {starts.map((time) => (
              <WordChip
                key={time}
                label={time}
                chosen={startTime === time}
                onPress={() => setStartTime(time)}
                testID={`pick-start-${time}`}
              />
            ))}
          </View>
        </>
      )}
      {chosen ? (
        <Text testID="pick-chosen">
          {day(chosen.date)}, {chosen.startTime}–{chosen.endTime}
        </Text>
      ) : null}
      <Text variant="small" tone="mutedForeground">
        {t("portal.schedule.pickHint")}
      </Text>
      {problem ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert" testID="pick-problem">
          {problem}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <Button
          label={t("portal.schedule.confirm")}
          disabled={!chosen}
          loading={busy}
          onPress={() => chosen && onPick(chosen)}
          testID="pick-save"
        />
        <Button
          variant="ghost"
          label={t("common.cancel")}
          disabled={busy}
          onPress={onCancel}
          testID="pick-cancel"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  column: { flex: 1, gap: space[4] },
  rows: { gap: space[3] },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  lesson: { gap: space[2] },
  heading: { flexDirection: "row", alignItems: "center", gap: space[2] },
  buttons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  ask: { gap: space[2] },
  start: { alignSelf: "flex-start" },
  slots: { gap: space[3] },
  slotDay: { gap: space[1] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  dayRow: { gap: space[2], paddingRight: space[2] },
});
