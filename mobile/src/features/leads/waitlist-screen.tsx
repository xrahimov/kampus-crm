import { Phone, Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  WAITLIST_STATUSES,
  useCourseGroups,
  useEnrolFromWaitlist,
  useWaitlist,
  useWaitlistStatus,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@/api/leads";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Badge, Card, EmptyState, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { dial } from "@/features/office/contact-sheet";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { JoinGroupSheet } from "./join-group-sheet";
import { WaitlistFormSheet } from "./waitlist-form";

const STATUS_TONE: Record<WaitlistStatus, Tone> = {
  WAITING: "accent",
  OFFERED: "warning",
  ENROLLED: "success",
  DECLINED: "neutral",
  REMOVED: "neutral",
};

/**
 * The waiting list (A-232): who waits for which course, in the order they
 * came. An entry is enrolled into a group of its course, marked declined, put
 * back to waiting or taken off the list. Offering a new group's seats to the
 * first in line is done on the group's page on the site.
 */
export function WaitlistScreen() {
  const t = useTranslations();
  const tw = useTranslations("leads.waitlist");
  const me = useMe();
  const { colors } = useTheme();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [status, setStatus] = useState<WaitlistStatus | null>(null);
  const [typed, setTyped] = useState("");
  const q = useRested(typed);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntry | null>(null);
  const [enrolling, setEnrolling] = useState<WaitlistEntry | null>(null);
  const [removing, setRemoving] = useState<WaitlistEntry | null>(null);
  const query = useWaitlist({ courseId, status, q });
  const change = useWaitlistStatus();

  const header = (
    <Header
      title={tw("title")}
      back
      right={
        can(me, "leads.create") ? (
          <Button
            compact
            label={t("common.add")}
            icon={<Plus size={18} color={colors.primaryForeground} />}
            onPress={() => setAdding(true)}
            testID="waitlist-add"
          />
        ) : undefined
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const pages = query.data.pages;
  const rows = pages.flatMap((page) => page.items);
  const summary = pages[0]?.summary;
  const total = pages[0]?.total ?? 0;
  const mayChange = can(me, "leads.update");

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      <View style={styles.filters}>
        <View style={styles.fill}>
          <Select
            compact
            label={tw("filters.course")}
            value={courseId}
            onChange={setCourseId}
            placeholder={tw("filters.allCourses")}
            clearLabel={tw("filters.allCourses")}
            options={(summary?.byCourse ?? []).map((c) => ({
              value: c.courseId,
              label: c.courseName,
              note: String(c.waiting),
            }))}
            testID="waitlist-filter-course"
          />
        </View>
        <View style={styles.fill}>
          <Select
            compact
            label={tw("filters.status")}
            value={status}
            onChange={setStatus}
            placeholder={tw("filters.open")}
            clearLabel={tw("filters.open")}
            options={WAITLIST_STATUSES.map((s) => ({ value: s, label: tw(`statuses.${s}`) }))}
            testID="waitlist-filter-status"
          />
        </View>
      </View>
      <Field
        label={tw("filters.search")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="waitlist-search"
      />
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {change.error ? (
        <Notice tone="destructive" testID="waitlist-problem">
          {errorText(t, change.error)}
        </Notice>
      ) : null}
      <Text variant="small" tone="mutedForeground" testID="waitlist-count">
        {tw("count", { count: total })}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title={tw("empty")} text={tw("emptyHint")} />
      ) : (
        rows.map((entry) => (
          <Entry
            key={entry.id}
            entry={entry}
            mayChange={mayChange}
            busy={change.isPending && change.variables?.id === entry.id}
            onEdit={() => setEditing(entry)}
            onEnrol={() => setEnrolling(entry)}
            onRemove={() => setRemoving(entry)}
            onStatus={(next) => change.mutate({ id: entry.id, status: next })}
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
          testID="waitlist-more"
        />
      ) : null}
      <WaitlistFormSheet
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        entry={editing}
      />
      <Enrol entry={enrolling} onClose={() => setEnrolling(null)} />
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tw("removeTitle")}
        text={removing ? tw("removeText", { name: removing.fullName }) : undefined}
        label={t("common.remove")}
        loading={change.isPending}
        onConfirm={() => {
          if (!removing) return;
          change.mutate(
            { id: removing.id, status: "REMOVED" },
            { onSettled: () => setRemoving(null) },
          );
        }}
        testID="waitlist-remove-sheet"
      />
    </Screen>
  );
}

function Entry({
  entry,
  mayChange,
  busy,
  onEdit,
  onEnrol,
  onRemove,
  onStatus,
}: {
  entry: WaitlistEntry;
  mayChange: boolean;
  busy: boolean;
  onEdit: () => void;
  onEnrol: () => void;
  onRemove: () => void;
  onStatus: (status: "WAITING" | "DECLINED") => void;
}) {
  const t = useTranslations();
  const tw = useTranslations("leads.waitlist");
  const tl = useTranslations("leads");
  const date = useDate();
  const { colors } = useTheme();
  const open = entry.status === "WAITING" || entry.status === "OFFERED";
  const wishes = [entry.days ? tl(`days.${entry.days}`) : null, entry.lessonTime]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card testID={`waitlist-${entry.id}`}>
      <View style={styles.line}>
        <Text variant="bodyStrong" style={styles.fill}>
          {entry.position ? `${entry.position}. ` : ""}
          {entry.fullName}
        </Text>
        <Badge label={tw(`statuses.${entry.status}`)} tone={STATUS_TONE[entry.status]} />
      </View>
      <View style={styles.facts}>
        <Text variant="small" tone="mutedForeground">
          {entry.courseName} · {entry.branchName}
        </Text>
        {wishes ? (
          <Text variant="small" tone="mutedForeground">
            {wishes}
          </Text>
        ) : null}
        {entry.offeredGroup ? (
          <Text variant="small" tone="mutedForeground">
            {tw("statuses.OFFERED")}: {entry.offeredGroup.name}
          </Text>
        ) : null}
        {entry.note ? <Text variant="small">{entry.note}</Text> : null}
        <Text variant="small" tone="mutedForeground">
          {date(new Date(entry.createdAt), { dateStyle: "medium" })}
          {entry.createdBy ? ` · ${entry.createdBy}` : ""}
        </Text>
      </View>
      <View style={styles.wrap}>
        <Button
          variant="outline"
          compact
          icon={<Phone size={16} color={colors.foreground} />}
          label={entry.phone}
          onPress={() => dial(entry.phone)}
          testID={`waitlist-dial-${entry.id}`}
        />
        {mayChange && open ? (
          <>
            <Button
              compact
              label={tw("enrol")}
              onPress={onEnrol}
              testID={`waitlist-enrol-${entry.id}`}
            />
            <Button
              variant="outline"
              compact
              label={t("common.edit")}
              onPress={onEdit}
              testID={`waitlist-edit-${entry.id}`}
            />
            <Button
              variant="outline"
              compact
              label={tw("actions.decline")}
              loading={busy}
              onPress={() => onStatus("DECLINED")}
              testID={`waitlist-decline-${entry.id}`}
            />
            <Button
              variant="ghost"
              compact
              label={t("common.remove")}
              onPress={onRemove}
              testID={`waitlist-remove-${entry.id}`}
            />
          </>
        ) : null}
        {mayChange && (entry.status === "DECLINED" || entry.status === "REMOVED") ? (
          <Button
            variant="outline"
            compact
            label={tw("actions.reopen")}
            loading={busy}
            onPress={() => onStatus("WAITING")}
            testID={`waitlist-reopen-${entry.id}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** "Enrol in a group": a group of the entry's course in its branch. */
function Enrol({ entry, onClose }: { entry: WaitlistEntry | null; onClose: () => void }) {
  const tw = useTranslations("leads.waitlist");
  // The last entry stays while the sheet slides away.
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  const groups = useCourseGroups(entry?.courseId ?? null);
  const enrol = useEnrolFromWaitlist(shown?.id ?? "");
  const [seen, setSeen] = useState(entry);
  if (entry !== seen) {
    setSeen(entry);
    if (entry) enrol.reset();
  }
  if (!shown) return null;
  return (
    <JoinGroupSheet
      open={entry !== null}
      onClose={onClose}
      title={tw("enrolTitle", { name: shown.fullName })}
      hint={tw("enrolHint", { course: shown.courseName })}
      groups={(groups.data?.items ?? []).filter(
        (g) => g.branchId === shown.branchId && g.status !== "ARCHIVED",
      )}
      saving={enrol.isPending}
      error={enrol.error ?? groups.error}
      onSave={(input) => enrol.mutate(input, { onSuccess: onClose })}
      testID="waitlist-enrol"
    />
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  fill: { flex: 1 },
  filters: { flexDirection: "row", gap: space[2] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  facts: { gap: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  start: { alignSelf: "flex-start" },
});
