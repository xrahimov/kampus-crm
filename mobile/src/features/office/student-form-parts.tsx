import { timeZoneLabel } from "@kampus/lib/time-zones";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useStudentSearch } from "@/api/office-follow-up";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Divider } from "@/components/surface";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { space, useTheme } from "@/lib/theme";
import ZONES from "@/lib/time-zone-names.json";

/*
 * Two fields of the student form that choose from a list too long for a
 * drop-down (A-265): another student, found by name or phone, and a time zone,
 * found by its city. Each shows what was chosen with a way to change it.
 */

/** Zones listed under the search box at once. */
const MATCHES = 6;

/** "new york" finds "America/New_York". */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();

export interface PickedStudent {
  id: string;
  fullName: string;
}

/** The student who brought this one (A-120): typed two letters of, then picked. */
export function StudentPickField({
  label,
  value,
  onChange,
  exceptId,
  active,
  error,
  testID,
}: {
  label: string;
  value: PickedStudent | null;
  onChange: (student: PickedStudent | null) => void;
  /** Not offered: the student the form is about. */
  exceptId?: string;
  /** False while the form is closed, so nothing is asked for. */
  active: boolean;
  error?: string | null;
  testID: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const rested = useRested(search.trim());
  const found = useStudentSearch(rested, active && !value);
  const others =
    rested.length < 2 ? [] : (found.data?.items ?? []).filter((s) => s.id !== exceptId);

  if (value) {
    return (
      <View style={styles.tight}>
        <Text variant="smallStrong">{label}</Text>
        <View style={[styles.picked, { borderColor: colors.border }]} testID={`${testID}-picked`}>
          <Text variant="bodyStrong" style={styles.fill}>
            {value.fullName}
          </Text>
          <Button
            variant="ghost"
            compact
            label={t("common.remove")}
            onPress={() => {
              setSearch("");
              onChange(null);
            }}
            testID={`${testID}-clear`}
          />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.tight}>
      <Field
        label={label}
        value={search}
        onChangeText={setSearch}
        hint={t("groups.members.searchHint")}
        autoCorrect={false}
        error={error}
        testID={`${testID}-search`}
      />
      {others.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onChange({ id: s.id, fullName: s.fullName })}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.found,
            { borderColor: colors.border },
            pressed ? { backgroundColor: colors.muted } : null,
          ]}
          testID={`${testID}-found-${s.id}`}
        >
          <Text variant="bodyStrong">{s.fullName}</Text>
          {s.phone ? (
            <Text variant="small" tone="mutedForeground">
              {s.phone}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The zone of a student abroad (A-177): found by its city; none means the centre's own time. */
export function TimeZoneField({
  label,
  hint,
  value,
  onChange,
  error,
  testID,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (zone: string | null) => void;
  error?: string | null;
  testID: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const wanted = plain(search);
  const matches =
    wanted.length < 2
      ? []
      : (ZONES as string[]).filter((zone) => plain(zone).includes(wanted)).slice(0, MATCHES);

  if (value) {
    return (
      <View style={styles.tight}>
        <Text variant="smallStrong">{label}</Text>
        <View style={[styles.picked, { borderColor: colors.border }]} testID={`${testID}-picked`}>
          <Text variant="bodyStrong" style={styles.fill}>
            {timeZoneLabel(value)}
          </Text>
          <Button
            variant="ghost"
            compact
            label={t("mobile.timeZone.useCentre")}
            onPress={() => {
              setSearch("");
              onChange(null);
            }}
            testID={`${testID}-clear`}
          />
        </View>
        {error ? (
          <Text variant="small" tone="destructive">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.tight}>
      <Field
        label={label}
        value={search}
        onChangeText={setSearch}
        placeholder="Berlin"
        hint={hint}
        autoCapitalize="none"
        autoCorrect={false}
        error={error}
        testID={`${testID}-search`}
      />
      {matches.length > 0 ? (
        <View style={[styles.list, { borderColor: colors.input }]}>
          {matches.map((zone, index) => (
            <View key={zone}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => {
                  setSearch("");
                  onChange(zone);
                }}
                accessibilityRole="button"
                accessibilityLabel={zone}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
                testID={`${testID}-pick-${zone}`}
              >
                <Text>{timeZoneLabel(zone)}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : wanted.length >= 2 ? (
        <Text variant="small" tone="mutedForeground" testID={`${testID}-none`}>
          {t("mobile.timeZone.none")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tight: { gap: space[2] },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: space[3],
    paddingRight: space[1],
    minHeight: 48,
  },
  found: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: 44,
    justifyContent: "center",
  },
  list: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  row: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[3] },
});
