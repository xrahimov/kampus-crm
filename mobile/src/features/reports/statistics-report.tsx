import { DoorOpen } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  STATISTICS_VIEWS,
  useStatisticsReport,
  type StatisticsRow,
  type StatisticsView,
} from "@/api/office-reports";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { useOpenPath } from "@/features/office/site-paths";
import { PendingScreen } from "@/features/shared/pending-screen";
import { centreToday, dayAsDate } from "@/lib/days";
import { useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { ReportExcel, Filters, Kpis, PeriodFilters, Rows, Stats, useReportPeriod } from "./parts";

/**
 * Reports, Center statistics (A-238): how full the rooms are in a month, a
 * week or a day. The key figures, then every room with the groups that study
 * in it: hours, seats, the price and what a full room would bring.
 */
export function StatisticsReportScreen() {
  const t = useTranslations("reports.statistics");
  const tf = useTranslations("reports.filters");
  const me = useMe();
  const money = useMoney();
  const date = useDate();
  const { colors } = useTheme();
  const { open, error } = useOpenPath();
  const state = useReportPeriod();
  const [view, setView] = useState<StatisticsView>("monthly");
  // What the field holds, and the last real day typed: the report is asked for that one.
  const [typedDay, setTypedDay] = useState<string | null>(centreToday);
  const [day, setDay] = useState(centreToday);
  const filters = { ...state.period, view, date: view === "monthly" ? null : day };
  const query = useStatisticsReport(filters);

  const header = <Header back title={t("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;
  const rooms = byRoom(report.rows);
  const spelled = (iso: string) => date(dayAsDate(iso), { dateStyle: "medium" });

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Segmented
        options={STATISTICS_VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
        value={view}
        onChange={setView}
        testID="statistics-view"
      />
      <Filters testID="report-filters">
        <PeriodFilters state={state} withMonth={view === "monthly"} />
      </Filters>
      {view === "monthly" ? null : (
        <DateField
          label={tf("date")}
          value={typedDay}
          onChange={(value) => {
            setTypedDay(value);
            if (value) setDay(value);
          }}
          testID="statistics-date"
        />
      )}
      <Text variant="small" tone="mutedForeground" testID="statistics-period">
        {t("period", {
          from: spelled(report.from),
          to: spelled(report.to),
          start: report.workHours.start,
          end: report.workHours.end,
        })}
      </Text>
      <Kpis
        columns={3}
        items={[
          { key: "utilisation", label: t("kpis.utilisation"), value: `${k.utilisation}%` },
          {
            key: "freeHours",
            label: t("kpis.freeHours"),
            value: t("hours", { count: k.freeHours }),
          },
          { key: "students", label: t("kpis.students"), value: String(k.students) },
          {
            key: "potentialRevenue",
            label: t("kpis.potentialRevenue"),
            value: money(k.potentialRevenue),
            hint: t("kpis.perMonth"),
          },
          { key: "freeSeats", label: t("kpis.freeSeats"), value: String(k.freeSeats) },
          {
            key: "possibleStudents",
            label: t("kpis.possibleStudents"),
            value: String(k.possibleStudents),
          },
        ]}
      />
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {rooms.length === 0 ? (
        <EmptyState title={t("empty")} text={t("emptyHint")} />
      ) : (
        <Rows testID="statistics-rooms">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </Rows>
      )}
      {can(me, "settings.catalog") ? (
        <Button
          variant="outline"
          icon={<DoorOpen size={18} color={colors.foreground} />}
          label={t("updateCapacities")}
          onPress={() => open("/settings/rooms")}
          style={styles.start}
          testID="statistics-rooms-open"
        />
      ) : null}
      <ReportExcel
        path="/reports/statistics/export.xlsx"
        params={{ ...filters, view: view === "monthly" ? null : view }}
      />
    </Screen>
  );
}

interface Room {
  id: string;
  name: string;
  total: StatisticsRow | null;
  groups: StatisticsRow[];
}

/** The table's rows gathered under their rooms, in the order the rooms come. */
function byRoom(rows: StatisticsRow[]): Room[] {
  const rooms = new Map<string, Room>();
  for (const row of rows) {
    const room = rooms.get(row.roomId) ?? {
      id: row.roomId,
      name: row.roomName,
      total: null,
      groups: [],
    };
    if (row.isRoomTotal) room.total = row;
    else room.groups.push(row);
    rooms.set(row.roomId, room);
  }
  return [...rooms.values()];
}

function RoomCard({ room }: { room: Room }) {
  const t = useTranslations("reports.statistics");
  const money = useMoney();
  const total = room.total;
  /** The seat-hours of a row and how full it is: the same four for a room and for a group. */
  const seats = (row: StatisticsRow) => [
    { label: t("columns.seatHours"), value: String(row.seatHours) },
    { label: t("columns.actualSeatHours"), value: String(row.actualSeatHours) },
    { label: t("columns.planSeatHours"), value: String(row.planSeatHours) },
  ];
  return (
    <Card style={styles.card} testID={`statistics-room-${room.id}`}>
      <View style={styles.between}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
          {room.name}
        </Text>
        {total ? (
          <Badge
            tone="accent"
            label={`${t("columns.fik")}: ${total.fik}%`}
            testID={`statistics-room-${room.id}-fik`}
          />
        ) : null}
      </View>
      {total ? (
        <Stats
          items={[
            { label: t("columns.capacity"), value: String(total.capacity) },
            { label: t("columns.roomHours"), value: String(total.roomHours) },
            { label: t("columns.lessonHours"), value: String(total.lessonHours) },
            {
              label: t("columns.freeHours"),
              value: total.freeHours === null ? "—" : String(total.freeHours),
            },
            { label: t("columns.students"), value: String(total.students) },
            { label: t("columns.freeSeats"), value: String(total.freeSeats) },
            ...seats(total),
          ]}
        />
      ) : null}
      {total ? (
        <Stats
          columns={2}
          items={[{ label: t("columns.totalSum"), value: money(total.totalSum) }]}
        />
      ) : null}
      {room.groups.map((group) => (
        <View key={group.groupId ?? group.groupName} style={styles.group}>
          <Divider />
          <View style={styles.between}>
            <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
              {group.groupName ?? t("roomTotal")}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {t("columns.fik")}: {group.fik}%
            </Text>
          </View>
          <Stats
            items={[
              { label: t("columns.students"), value: String(group.students) },
              { label: t("columns.freeSeats"), value: String(group.freeSeats) },
              { label: t("columns.lessonHours"), value: String(group.lessonHours) },
              ...seats(group),
            ]}
          />
          <Stats
            columns={2}
            items={[
              {
                label: t("columns.price"),
                value: group.coursePrice === null ? "—" : money(group.coursePrice),
              },
              { label: t("columns.totalSum"), value: money(group.totalSum) },
            ]}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  between: { flexDirection: "row", alignItems: "center", gap: space[2] },
  card: { flex: 1, gap: space[3] },
  group: { gap: space[3] },
});
