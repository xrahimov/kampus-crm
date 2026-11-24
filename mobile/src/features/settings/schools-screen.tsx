import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDeleteSchool, useSaveSchool, useSchools, type School } from "@/api/office-settings";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { RowPress } from "./parts";

/**
 * Schools (A-242): the site's Settings → Schools. The schools the centre's
 * students go to, by name, each with how many students name it; a press opens
 * one to rename or delete.
 */
export function SchoolsScreen() {
  const t = useTranslations();
  const tr = useTranslations("settings.schools");
  const { colors } = useTheme();
  const query = useSchools();
  const [form, setForm] = useState<School | "new" | null>(null);
  const [shown, setShown] = useState<School | "new">("new");
  const openForm = (next: School | "new") => {
    setShown(next);
    setForm(next);
  };

  const header = (
    <Header
      back
      title={tr("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tr("add")}
          onPress={() => openForm("new")}
          testID="schools-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.pages.flatMap((page) => page.items);

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <Card style={styles.flush} testID="schools-list">
          {rows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <RowPress
                onPress={() => openForm(row)}
                accessibilityLabel={`${row.name}. ${tr("studentsCount")}: ${row.studentsCount}`}
                testID={`school-${row.id}`}
              >
                <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                  {row.name}
                </Text>
                <Text variant="small" tone="mutedForeground" style={styles.number}>
                  {tr("studentsCount")}: {row.studentsCount}
                </Text>
              </RowPress>
            </View>
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          testID="schools-more"
        />
      ) : null}
      <SchoolSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        school={shown === "new" ? undefined : shown}
      />
    </Screen>
  );
}

function SchoolSheet({
  open,
  onClose,
  school,
}: {
  open: boolean;
  onClose: () => void;
  school?: School;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.schools");
  const save = useSaveSchool(school?.id ?? null);
  const remove = useDeleteSchool();
  const [name, setName] = useState(school?.name ?? "");
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(school?.name ?? "");
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);

  const submit = () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    save.mutate({ name: name.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={school ? tr("edit") : tr("add")}
        testID="school-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="school-save"
            />
            {school ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="school-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="school-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          <Field
            label={tr("name")}
            value={name}
            onChangeText={setName}
            maxLength={120}
            error={
              fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)
            }
            testID="school-name"
          />
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", { name: school?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!school) return;
          remove.mutate(school.id, {
            onSuccess: () => {
              setDeleting(false);
              onClose();
            },
          });
        }}
        testID="school-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  number: { fontVariant: ["tabular-nums"] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
