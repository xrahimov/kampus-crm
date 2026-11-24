import { MessageSquare, Phone } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useStartCall,
  useStudentCalls,
  useStudentHistory,
  useStudentSms,
  type CallStatus,
  type SmsStatus,
} from "@/api/office-student-page";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Badge, Card, Divider, Loading, Notice, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { SendSmsSheet } from "./sms-sheet";

const SMS_TONE: Record<SmsStatus, Tone> = {
  QUEUED: "neutral",
  SENT: "success",
  FAILED: "destructive",
};

const CALL_TONE: Record<CallStatus, Tone> = {
  ANSWERED: "success",
  MISSED: "destructive",
  BUSY: "neutral",
  FAILED: "neutral",
};

/** A call's length as the site writes it: minutes and seconds. */
export function callLength(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The SMS sent to a student and their parents (A-240), newest first, and
 * "Send SMS" for people who may send them.
 */
export function StudentSms({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const ts = useTranslations("sms");
  const me = useMe();
  const { colors } = useTheme();
  const formatDate = useDate();
  const query = useStudentSms(student.id, true);
  const [writing, setWriting] = useState(false);
  const maySend = can(me, "sms.send") && !student.isArchived;
  return (
    <View style={styles.block} testID="student-sms">
      {maySend ? (
        <>
          <Button
            variant="outline"
            label={ts("send.button")}
            icon={<MessageSquare size={16} color={colors.foreground} />}
            disabled={!student.phone}
            onPress={() => setWriting(true)}
            style={styles.start}
            testID="student-sms-send"
          />
          {!student.phone ? (
            <Text variant="small" tone="mutedForeground" testID="student-sms-no-phone">
              {ts("studentTab.noPhone")}
            </Text>
          ) : null}
        </>
      ) : null}
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {query.data?.length === 0 ? (
        <Text tone="mutedForeground" testID="student-sms-empty">
          {ts("studentTab.empty")}
        </Text>
      ) : null}
      {query.data?.map((message) => (
        <Card key={message.id} testID={`student-sms-${message.id}`}>
          <View style={styles.line}>
            <Text variant="smallStrong" style={styles.fill}>
              {formatDate(new Date(message.createdAt), { dateStyle: "medium", timeStyle: "short" })}
            </Text>
            <Badge tone={SMS_TONE[message.status]} label={ts(`statuses.${message.status}`)} />
          </View>
          <Text>{message.text}</Text>
          <Text variant="small" tone="mutedForeground">
            {[
              `${ts(`recipientTypes.${message.recipientType}`)} ${message.phone}`,
              message.sentByName ?? ts("log.system"),
              message.event && t.has(`sms.autoEvents.${message.event}`)
                ? ts(`autoEvents.${message.event}`)
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </Card>
      ))}
      <SendSmsSheet
        open={writing}
        onClose={() => setWriting(false)}
        target={{ kind: "student", studentId: student.id }}
        title={ts("send.toStudent", { name: student.fullName })}
        testID="student-sms-sheet"
      />
    </View>
  );
}

/**
 * A student's calls (A-240): the ones the centre's telephony recorded, and
 * "Call", which rings through that telephony so the call is recorded too. The
 * phone's own dialler is the Call button next to the number on the card.
 */
export function StudentCalls({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const tc = useTranslations("calls");
  const { colors } = useTheme();
  const formatDate = useDate();
  const query = useStudentCalls(student.id, true);
  const call = useStartCall(student.id);
  return (
    <View style={styles.block} testID="student-calls">
      <Button
        variant="outline"
        label={tc("call")}
        icon={<Phone size={16} color={colors.foreground} />}
        disabled={!student.phone}
        loading={call.isPending}
        onPress={() => {
          if (student.phone) call.mutate(student.phone);
        }}
        style={styles.start}
        testID="student-calls-call"
      />
      {call.data ? (
        <Notice tone="success" testID="student-calls-started">
          {call.data.adapter === "fake" ? tc("startedFake") : tc("started")}
        </Notice>
      ) : null}
      {call.error ? (
        <Notice tone="destructive" testID="student-calls-problem">
          {errorText(t, call.error)}
        </Notice>
      ) : null}
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {query.data?.length === 0 ? (
        <Text tone="mutedForeground" testID="student-calls-empty">
          {tc("studentTab.empty")}
        </Text>
      ) : null}
      {query.data && query.data.length > 0 ? (
        <Card style={styles.flush}>
          {query.data.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`student-call-${row.id}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong">
                    {formatDate(new Date(row.startedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {[
                      tc(`directions.${row.direction}`),
                      row.direction === "INBOUND" ? row.fromPhone : row.toPhone,
                      row.staffName,
                      callLength(row.durationSeconds),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                </View>
                <Badge tone={CALL_TONE[row.status]} label={tc(`statuses.${row.status}`)} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** What a history row carries besides its name, as short "name: value" words. */
function detailWords(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
}

/**
 * What was done with the student's record (A-240), newest first: added to a
 * group, a payment, a discount, a change of the card, with who did it.
 */
export function StudentHistory({ id }: { id: string }) {
  const t = useTranslations();
  const formatDate = useDate();
  const query = useStudentHistory(id, true);
  if (query.error && !query.data) {
    return <Notice tone="destructive">{errorText(t, query.error)}</Notice>;
  }
  if (!query.data) return <Loading />;
  const rows = query.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) {
    return (
      <Text tone="mutedForeground" testID="student-history-empty">
        {t("students.history.empty")}
      </Text>
    );
  }
  return (
    <View style={styles.block} testID="student-history">
      <Card style={styles.flush}>
        {rows.map((row, index) => {
          const key = `students.history.actions.${row.action}`;
          const details = detailWords(row.details);
          return (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.stack} testID={`student-history-${row.id}`}>
                <Text variant="bodyStrong">{t.has(key) ? t(key) : row.action}</Text>
                {details ? (
                  <Text variant="small" tone="mutedForeground">
                    {details}
                  </Text>
                ) : null}
                <Text variant="small" tone="mutedForeground">
                  {[
                    formatDate(new Date(row.at), { dateStyle: "medium", timeStyle: "short" }),
                    row.actorName,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="student-history-more"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[3] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  flush: { padding: 0, gap: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  stack: { gap: space[1], paddingHorizontal: space[4], paddingVertical: space[3] },
});
