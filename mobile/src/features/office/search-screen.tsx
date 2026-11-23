import { useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useSearch } from "@/api/office";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Avatar, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { useOpenPath } from "./site-paths";

/** How long the typing rests before the server is asked. */
const SEARCH_REST_MS = 300;

/**
 * The search over everything (A-230), as the box on top of the site: a few
 * letters of a name or a phone number find students, groups and leads the
 * person may see. Students and groups open in the app; leads open on the site
 * until the app has them.
 */
export function SearchScreen() {
  const t = useTranslations();
  const tm = useTranslations("mobile.office");
  const router = useRouter();
  const { open, error: openError } = useOpenPath();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_REST_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const query = useSearch(q);
  const found = q.length >= 2 ? query.data : undefined;
  const nothing = found && found.students.length + found.groups.length + found.leads.length === 0;

  return (
    <Screen header={<Header title={tm("searchTitle")} back />} contentStyle={styles.column}>
      <Field
        label={tm("searchLabel")}
        value={typed}
        onChangeText={setTyped}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="search-field"
      />
      {openError ? <Notice tone="destructive">{openError}</Notice> : null}
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {q.length < 2 ? (
        <Text variant="small" tone="mutedForeground">
          {tm("searchHint")}
        </Text>
      ) : nothing ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : null}
      {found && found.students.length > 0 ? (
        <Section title={t("nav.students")} testID="found-students">
          {found.students.map((s) => (
            <Hit
              key={s.id}
              title={s.fullName}
              note={[s.phone, ...s.groups].filter(Boolean).join(", ")}
              avatar
              onPress={() => router.push({ pathname: "/staff/student/[id]", params: { id: s.id } })}
              testID={`found-student-${s.id}`}
            />
          ))}
        </Section>
      ) : null}
      {found && found.groups.length > 0 ? (
        <Section title={t("nav.groups")} testID="found-groups">
          {found.groups.map((g) => (
            <Hit
              key={g.id}
              title={g.name}
              note={[g.courseName, g.teacherName].filter(Boolean).join(", ")}
              onPress={() => router.push({ pathname: "/staff/group/[id]", params: { id: g.id } })}
              testID={`found-group-${g.id}`}
            />
          ))}
        </Section>
      ) : null}
      {found && found.leads.length > 0 ? (
        <Section title={t("nav.leads")} testID="found-leads">
          {found.leads.map((l) => (
            <Hit
              key={l.id}
              title={l.fullName}
              note={[l.phone, l.columnName].filter(Boolean).join(", ")}
              avatar
              onSite
              onPress={() =>
                open(`/leads?boardId=${l.boardId}&q=${encodeURIComponent(l.fullName)}`)
              }
              testID={`found-lead-${l.id}`}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode[];
  testID: string;
}) {
  return (
    <View style={styles.section}>
      <Text variant="smallStrong" tone="mutedForeground">
        {title}
      </Text>
      <Card style={styles.flush} testID={testID}>
        {children.map((child, index) => (
          <View key={index}>
            {index > 0 ? <Divider /> : null}
            {child}
          </View>
        ))}
      </Card>
    </View>
  );
}

function Hit({
  title,
  note,
  avatar = false,
  onSite = false,
  onPress,
  testID,
}: {
  title: string;
  note: string;
  avatar?: boolean;
  /** Opens on the site: the app does not have this page yet. */
  onSite?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={testID}
    >
      {avatar ? <Avatar name={title} /> : null}
      <View style={styles.fill}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {note ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      {onSite ? <ExternalLink size={16} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4] },
  section: { gap: space[2] },
  flush: { padding: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
  },
});
