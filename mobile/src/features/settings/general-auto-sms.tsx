import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAutoSms, useSaveAutoSms, type AutoSms } from "@/api/office-general-settings";
import { SMS_MAX_LENGTH } from "@/api/office-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { smsParts } from "@/lib/sms-parts";
import { space } from "@/lib/theme";

import { RowPress } from "./parts";

/**
 * Automatic SMS (A-243): the site's "Auto SMS settings". One line per event
 * with whether it sends and how its text starts; a tap opens the switch and
 * the text. The site saves the whole list at once, so a save here sends every
 * event as the server has it, with this one changed.
 */
export function AutoSmsCard() {
  const t = useTranslations();
  const tr = useTranslations("sms.auto");
  const te = useTranslations("sms.autoEvents");
  const query = useAutoSms(true);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const rows = query.data ?? [];
  const row = rows.find((one) => one.event === shown);
  const nameOf = (event: string) => (te.has(event) ? te(event) : event);
  return (
    <Card testID="auto-sms">
      <View>
        <Text variant="heading">{tr("title")}</Text>
        <Text variant="small" tone="mutedForeground">
          {tr("description")}
        </Text>
      </View>
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map((one, index) => (
            <View key={one.event}>
              {index > 0 ? <Divider /> : null}
              <RowPress
                onPress={() => {
                  setShown(one.event);
                  setOpen(true);
                }}
                testID={`auto-sms-${one.event}`}
              >
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {nameOf(one.event)}
                  </Text>
                  <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                    {one.template}
                  </Text>
                </View>
                <Badge
                  tone={one.isActive ? "success" : "neutral"}
                  label={t(one.isActive ? "common.active" : "common.inactive")}
                  testID={`auto-sms-state-${one.event}`}
                />
              </RowPress>
            </View>
          ))}
        </View>
      ) : null}
      {row ? (
        <AutoSmsSheet
          key={row.event}
          open={open}
          onClose={() => setOpen(false)}
          row={row}
          rows={rows}
          title={nameOf(row.event)}
        />
      ) : null}
    </Card>
  );
}

function AutoSmsSheet({
  open,
  onClose,
  row,
  rows,
  title,
}: {
  open: boolean;
  onClose: () => void;
  row: AutoSms;
  rows: AutoSms[];
  title: string;
}) {
  const t = useTranslations();
  const tv = useTranslations("sms.variables");
  const ts = useTranslations("sms.send");
  const tr = useTranslations("sms.auto");
  const save = useSaveAutoSms();
  const [isActive, setIsActive] = useState(row.isActive);
  const [template, setTemplate] = useState(row.template);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIsActive(row.isActive);
      setTemplate(row.template);
      setMissing(false);
      save.reset();
    }
  }
  const { chars, parts } = smsParts(template);
  const index = rows.findIndex((one) => one.event === row.event);
  // The server names the line it refuses by its place in the list.
  const refused = fieldErrorOf(t, save.error)(`settings.${index}.template`);
  const submit = () => {
    if (!template.trim()) {
      setMissing(true);
      return;
    }
    save.mutate(
      rows.map((one) =>
        one.event === row.event ? { ...one, isActive, template: template.trim() } : one,
      ),
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID="auto-sms-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="auto-sms-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !(hasFieldErrors(save.error) && refused) ? (
          <Notice tone="destructive" testID="auto-sms-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Check
          label={t("common.active")}
          value={isActive}
          onChange={setIsActive}
          testID="auto-sms-active"
        />
        <Field
          label={tr("templateFor", { event: title })}
          value={template}
          onChangeText={setTemplate}
          multiline
          style={styles.text}
          maxLength={SMS_MAX_LENGTH}
          hint={ts("counter", { chars, parts })}
          error={refused ?? (missing && !template.trim() ? t("validation.required") : null)}
          testID="auto-sms-text"
        />
        {row.variables.length > 0 ? (
          <View style={styles.tight}>
            <Text variant="small" tone="mutedForeground">
              {t("mobile.settingsPages.variablesHint")}
            </Text>
            <View style={styles.words}>
              {row.variables.map((name) => (
                <Button
                  key={name}
                  compact
                  variant="outline"
                  label={tv.has(name) ? tv(name) : name}
                  onPress={() => setTemplate((now) => `${now}{${name}}`.slice(0, SMS_MAX_LENGTH))}
                  testID={`auto-sms-variable-${name}`}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { marginHorizontal: -space[4] },
  form: { gap: space[4] },
  tight: { gap: space[2] },
  words: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  // Room for a whole message: a field of one line cuts a long text off.
  text: { minHeight: 120, textAlignVertical: "top" },
});
