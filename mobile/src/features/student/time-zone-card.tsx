import { Globe } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { setTimeZone } from "@/api/portal-own";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Card, Divider } from "@/components/surface";
import { Text } from "@/components/text";
import { APP_TIME_ZONE, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import ZONES from "@/lib/time-zone-names.json";
import { sameClock, timeZoneLabel } from "@kampus/lib/time-zones";

/** Zones listed under the search box at once. */
const MATCHES = 6;

/** The zone this phone or tablet is set to, when it says. */
function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "new york" finds "America/New_York". */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();

/**
 * "Your time zone" on the student's Schedule page (A-216, the site's A-177).
 * A student abroad takes the zone their device reports, or finds their city;
 * lesson times in the app, on their page and in reminders then follow it.
 */
export function TimeZoneCard({
  token,
  timeZone,
  onSaved,
}: {
  token: string;
  /** The zone in use; null while the student keeps the centre's time. */
  timeZone: string | null;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const device = deviceZone();
  // Offered only when the device's clock differs from the one in use: a phone in
  // Uzbekistan often says Asia/Samarkand, which is the centre's time already.
  const deviceDiffers = device !== null && !sameClock(device, timeZone ?? APP_TIME_ZONE);
  const wanted = plain(search);
  const matches =
    wanted.length < 2
      ? []
      : (ZONES as string[]).filter((zone) => plain(zone).includes(wanted)).slice(0, MATCHES);

  const save = (next: string | null) => {
    setBusy(true);
    setProblem(null);
    setTimeZone(token, next)
      .then(() => {
        setSearch("");
        onSaved();
      })
      .catch(() => setProblem(t("portal.timeZone.invalid")))
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="time-zone">
      <View style={styles.heading}>
        <Globe size={18} color={colors.primary} />
        <Text variant="heading" style={styles.fill}>
          {t("portal.timeZone.title")}
        </Text>
      </View>
      <Text variant="small" tone="mutedForeground" testID="time-zone-current">
        {timeZone
          ? t("portal.timeZone.current", {
              zone: timeZoneLabel(timeZone),
              centre: timeZoneLabel(APP_TIME_ZONE),
            })
          : t("portal.timeZone.centre", { centre: timeZoneLabel(APP_TIME_ZONE) })}
      </Text>
      {deviceDiffers ? (
        <Button
          variant="outline"
          label={t("portal.timeZone.useDevice", { zone: device })}
          disabled={busy}
          onPress={() => save(device)}
          testID="time-zone-device"
        />
      ) : null}
      <Field
        label={t("mobile.timeZone.search")}
        value={search}
        onChangeText={setSearch}
        placeholder="Berlin"
        autoCapitalize="none"
        autoCorrect={false}
        testID="time-zone-search"
      />
      {matches.length > 0 ? (
        <View style={[styles.list, { borderColor: colors.input }]}>
          {matches.map((zone, index) => (
            <View key={zone}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => save(zone)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={zone}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
                testID={`time-zone-pick-${zone}`}
              >
                <Text>{timeZoneLabel(zone)}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : wanted.length >= 2 ? (
        <Text variant="small" tone="mutedForeground" testID="time-zone-none">
          {t("mobile.timeZone.none")}
        </Text>
      ) : null}
      {timeZone ? (
        <Button
          variant="ghost"
          label={t("mobile.timeZone.useCentre")}
          disabled={busy}
          onPress={() => save(null)}
          style={styles.start}
          testID="time-zone-centre"
        />
      ) : null}
      {problem ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  heading: { flexDirection: "row", alignItems: "center", gap: space[2] },
  list: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  row: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[3] },
  start: { alignSelf: "flex-start" },
});
