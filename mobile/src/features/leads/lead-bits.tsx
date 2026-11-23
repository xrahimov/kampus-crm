import { Pressable, StyleSheet, View } from "react-native";

import type { Lead, LeadStatus, LeadTemperature } from "@/api/leads";
import { Badge, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

export const STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "accent",
  CONTACTED: "success",
  UNREACHABLE: "warning",
  LOST: "destructive",
};

export const TEMPERATURE_TONE: Record<LeadTemperature, Tone> = {
  HOT: "destructive",
  WARM: "warning",
  COLD: "neutral",
};

/** Whole days from `from` to `to`, both ISO days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayAsDate(to).getTime() - dayAsDate(from).getTime()) / 86_400_000);
}

/**
 * What a lead's card says at a glance: its status, how warm it is, whether a
 * call is due (judged against the centre's day, `today`) and its trial lesson.
 */
export function LeadBadges({ lead, today }: { lead: Lead; today: string }) {
  const t = useTranslations("leads");
  const date = useDate();
  const next = lead.nextContactAt?.slice(0, 10) ?? null;
  const late = next && !lead.isArchived ? daysBetween(next, today) : null;
  return (
    <View style={styles.badges}>
      <Badge label={t(`statuses.${lead.status}`)} tone={STATUS_TONE[lead.status]} />
      {lead.temperature ? (
        <Badge
          label={t(`temperatures.${lead.temperature}`)}
          tone={TEMPERATURE_TONE[lead.temperature]}
        />
      ) : null}
      {late !== null && late > 0 ? (
        <Badge
          label={t("followUp.overdue", { count: late })}
          tone="destructive"
          testID={`lead-overdue-${lead.id}`}
        />
      ) : late === 0 ? (
        <Badge label={t("followUp.today")} tone="warning" testID={`lead-due-${lead.id}`} />
      ) : next && late !== null ? (
        <Badge label={date(dayAsDate(next), { day: "numeric", month: "short" })} />
      ) : null}
      {lead.trial ? (
        <Badge
          label={t(`trial.badge.${lead.trial.status}`, {
            date: date(dayAsDate(lead.trial.date.slice(0, 10)), { day: "numeric", month: "short" }),
          })}
          tone={
            lead.trial.status === "NO_SHOW" || lead.trial.status === "CANCELLED"
              ? "neutral"
              : "accent"
          }
        />
      ) : null}
      {lead.isArchived ? <Badge label={t("filters.archive")} /> : null}
    </View>
  );
}

/** One lead in a list: the name, the first phone, who works it and the badges. */
export function LeadRow({
  lead,
  today,
  note,
  onPress,
}: {
  lead: Lead;
  today: string;
  /** A line under the phone: the column on the calls list, the owner on the board. */
  note?: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`lead-${lead.id}`}
    >
      <Text variant="bodyStrong">{lead.fullName}</Text>
      {lead.phones[0] ? (
        <Text variant="small" tone="mutedForeground">
          {lead.phones[0]}
          {lead.phones.length > 1 ? ` +${lead.phones.length - 1}` : ""}
        </Text>
      ) : null}
      {note ? (
        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
          {note}
        </Text>
      ) : null}
      <LeadBadges lead={lead} today={today} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  row: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 2 },
});
