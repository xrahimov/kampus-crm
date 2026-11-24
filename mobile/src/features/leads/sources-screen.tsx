import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDeleteSource, useSaveSource, useSources, type LeadSource } from "@/api/leads";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Badge, Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * The Sources report (A-258): the site's Leads → Sources. A card per source
 * with the leads it brought in the chosen days and the students who name it.
 * A press opens a source to rename it, switch it off or delete it, and "New
 * source" adds one, for whoever may.
 */
export function SourcesScreen() {
  const t = useTranslations();
  const ts = useTranslations("leads.sourcesPage");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const query = useSources(from, to);
  const mayChange = can(me, "leads.update");
  const mayDelete = can(me, "leads.delete");
  // The source in the form: one to change, "new", or none.
  const [form, setForm] = useState<LeadSource | "new" | null>(null);
  const [shown, setShown] = useState<LeadSource | "new">("new");
  const openForm = (next: LeadSource | "new") => {
    setShown(next);
    setForm(next);
  };

  const header = (
    <Header
      back
      title={ts("title")}
      right={
        mayChange ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={ts("add")}
            onPress={() => openForm("new")}
            testID="sources-add"
          />
        ) : undefined
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const sources = query.data;
  const opens = mayChange || mayDelete;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {ts("description")}
      </Text>
      <View style={styles.days}>
        <View style={styles.fill}>
          <DateField label={ts("from")} value={from} onChange={setFrom} testID="sources-from" />
        </View>
        <View style={styles.fill}>
          <DateField label={ts("to")} value={to} onChange={setTo} testID="sources-to" />
        </View>
      </View>
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {sources.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View
          style={[styles.grid, query.isPlaceholderData ? styles.stale : null]}
          testID="sources-list"
        >
          {sources.map((source) => (
            <View key={source.id} style={wide ? styles.cell : styles.full}>
              <Card
                onPress={opens ? () => openForm(source) : undefined}
                style={[styles.card, source.isActive ? null : styles.off]}
                testID={`source-${source.id}`}
              >
                <View style={styles.fill}>
                  <Text variant="heading" numberOfLines={1}>
                    {source.name}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {ts("students", { count: source.studentCount })}
                  </Text>
                  {source.isActive ? null : (
                    <View style={styles.start}>
                      <Badge label={t("common.inactive")} />
                    </View>
                  )}
                </View>
                <View style={styles.count}>
                  <Text variant="title" style={styles.number} testID={`source-count-${source.id}`}>
                    {source.leadCount}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {ts("leads")}
                  </Text>
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}
      <SourceFormSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        source={shown === "new" ? undefined : shown}
        mayChange={mayChange}
        mayDelete={mayDelete}
      />
    </Screen>
  );
}

function SourceFormSheet({
  open,
  onClose,
  source,
  mayChange,
  mayDelete,
}: {
  open: boolean;
  onClose: () => void;
  source?: LeadSource;
  mayChange: boolean;
  mayDelete: boolean;
}) {
  const t = useTranslations();
  const ts = useTranslations("leads.sourcesPage");
  const save = useSaveSource(source?.id ?? null);
  const remove = useDeleteSource();
  const [name, setName] = useState(source?.name ?? "");
  const [active, setActive] = useState(source?.isActive ?? true);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(source?.name ?? "");
      setActive(source?.isActive ?? true);
      setMissing(false);
      setDeleting(false);
      save.reset();
      remove.reset();
    }
  }

  const submit = () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    save.mutate({ name: name.trim(), isActive: active }, { onSuccess: onClose });
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={source ? ts("edit") : ts("add")}
        testID="source-form"
        footer={
          <View style={styles.footer}>
            {mayChange ? (
              <Button
                label={t("common.save")}
                loading={save.isPending}
                onPress={submit}
                testID="source-save"
              />
            ) : null}
            {source && mayDelete ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="source-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="source-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          <Field
            label={ts("name")}
            value={name}
            onChangeText={setName}
            maxLength={60}
            editable={mayChange}
            error={
              fieldErrorOf(t, save.error)("name") ??
              (missing && !name.trim() ? t("validation.required") : null)
            }
            testID="source-name"
          />
          <Check
            label={t("common.active")}
            value={active}
            onChange={setActive}
            disabled={!mayChange}
            testID="source-active"
          />
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={ts("deleteTitle")}
        text={ts("deleteText", { name: source?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!source) return;
          remove.mutate(source.id, {
            onSuccess: () => {
              setDeleting(false);
              onClose();
            },
          });
        }}
        testID="source-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start", marginTop: space[1] },
  days: { flexDirection: "row", gap: space[3] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", alignItems: "center", gap: space[3] },
  off: { opacity: 0.6 },
  stale: { opacity: 0.6 },
  count: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
