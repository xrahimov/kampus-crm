import { ExternalLink, Plus, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";

import { useLeadOptions } from "@/api/leads";
import { useLeadFormStep, useLeadForms, type LeadForm } from "@/api/office-forms-bot";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { API_ORIGIN } from "@/lib/api";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A name as the last part of an address, the way the site makes it. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Forms (A-247): the site's Settings → Forms. The public web forms that turn
 * visitors into leads: each with the column its leads land in, the source,
 * how many leads came through it and its address. The site copies the address
 * on a click; a phone hands it to its share sheet, and **Open the form**
 * shows the form in the browser. **Edit** opens the form's settings, with
 * Delete under Save.
 */
export function FormsScreen() {
  const t = useTranslations();
  const tf = useTranslations("settings.forms");
  const { colors } = useTheme();
  const { wide } = useLayout();
  const { locale } = useLocaleChoice();
  const query = useLeadForms();
  const [form, setForm] = useState<LeadForm | "new" | null>(null);
  const [shown, setShown] = useState<LeadForm | "new">("new");
  const openForm = (next: LeadForm | "new") => {
    setShown(next);
    setForm(next);
  };
  const path = (one: LeadForm) => `/${locale}/forms/${one.slug}`;

  const header = (
    <Header
      back
      title={tf("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tf("add")}
          onPress={() => openForm("new")}
          testID="forms-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {t("mobile.settingsPages.formsDescription")}
      </Text>
      {query.data.length === 0 ? (
        <View testID="forms-empty">
          <EmptyState title={t("common.nothingFound")} />
        </View>
      ) : (
        <View style={styles.grid} testID="forms-list">
          {query.data.map((one) => (
            <View key={one.id} style={wide ? styles.half : styles.full}>
              <Card style={styles.card} testID={`form-${one.id}`}>
                <View style={styles.name}>
                  <Text variant="heading" style={styles.shrink} numberOfLines={2}>
                    {one.name}
                  </Text>
                  {one.isActive ? null : <Badge label={t("common.inactive")} />}
                </View>
                <Text variant="small" tone="mutedForeground">
                  {[
                    `${tf("column")}: ${one.boardName} · ${one.columnName}`,
                    one.sourceName ? `${tf("source")}: ${one.sourceName}` : null,
                    one.integration ? `${tf("integration")}: ${one.integration}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </Text>
                <Text variant="small" tone="mutedForeground" style={styles.number}>
                  {tf("leadCount")}: {one.leadCount}
                </Text>
                <Text variant="small" selectable testID={`form-link-${one.id}`}>
                  {path(one)}
                </Text>
                <View style={styles.actions}>
                  <Button
                    compact
                    variant="outline"
                    label={t("mobile.studentsPage.shareLink")}
                    icon={<Share2 size={16} color={colors.foreground} />}
                    onPress={() =>
                      void Share.share({ message: `${API_ORIGIN}${path(one)}` }).catch(
                        () => undefined,
                      )
                    }
                    testID={`form-share-${one.id}`}
                  />
                  <Button
                    compact
                    variant="outline"
                    label={tf("open")}
                    icon={<ExternalLink size={16} color={colors.foreground} />}
                    onPress={() =>
                      void Linking.openURL(`${API_ORIGIN}${path(one)}`).catch(() => undefined)
                    }
                    testID={`form-open-${one.id}`}
                  />
                  <Button
                    compact
                    variant="ghost"
                    label={t("common.edit")}
                    onPress={() => openForm(one)}
                    testID={`form-edit-${one.id}`}
                  />
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}
      <LeadFormSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        form={shown === "new" ? undefined : shown}
      />
    </Screen>
  );
}

function LeadFormSheet({
  open,
  onClose,
  form,
}: {
  open: boolean;
  onClose: () => void;
  form?: LeadForm;
}) {
  const t = useTranslations();
  const tf = useTranslations("settings.forms");
  const options = useLeadOptions(open);
  const save = useLeadFormStep();
  const remove = useLeadFormStep();
  const [name, setName] = useState(form?.name ?? "");
  const [slug, setSlug] = useState(form?.slug ?? "");
  // A new form's link name follows its name until someone types one.
  const [slugTouched, setSlugTouched] = useState(!!form);
  const [columnId, setColumnId] = useState<string | null>(form?.columnId ?? null);
  const [sourceId, setSourceId] = useState<string | null>(form?.sourceId ?? null);
  const [integration, setIntegration] = useState(form?.integration ?? "");
  const [isActive, setIsActive] = useState(form?.isActive ?? true);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(form?.name ?? "");
      setSlug(form?.slug ?? "");
      setSlugTouched(!!form);
      setColumnId(form?.columnId ?? null);
      setSourceId(form?.sourceId ?? null);
      setIntegration(form?.integration ?? "");
      setIsActive(form?.isActive ?? true);
      setTried(false);
      save.reset();
      remove.reset();
    }
  }
  const columns = (options.data?.boards ?? []).flatMap((board) =>
    board.columns.map((column) => ({
      value: column.id,
      label: `${board.name} · ${column.name}`,
    })),
  );
  // As on the site: a new form starts on the first column of the first board.
  const column = columnId ?? (form ? null : (columns[0]?.value ?? null));
  const fieldError = fieldErrorOf(t, save.error);
  const typedSlug = slug.trim().toLowerCase();
  const slugProblem =
    typedSlug.length < 2
      ? t("validation.required")
      : SLUG.test(typedSlug)
        ? null
        : t("validation.slug");
  const shownErrors = ["name", "slug", "columnId"].some((key) => fieldError(key));

  const submit = () => {
    setTried(true);
    if (!name.trim() || slugProblem || !column) return;
    save.mutate(
      {
        id: form?.id ?? null,
        input: {
          name: name.trim(),
          slug: typedSlug,
          columnId: column,
          sourceId,
          integration: integration.trim() || null,
          isActive,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={form ? tf("edit") : tf("add")}
        testID="form-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="form-save"
            />
            {form ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="form-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !(hasFieldErrors(save.error) && shownErrors) ? (
            <Notice tone="destructive" testID="form-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {options.error ? (
            <Notice tone="warning" testID="form-options-problem">
              {errorText(t, options.error)}
            </Notice>
          ) : null}
          <Field
            label={tf("name")}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (!slugTouched) setSlug(slugify(text));
            }}
            maxLength={120}
            error={fieldError("name") ?? (tried && !name.trim() ? t("validation.required") : null)}
            testID="form-name"
          />
          <Field
            label={tf("slug")}
            value={slug}
            onChangeText={(text) => {
              setSlug(text);
              setSlugTouched(true);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            hint={tf("slugHint")}
            error={fieldError("slug") ?? (tried ? slugProblem : null)}
            testID="form-slug"
          />
          <Select
            label={tf("column")}
            value={column}
            onChange={(value) => {
              if (value) setColumnId(value);
            }}
            options={columns}
            placeholder={tf("columnPlaceholder")}
            error={fieldError("columnId") ?? (tried && !column ? t("validation.required") : null)}
            testID="form-column"
          />
          <Select
            label={tf("source")}
            value={sourceId}
            onChange={setSourceId}
            options={(options.data?.sources ?? []).map((one) => ({
              value: one.id,
              label: one.name,
            }))}
            clearLabel="----"
            placeholder="----"
            testID="form-source"
          />
          <Field
            label={tf("integration")}
            value={integration}
            onChangeText={setIntegration}
            maxLength={120}
            hint={tf("integrationHint")}
            testID="form-integration"
          />
          <Check
            label={t("common.active")}
            value={isActive}
            onChange={setIsActive}
            testID="form-active"
          />
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tf("deleteTitle")}
        text={tf("deleteText", { name: form?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!form) return;
          remove.mutate(
            { id: form.id, input: null },
            {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            },
          );
        }}
        testID="form-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  half: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[2] },
  name: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  shrink: { flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  number: { fontVariant: ["tabular-nums"] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
