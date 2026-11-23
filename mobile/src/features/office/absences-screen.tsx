import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  ABSENCE_FILTERS,
  ABSENCE_OUTCOMES,
  ABSENCE_REASONS,
  useAbsenceContacts,
  useAbsences,
  useLogAbsenceContact,
  type AbsenceCase,
  type AbsenceChannel,
  type AbsenceFilter,
  type AbsenceOutcome,
  type AbsenceReason,
} from "@/api/office-follow-up";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { ContactSheet } from "./contact-sheet";
import { CountTiles } from "./count-tile";

/**
 * Absences (A-232): the students who stopped coming, longest away first, with
 * why each is on the list and when somebody last called. **Log a contact**
 * dials the student's or the parent's number and records how the call ended;
 * **History** shows every contact of the case. The list fills by itself from
 * the attendance marks; its two rules are set on the site.
 */
export function AbsencesScreen() {
  const t = useTranslations();
  const ta = useTranslations("absences");
  const me = useMe();
  const [status, setStatus] = useState<AbsenceFilter>("OPEN");
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const q = useRested(typed);
  const [logging, setLogging] = useState<AbsenceCase | null>(null);
  const [history, setHistory] = useState<AbsenceCase | null>(null);
  const query = useAbsences({ status, reason, branchId, q });

  const header = <Header title={ta("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const pages = query.data.pages;
  const rows = pages.flatMap((page) => page.items);
  const summary = pages[0]?.summary;
  const rules = pages[0]?.rules;
  const total = pages[0]?.total ?? 0;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      {summary ? (
        <CountTiles
          testID="absences"
          tiles={[
            { key: "open", label: ta("summary.open"), value: summary.open },
            {
              key: "no-contact",
              label: ta("summary.noContact"),
              value: summary.noContact,
              alert: true,
            },
            { key: "streak", label: ta("summary.streak"), value: summary.streak },
            {
              key: "silent",
              label: rules?.silentDays
                ? ta("summary.silent", { days: rules.silentDays })
                : ta("summary.silentOff"),
              value: summary.silent,
            },
          ]}
        />
      ) : null}
      <View style={styles.filters}>
        <View style={styles.fill}>
          <Select
            compact
            label={ta("filters.status")}
            value={status}
            onChange={(value) => setStatus(value ?? "OPEN")}
            options={ABSENCE_FILTERS.map((f) => ({ value: f, label: ta(`filters.${f}`) }))}
            testID="absences-status"
          />
        </View>
        <View style={styles.fill}>
          <Select
            compact
            label={ta("filters.reason")}
            value={reason}
            onChange={setReason}
            placeholder={ta("filters.anyReason")}
            clearLabel={ta("filters.anyReason")}
            options={ABSENCE_REASONS.map((r) => ({ value: r, label: ta(`filters.${r}`) }))}
            testID="absences-reason"
          />
        </View>
      </View>
      {me.branches.length > 1 ? (
        <Select
          compact
          label={t("leads.waitlist.fields.branch")}
          value={branchId}
          onChange={setBranchId}
          placeholder={t("common.allBranches")}
          clearLabel={t("common.allBranches")}
          options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
          testID="absences-branch"
        />
      ) : null}
      <Field
        label={ta("filters.search")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="absences-search"
      />
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      <Text variant="small" tone="mutedForeground" testID="absences-count">
        {ta("count", { count: total })}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title={ta("empty")} text={ta("emptyHint")} />
      ) : (
        rows.map((row) => (
          <Case
            key={row.id}
            row={row}
            onLog={() => setLogging(row)}
            onHistory={() => setHistory(row)}
          />
        ))
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="absences-more"
        />
      ) : null}
      <LogContact row={logging} onClose={() => setLogging(null)} />
      <History row={history} onClose={() => setHistory(null)} />
    </Screen>
  );
}

function Case({
  row,
  onLog,
  onHistory,
}: {
  row: AbsenceCase;
  onLog: () => void;
  onHistory: () => void;
}) {
  const ta = useTranslations("absences");
  const date = useDate();
  const router = useRouter();
  const day = (iso: string) => date(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });
  return (
    <Card testID={`absence-${row.id}`}>
      <View style={styles.line}>
        <Text variant="bodyStrong" style={styles.fill}>
          {row.studentName}
        </Text>
        {row.status === "CLOSED" ? (
          <Badge
            label={row.closedReason ? ta(`closed.${row.closedReason}`) : ta("status.CLOSED")}
          />
        ) : (
          <Badge label={ta("days", { count: row.days })} tone="warning" />
        )}
      </View>
      <View style={styles.facts}>
        <Text variant="small" tone="mutedForeground">
          {row.groupName}
          {row.teacher ? ` · ${ta("teacher", { name: row.teacher })}` : ""}
        </Text>
        <Text variant="small">
          {ta(`reason.${row.reason}`, { count: row.missed })},{" "}
          {ta("since", { date: day(row.sinceAt) })}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {ta("columns.lastSeen")}: {row.lastPresentAt ? day(row.lastPresentAt) : ta("never")}
        </Text>
        <Text
          variant="small"
          tone={row.lastContactAt ? "mutedForeground" : "destructive"}
          testID={`absence-contact-${row.id}`}
        >
          {row.lastContactAt
            ? `${ta("columns.lastContact")}: ${day(row.lastContactAt)}${
                row.lastOutcome ? `, ${ta(`outcomes.${row.lastOutcome}`)}` : ""
              }${row.lastContactBy ? `, ${ta("by", { name: row.lastContactBy })}` : ""}`
            : ta("noContact")}
        </Text>
      </View>
      <View style={styles.wrap}>
        {row.status === "OPEN" ? (
          <Button
            compact
            label={ta("actions.log")}
            onPress={onLog}
            testID={`absence-log-${row.id}`}
          />
        ) : null}
        <Button
          variant="outline"
          compact
          label={ta("actions.history")}
          onPress={onHistory}
          testID={`absence-history-${row.id}`}
        />
        <Button
          variant="outline"
          compact
          label={ta("actions.profile")}
          onPress={() =>
            router.push({ pathname: "/staff/student/[id]", params: { id: row.studentId } })
          }
          testID={`absence-student-${row.id}`}
        />
        <Button
          variant="ghost"
          compact
          label={ta("actions.group")}
          onPress={() =>
            router.push({ pathname: "/staff/group/[id]", params: { id: row.groupId } })
          }
          testID={`absence-group-${row.id}`}
        />
      </View>
    </Card>
  );
}

function LogContact({ row, onClose }: { row: AbsenceCase | null; onClose: () => void }) {
  const ta = useTranslations("absences");
  // The last case stays while the sheet slides away.
  const [shown, setShown] = useState(row);
  const log = useLogAbsenceContact(shown?.id ?? "");
  const [seen, setSeen] = useState(row);
  if (row !== seen) {
    setSeen(row);
    if (row) {
      setShown(row);
      log.reset();
    }
  }
  if (!shown) return null;
  const phones = [
    shown.phone ? { phone: shown.phone } : null,
    shown.parentPhone ? { phone: shown.parentPhone, label: ta("dialog.parentPhone") } : null,
  ].filter((p): p is { phone: string; label?: string } => p !== null);
  return (
    <ContactSheet
      open={row !== null}
      onClose={onClose}
      title={ta("dialog.title", { name: shown.studentName })}
      phones={phones}
      words={{
        channel: ta("dialog.channel"),
        outcome: ta("dialog.outcome"),
        none: ta("dialog.none"),
        note: ta("dialog.note"),
      }}
      channelLabel={(c) => ta(`channels.${c}`)}
      outcomes={ABSENCE_OUTCOMES.map((o) => ({ value: o, label: ta(`outcomes.${o}`) }))}
      saving={log.isPending}
      error={log.error}
      onSave={(draft) =>
        log.mutate(
          {
            channel: draft.channel as AbsenceChannel,
            outcome: draft.outcome as AbsenceOutcome | null,
            note: draft.note,
          },
          { onSuccess: onClose },
        )
      }
      testID="absence-contact"
    />
  );
}

function History({ row, onClose }: { row: AbsenceCase | null; onClose: () => void }) {
  const t = useTranslations();
  const ta = useTranslations("absences");
  const date = useDate();
  const [shown, setShown] = useState(row);
  if (row && row !== shown) setShown(row);
  const contacts = useAbsenceContacts(row?.id ?? null);
  if (!shown) return null;
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={ta("history.title", { name: shown.studentName })}
      testID="absence-history"
    >
      <View style={styles.history}>
        {contacts.error ? (
          <Notice tone="destructive">{errorText(t, contacts.error)}</Notice>
        ) : !contacts.data ? (
          <Loading />
        ) : contacts.data.length === 0 ? (
          <Text tone="mutedForeground" testID="absence-history-empty">
            {ta("history.empty")}
          </Text>
        ) : (
          contacts.data.map((c) => (
            <View key={c.id} style={styles.facts} testID={`absence-contact-row-${c.id}`}>
              <Text variant="bodyStrong">
                {ta(`channels.${c.channel}`)}
                {c.outcome ? `: ${ta(`outcomes.${c.outcome}`)}` : ""}
              </Text>
              {c.note ? <Text>{c.note}</Text> : null}
              <Text variant="small" tone="mutedForeground">
                {date(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {c.createdBy ? `, ${ta("by", { name: c.createdBy })}` : ""}
              </Text>
            </View>
          ))
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  fill: { flex: 1 },
  filters: { flexDirection: "row", gap: space[2] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  facts: { gap: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  history: { gap: space[4] },
  start: { alignSelf: "flex-start" },
});
