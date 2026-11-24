import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { JOIN_STATUSES, type JoinStatus } from "@/api/leads";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * Into which group, from which day and as what: the last step of a lead
 * becoming a student, and of someone leaving the waiting list for a group.
 */
export function JoinGroupSheet({
  open,
  onClose,
  title,
  hint,
  groups,
  saving,
  error,
  onSave,
  initialStatus = "NEW",
  testID = "join-group",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  groups: Array<{ id: string; name: string }>;
  saving: boolean;
  error: unknown;
  onSave: (input: { groupId: string; joinedAt: string; status: JoinStatus }) => void;
  /** What the sheet opens on: New for a lead, Active for someone who is a student already. */
  initialStatus?: JoinStatus;
  testID?: string;
}) {
  const t = useTranslations();
  const ta = useTranslations("leads.addToGroup");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(centreToday());
  const [status, setStatus] = useState<JoinStatus>(initialStatus);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId(null);
      setJoinedAt(centreToday());
      setStatus(initialStatus);
      setMissing(false);
    }
  }
  const fieldError = fieldErrorOf(t, error);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <Button
          label={t("common.save")}
          loading={saving}
          onPress={() => {
            if (!groupId || !joinedAt) {
              setMissing(true);
              return;
            }
            setMissing(false);
            onSave({ groupId, joinedAt, status });
          }}
          testID={`${testID}-save`}
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{hint}</Text>
        <Select
          label={ta("group")}
          value={groupId}
          onChange={setGroupId}
          placeholder={ta("groupPlaceholder")}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          error={fieldError("groupId") ?? (missing && !groupId ? t("validation.required") : null)}
          testID={`${testID}-group`}
        />
        <DateField
          label={ta("joinedAt")}
          value={joinedAt}
          onChange={setJoinedAt}
          error={fieldError("joinedAt") ?? (missing && !joinedAt ? t("validation.date") : null)}
          testID={`${testID}-day`}
        />
        <Select
          label={ta("status")}
          value={status}
          onChange={(value) => setStatus(value ?? initialStatus)}
          options={JOIN_STATUSES.map((s) => ({ value: s, label: t(`groups.memberStatuses.${s}`) }))}
          testID={`${testID}-status`}
        />
        {error && !hasFieldErrors(error) ? (
          <Notice tone="destructive" testID={`${testID}-problem`}>
            {errorText(t, error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
});
