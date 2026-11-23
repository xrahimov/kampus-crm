import { useRouter } from "expo-router";
import { Phone } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  LEAD_OUTCOMES,
  LEAD_STATUSES,
  useLeadAction,
  useLeadOptions,
  useLeadToGroup,
  useLogLeadContact,
  type Lead,
  type LeadContactInput,
} from "@/api/leads";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { ContactSheet, dial } from "@/features/office/contact-sheet";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { JoinGroupSheet } from "./join-group-sheet";
import { LeadBadges } from "./lead-bits";
import { LeadFormSheet } from "./lead-form";
import { LeadHistorySheet } from "./lead-history";
import { TrialSheet } from "./trial-sheet";
import { WaitlistFormSheet } from "./waitlist-form";

type Step =
  "card" | "edit" | "contact" | "history" | "trial" | "group" | "waitlist" | "archive" | "delete";

/**
 * Everything that is done with one lead (A-232), wherever it was pressed: on
 * the board, on the day's calls or in a chat. The card comes first, with the
 * numbers to dial and what is known; its buttons open one sheet at a time:
 * log a contact, book a trial, the history, edit, into a group, onto the
 * waiting list, another column, the archive. A button is only there for
 * someone who may do it.
 */
export function LeadFlow({
  lead,
  onClose,
  today,
}: {
  /** The lead that was pressed; null closes everything. */
  lead: Lead | null;
  onClose: () => void;
  /** The centre's day, for the "call today" and "overdue" marks. */
  today: string;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const me = useMe();
  const router = useRouter();
  const date = useDate();
  const { colors } = useTheme();
  // The last lead stays while its sheet slides away.
  const [shown, setShown] = useState<Lead | null>(lead);
  const [step, setStep] = useState<Step>("card");
  const [seen, setSeen] = useState<Lead | null>(lead);
  const id = shown?.id ?? "";
  const action = useLeadAction(id);
  const log = useLogLeadContact(id);
  const toGroup = useLeadToGroup(id);
  if (lead !== seen) {
    setSeen(lead);
    if (lead) {
      setShown(lead);
      setStep("card");
      action.reset();
      log.reset();
      toGroup.reset();
    }
  }
  const open = lead !== null;
  const options = useLeadOptions(open);
  if (!shown) return null;

  const mayChange = can(me, "leads.update");
  const board = options.data?.boards.find((b) => b.id === shown.boardId);
  const column = board?.columns.find((c) => c.id === shown.columnId);
  const groups = (options.data?.groups ?? []).filter((g) => g.branchId === shown.branchId);
  const day = (iso: string) => date(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });
  const facts: Array<[string, string | null]> = [
    [tl("form.column"), column?.name ?? null],
    [tl("form.owner"), shown.ownerName],
    [tl("form.nextContact"), shown.nextContactAt ? day(shown.nextContactAt) : null],
    [tl("form.source"), shown.sourceName ?? (shown.formName ? tl("fromForm") : null)],
    [tl("filters.teacher"), shown.teacherName],
    [tl("form.days"), shown.days ? tl(`days.${shown.days}`) : null],
    [tl("form.lessonTime"), shown.lessonTime],
    [tl("form.age"), shown.age ? String(shown.age) : null],
    [tl("form.birthDate"), shown.birthDate ? day(shown.birthDate) : null],
    [tl("form.referrer"), shown.referrerName],
    [tl("form.comment"), shown.comment],
  ];

  return (
    <>
      <Sheet open={open && step === "card"} onClose={onClose} title={shown.fullName} testID="lead-card">
        <View style={styles.column}>
          <LeadBadges lead={shown} today={today} />
          {shown.phones.length > 0 ? (
            <View style={styles.wrap}>
              {shown.phones.map((phone, index) => (
                <Button
                  key={`${phone}:${index}`}
                  variant="outline"
                  compact
                  icon={<Phone size={16} color={colors.foreground} />}
                  label={phone}
                  onPress={() => dial(phone)}
                  testID={`lead-dial-${index}`}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.facts}>
            {facts.map(([label, value]) =>
              value ? (
                <View key={label} style={styles.fact}>
                  <Text variant="small" tone="mutedForeground" style={styles.label}>
                    {label}
                  </Text>
                  <Text style={styles.fill}>{value}</Text>
                </View>
              ) : null,
            )}
          </View>
          {action.error ? (
            <Notice tone="destructive" testID="lead-action-problem">
              {errorText(t, action.error)}
            </Notice>
          ) : null}
          {mayChange && !shown.isArchived ? (
            <Button
              label={tl("calls.actions.log")}
              onPress={() => setStep("contact")}
              testID="lead-log"
            />
          ) : null}
          <View style={styles.wrap}>
            {mayChange && !shown.isArchived ? (
              <Action label={tl("trial.book")} onPress={() => setStep("trial")} testID="lead-trial" />
            ) : null}
            <Action
              label={tl("calls.actions.history")}
              onPress={() => setStep("history")}
              testID="lead-history-open"
            />
            {mayChange ? (
              <Action label={t("common.edit")} onPress={() => setStep("edit")} testID="lead-edit" />
            ) : null}
            {mayChange && !shown.isArchived ? (
              <Action
                label={t("mobile.office.toGroup")}
                onPress={() => setStep("group")}
                testID="lead-to-group"
              />
            ) : null}
            {can(me, "leads.create") && !shown.isArchived ? (
              <Action
                label={tl("waitlist.addLead")}
                onPress={() => setStep("waitlist")}
                testID="lead-to-waitlist"
              />
            ) : null}
            {shown.studentId && can(me, "students.view") ? (
              <Action
                label={tl("student")}
                onPress={() => {
                  const studentId = shown.studentId!;
                  onClose();
                  router.push({ pathname: "/staff/student/[id]", params: { id: studentId } });
                }}
                testID="lead-student"
              />
            ) : null}
            {mayChange ? (
              shown.isArchived ? (
                <Action
                  label={tl("restore")}
                  loading={action.isPending}
                  onPress={() => action.mutate({ kind: "restore" }, { onSuccess: onClose })}
                  testID="lead-restore"
                />
              ) : (
                <Action
                  label={t("common.archive")}
                  onPress={() => setStep("archive")}
                  testID="lead-archive"
                />
              )
            ) : null}
            {can(me, "leads.delete") ? (
              <Action
                label={t("common.delete")}
                onPress={() => setStep("delete")}
                testID="lead-delete"
              />
            ) : null}
          </View>
          {mayChange && !shown.isArchived && board && board.columns.length > 1 ? (
            <Select
              label={tl("moveTo")}
              value={shown.columnId}
              onChange={(columnId) => {
                if (columnId && columnId !== shown.columnId) {
                  action.mutate({ kind: "move", columnId }, { onSuccess: onClose });
                }
              }}
              options={board.columns.map((c) => ({ value: c.id, label: c.name }))}
              testID="lead-move"
            />
          ) : null}
        </View>
      </Sheet>
      <LeadFormSheet
        open={open && step === "edit"}
        onClose={onClose}
        lead={shown}
        boardId={shown.boardId}
        columnId={shown.columnId}
      />
      <ContactSheet
        open={open && step === "contact"}
        onClose={onClose}
        title={tl("contact.title", { name: shown.fullName })}
        phones={shown.phones.map((phone) => ({ phone }))}
        words={{
          channel: tl("contact.channel"),
          outcome: tl("contact.outcome"),
          none: tl("contact.none"),
          note: tl("contact.note"),
        }}
        channelLabel={(c) => tl(`channels.${c}`)}
        outcomes={LEAD_OUTCOMES.map((o) => ({ value: o, label: tl(`outcomes.${o}`) }))}
        next={{ label: tl("contact.nextContact"), hint: tl("contact.nextContactHint") }}
        statuses={{
          label: tl("contact.status"),
          options: LEAD_STATUSES.map((s) => ({ value: s, label: tl(`statuses.${s}`) })),
        }}
        saving={log.isPending}
        error={log.error}
        onSave={(draft) => log.mutate(draft as LeadContactInput, { onSuccess: onClose })}
        testID="lead-contact"
      />
      <LeadHistorySheet
        open={open && step === "history"}
        onClose={onClose}
        lead={shown}
        canChange={mayChange}
      />
      <TrialSheet open={open && step === "trial"} onClose={onClose} lead={shown} />
      <JoinGroupSheet
        open={open && step === "group"}
        onClose={onClose}
        title={t("mobile.office.toGroup")}
        hint={tl("addToGroup.hint", { count: 1 })}
        groups={groups}
        saving={toGroup.isPending}
        error={toGroup.error}
        onSave={(input) => toGroup.mutate(input, { onSuccess: onClose })}
        testID="lead-group"
      />
      <WaitlistFormSheet open={open && step === "waitlist"} onClose={onClose} lead={shown} />
      <Confirm
        open={open && step === "archive"}
        onClose={onClose}
        title={tl("bulk.archiveTitle", { count: 1 })}
        text={tl("bulk.archiveText")}
        label={t("common.archive")}
        loading={action.isPending}
        problem={action.error ? errorText(t, action.error) : null}
        onConfirm={() => action.mutate({ kind: "archive" }, { onSuccess: onClose })}
        testID="lead-archive-sheet"
      />
      <Confirm
        open={open && step === "delete"}
        onClose={onClose}
        title={tl("deleteTitle")}
        text={tl("deleteText", { name: shown.fullName })}
        label={t("common.delete")}
        loading={action.isPending}
        problem={action.error ? errorText(t, action.error) : null}
        onConfirm={() => action.mutate({ kind: "delete" }, { onSuccess: onClose })}
        testID="lead-delete-sheet"
      />
    </>
  );
}

function Action({
  label,
  onPress,
  loading,
  testID,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  testID: string;
}): ReactNode {
  return (
    <Button
      variant="outline"
      compact
      label={label}
      loading={loading}
      onPress={onPress}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  facts: { gap: space[2] },
  fact: { flexDirection: "row", gap: space[3] },
  label: { width: 112, paddingTop: 2 },
  fill: { flex: 1 },
});
