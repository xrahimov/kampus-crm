import { StyleSheet, View } from "react-native";

import { useCancelTrial, useLeadContacts, useLeadTrials, type Lead } from "@/api/leads";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { Badge, Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * A lead's history (A-232): its trial lessons with how each ended (a booked
 * one can be cancelled here), then every call, message, visit and note,
 * newest first.
 */
export function LeadHistorySheet({
  open,
  onClose,
  lead,
  canChange,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  canChange: boolean;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const date = useDate();
  const contacts = useLeadContacts(open ? lead.id : null);
  const trials = useLeadTrials(open ? lead.id : null);
  const cancel = useCancelTrial();
  const problem = contacts.error ?? trials.error ?? cancel.error;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tl("history.title", { name: lead.fullName })}
      testID="lead-history"
    >
      <View style={styles.column}>
        {problem ? <Notice tone="destructive">{errorText(t, problem)}</Notice> : null}
        {trials.data && trials.data.length > 0 ? (
          <View style={styles.column} testID="lead-trials">
            <Text variant="heading">{tl("trial.list")}</Text>
            {trials.data.map((trial) => (
              <View key={trial.id} style={styles.entry} testID={`trial-${trial.id}`}>
                <View style={styles.line}>
                  <Text variant="bodyStrong" style={styles.fill}>
                    {date(dayAsDate(trial.date.slice(0, 10)), { dateStyle: "medium" })}
                    {trial.startTime ? `, ${trial.startTime}` : ""}
                  </Text>
                  <Badge
                    label={tl(`trial.statuses.${trial.status}`)}
                    tone={
                      trial.status === "BOOKED"
                        ? "accent"
                        : trial.status === "ATTENDED" || trial.status === "CONVERTED"
                          ? "success"
                          : "neutral"
                    }
                  />
                </View>
                <Text variant="small" tone="mutedForeground">
                  {trial.groupName} · {trial.courseName}
                </Text>
                {trial.note ? <Text variant="small">{trial.note}</Text> : null}
                {trial.status === "BOOKED" && canChange ? (
                  <Button
                    variant="outline"
                    compact
                    label={tl("trial.cancel")}
                    loading={cancel.isPending && cancel.variables === trial.id}
                    onPress={() => cancel.mutate(trial.id)}
                    style={styles.start}
                    testID={`trial-cancel-${trial.id}`}
                  />
                ) : null}
              </View>
            ))}
            <Divider />
          </View>
        ) : null}
        {!contacts.data ? (
          contacts.error ? null : (
            <Loading />
          )
        ) : contacts.data.length === 0 ? (
          <Text tone="mutedForeground" testID="lead-history-empty">
            {tl("history.empty")}
          </Text>
        ) : (
          contacts.data.map((c) => (
            <View key={c.id} style={styles.entry} testID={`contact-${c.id}`}>
              <View style={styles.line}>
                <Text variant="bodyStrong" style={styles.fill}>
                  {tl(`channels.${c.channel}`)}
                  {c.outcome ? `: ${tl(`outcomes.${c.outcome}`)}` : ""}
                </Text>
              </View>
              {c.note ? <Text>{c.note}</Text> : null}
              <Text variant="small" tone="mutedForeground">
                {date(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {c.createdBy ? `, ${tl("calls.by", { name: c.createdBy })}` : ""}
                {c.nextContactAt
                  ? `, ${tl("history.next", {
                      date: date(dayAsDate(c.nextContactAt.slice(0, 10)), { dateStyle: "medium" }),
                    })}`
                  : ""}
              </Text>
            </View>
          ))
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[3] },
  entry: { gap: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
});
