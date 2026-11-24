import { Download, Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  SMS_MAX_LENGTH,
  SMS_VARIABLES,
  useImportSmsTemplates,
  useSmsCategories,
  useSmsStep,
  useSmsTemplateRows,
  type SmsCategory,
  type SmsTemplateRow,
} from "@/api/office-settings";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { smsParts } from "@/lib/sms-parts";
import { space, useTheme } from "@/lib/theme";

import { Bin, RowPress } from "./parts";

/**
 * SMS templates (A-242): the site's Settings → SMS templates. The ready texts
 * the Send SMS sheet offers, under their categories. A press opens a template
 * to change or delete; an empty category can be deleted; the SMS provider's
 * own templates are copied into the first category.
 */
export function SmsTemplatesScreen() {
  const t = useTranslations();
  const tr = useTranslations("sms.templates");
  const { colors } = useTheme();
  const categories = useSmsCategories();
  const templates = useSmsTemplateRows();
  const step = useSmsStep();
  const importing = useImportSmsTemplates();
  const [form, setForm] = useState<SmsTemplateRow | "new" | null>(null);
  const [shown, setShown] = useState<SmsTemplateRow | "new">("new");
  const [addingCategory, setAddingCategory] = useState(false);
  const [removing, setRemoving] = useState<SmsCategory | null>(null);
  const [needsCategory, setNeedsCategory] = useState(false);
  const openForm = (next: SmsTemplateRow | "new") => {
    setShown(next);
    setForm(next);
  };

  const none = !categories.data || categories.data.length === 0;
  const header = (
    <Header
      back
      title={tr("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tr("addTemplate")}
          disabled={none}
          onPress={() => openForm("new")}
          testID="sms-template-add"
        />
      }
    />
  );
  if (!categories.data) return <PendingScreen header={header} query={categories} />;
  if (!templates.data) return <PendingScreen header={header} query={templates} />;
  const groups = categories.data.map((category) => ({
    category,
    rows: templates.data.filter((row) => row.categoryId === category.id),
  }));
  const first = categories.data[0];

  const importFromProvider = () => {
    setNeedsCategory(!first);
    importing.reset();
    if (first) importing.mutate(first.id);
  };
  const reload = () => {
    void categories.refetch();
    void templates.refetch();
  };

  return (
    <Screen
      header={header}
      onRefresh={reload}
      refreshing={categories.isRefetching || templates.isRefetching}
    >
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      <View style={styles.actions}>
        <Button
          compact
          variant="outline"
          icon={<Plus size={16} color={colors.foreground} />}
          label={tr("addCategory")}
          onPress={() => setAddingCategory(true)}
          testID="sms-category-add"
        />
        <Button
          compact
          variant="outline"
          icon={<Download size={16} color={colors.foreground} />}
          label={tr("import")}
          loading={importing.isPending}
          onPress={importFromProvider}
          testID="sms-import"
        />
      </View>
      {needsCategory ? (
        <Notice tone="destructive" testID="sms-import-problem">
          {tr("importNeedsCategory")}
        </Notice>
      ) : importing.error ? (
        <Notice tone="destructive" testID="sms-import-problem">
          {errorText(t, importing.error)}
        </Notice>
      ) : importing.data && first ? (
        <Notice tone="success" testID="sms-imported">
          {tr("imported", {
            count: importing.data.imported,
            category: first.name,
            adapter: importing.data.adapter,
          })}
        </Notice>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState title={tr("empty")} text={tr("emptyHint")} />
      ) : (
        groups.map(({ category, rows }) => (
          <Card key={category.id} style={styles.flush} testID={`sms-category-${category.id}`}>
            <View style={[styles.head, { backgroundColor: colors.muted }]}>
              <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                {category.name}{" "}
                <Text variant="small" tone="mutedForeground">
                  ({category.templatesCount})
                </Text>
              </Text>
              {rows.length === 0 ? (
                <Bin
                  label={`${t("common.delete")}: ${category.name}`}
                  onPress={() => {
                    step.reset();
                    setRemoving(category);
                  }}
                  testID={`sms-category-remove-${category.id}`}
                />
              ) : null}
            </View>
            {rows.map((row) => (
              <View key={row.id}>
                <Divider />
                <RowPress onPress={() => openForm(row)} testID={`sms-template-${row.id}`}>
                  <View style={styles.text}>
                    <Text numberOfLines={6}>{row.text}</Text>
                    {row.imported ? <Badge label={tr("importedBadge")} /> : null}
                  </View>
                </RowPress>
              </View>
            ))}
          </Card>
        ))
      )}
      <TemplateSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        template={shown === "new" ? undefined : shown}
        categories={categories.data}
      />
      <CategorySheet open={addingCategory} onClose={() => setAddingCategory(false)} />
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tr("deleteCategory")}
        text={removing?.name ?? ""}
        label={t("common.delete")}
        destructive
        loading={step.isPending}
        problem={step.error ? errorText(t, step.error) : null}
        onConfirm={() => {
          if (!removing) return;
          step.mutate(
            { do: "removeCategory", id: removing.id },
            { onSuccess: () => setRemoving(null) },
          );
        }}
        testID="sms-category-delete"
      />
    </Screen>
  );
}

function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const tr = useTranslations("sms.templates");
  const step = useSmsStep();
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setMissing(false);
      step.reset();
    }
  }
  const fieldError = fieldErrorOf(t, step.error);
  const submit = () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    step.mutate({ do: "addCategory", name: name.trim() }, { onSuccess: onClose });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr("addCategory")}
      testID="sms-category-form"
      footer={
        <Button
          label={t("common.save")}
          loading={step.isPending}
          onPress={submit}
          testID="sms-category-save"
        />
      }
    >
      <View style={styles.form}>
        {step.error && !hasFieldErrors(step.error) ? (
          <Notice tone="destructive" testID="sms-category-problem">
            {errorText(t, step.error)}
          </Notice>
        ) : null}
        <Field
          label={tr("categoryName")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)}
          testID="sms-category-name"
        />
      </View>
    </Sheet>
  );
}

function TemplateSheet({
  open,
  onClose,
  template,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  template?: SmsTemplateRow;
  categories: SmsCategory[];
}) {
  const t = useTranslations();
  const tr = useTranslations("sms.templates");
  const tv = useTranslations("sms.variables");
  const ts = useTranslations("sms.send");
  const step = useSmsStep();
  const remove = useSmsStep();
  const firstCategory = categories[0]?.id ?? null;
  const [categoryId, setCategoryId] = useState<string | null>(
    template?.categoryId ?? firstCategory,
  );
  const [text, setText] = useState(template?.text ?? "");
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategoryId(template?.categoryId ?? firstCategory);
      setText(template?.text ?? "");
      setMissing(false);
      step.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, step.error);
  const { chars, parts } = smsParts(text);

  const submit = () => {
    if (!categoryId || !text.trim()) {
      setMissing(true);
      return;
    }
    step.mutate(
      { do: "saveTemplate", id: template?.id ?? null, input: { categoryId, text: text.trim() } },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={template ? tr("editTemplate") : tr("addTemplate")}
        testID="sms-template-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={step.isPending}
              onPress={submit}
              testID="sms-template-save"
            />
            {template ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="sms-template-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {step.error && !hasFieldErrors(step.error) ? (
            <Notice tone="destructive" testID="sms-template-problem">
              {errorText(t, step.error)}
            </Notice>
          ) : null}
          <Select
            label={tr("columns.category")}
            value={categoryId}
            onChange={(id) => {
              if (id) setCategoryId(id);
            }}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            error={
              fieldError("categoryId") ?? (missing && !categoryId ? t("validation.required") : null)
            }
            testID="sms-template-category"
          />
          <Field
            label={tr("columns.text")}
            value={text}
            onChangeText={setText}
            multiline
            style={styles.message}
            maxLength={SMS_MAX_LENGTH}
            hint={ts("counter", { chars, parts })}
            error={
              fieldError("text") ?? (missing && !text.trim() ? t("validation.required") : null)
            }
            testID="sms-template-text"
          />
          <View style={styles.tight}>
            <Text variant="small" tone="mutedForeground">
              {t("mobile.settingsPages.variablesHint")}
            </Text>
            <View style={styles.actions}>
              {SMS_VARIABLES.map((name) => (
                <Button
                  key={name}
                  compact
                  variant="outline"
                  label={tv(name)}
                  onPress={() => setText((now) => `${now}{${name}}`.slice(0, SMS_MAX_LENGTH))}
                  testID={`sms-variable-${name}`}
                />
              ))}
            </View>
          </View>
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteTemplate")}
        text={template?.text ?? ""}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!template) return;
          remove.mutate(
            { do: "removeTemplate", id: template.id },
            {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            },
          );
        }}
        testID="sms-template-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    minHeight: 44,
  },
  text: { flex: 1, gap: space[1], alignItems: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  form: { gap: space[4] },
  tight: { gap: space[2] },
  footer: { gap: space[2] },
  // Room for a whole message: a field of one line cuts a long text off.
  message: { minHeight: 120, textAlignVertical: "top" },
});
