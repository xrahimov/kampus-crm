import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  providerPath,
  useSaveIntegration,
  type Integration,
  type IntegrationProvider,
} from "@/api/office-integrations";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Select, type SelectOption } from "@/components/select";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { API_ORIGIN } from "@/lib/api";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import {
  HINTS,
  INTEGRATION_FIELDS,
  WEBHOOK_PATH,
  type IntegrationField,
} from "./integration-fields";

/** What the fields start from: every value as the text the field shows. */
function valuesOf(integration: Integration): Record<string, string> {
  return Object.fromEntries(
    INTEGRATION_FIELDS[integration.provider].map((field) => [
      field.key,
      String(integration.config[field.key] ?? ""),
    ]),
  );
}

/** What is sent for one field: a number, a yes or no, or the text as it stands. */
function sent(field: IntegrationField, value: string | undefined): unknown {
  if (field.type === "number") return Number(value ?? 0);
  if (field.type === "boolean") return value === "true";
  return value ?? "";
}

/**
 * One service's form (A-249): the switch that turns it on and its fields, as
 * on the site. A secret that is set comes back masked and stays as it is
 * unless something new is typed over it; after a save the fields show what
 * the server now holds, so a secret just typed is masked again.
 */
export function IntegrationForm({
  integration,
  choices = {},
  hidden = [],
  children,
}: {
  integration: Integration;
  /** Fields that are a choice from a list instead of free text, by their key. */
  choices?: Record<string, { options: ReadonlyArray<SelectOption<string>>; none: string }>;
  /** Fields this person is not shown; what the server holds for them is sent back unchanged. */
  hidden?: string[];
  /** What stands between the hints and the save button: a test button, a note. */
  children?: ReactNode;
}) {
  const provider: IntegrationProvider = integration.provider;
  const t = useTranslations();
  const tp = useTranslations(`integrations.${provider}`);
  const save = useSaveIntegration(provider);
  const [enabled, setEnabled] = useState(integration.isEnabled);
  const [values, setValues] = useState(() => valuesOf(integration));
  const id = providerPath(provider);
  const fields = INTEGRATION_FIELDS[provider];
  const fieldError = fieldErrorOf(t, save.error);
  const webhook = WEBHOOK_PATH[provider];
  // A refusal that a field shows under itself is not said a second time above the button.
  const underField = fields.some(
    (field) =>
      !hidden.includes(field.key) && field.type !== "boolean" && fieldError(field.key) !== null,
  );
  // Any change after a save takes the "Saved." away: it is no longer true of what is shown.
  const touch = () => {
    if (save.isSuccess || save.error) save.reset();
  };
  const set = (key: string, value: string) => {
    touch();
    setValues((now) => ({ ...now, [key]: value }));
  };

  const submit = () => {
    const body: Record<string, unknown> = { isEnabled: enabled };
    for (const field of fields) body[field.key] = sent(field, values[field.key]);
    save.mutate(body, { onSuccess: (now) => setValues(valuesOf(now)) });
  };

  return (
    <View style={styles.form} testID={`integration-${id}`}>
      <Text variant="small" tone="mutedForeground">
        {tp("description")}
      </Text>
      <Check
        label={t("integrations.enabled")}
        value={enabled}
        onChange={(on) => {
          touch();
          setEnabled(on);
        }}
        testID={`${id}-enabled`}
      />
      {fields
        .filter((field) => !hidden.includes(field.key))
        .map((field) => {
          const label = tp(`fields.${field.key}`);
          const choice = choices[field.key];
          if (choice) {
            return (
              <Select
                key={field.key}
                label={label}
                options={choice.options}
                value={values[field.key] || null}
                onChange={(next) => set(field.key, next ?? "")}
                placeholder={choice.none}
                clearLabel={choice.none}
                error={fieldError(field.key)}
                testID={`${id}-${field.key}`}
              />
            );
          }
          if (field.type === "boolean") {
            return (
              <Check
                key={field.key}
                label={label}
                value={values[field.key] === "true"}
                onChange={(on) => set(field.key, on ? "true" : "false")}
                testID={`${id}-${field.key}`}
              />
            );
          }
          return (
            <Field
              key={field.key}
              label={label}
              value={values[field.key] ?? ""}
              onChangeText={(text) =>
                set(field.key, field.type === "number" ? text.replace(/\D/g, "").slice(0, 6) : text)
              }
              secureTextEntry={field.secret}
              keyboardType={field.type === "number" ? "number-pad" : "default"}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              error={fieldError(field.key)}
              testID={`${id}-${field.key}`}
            />
          );
        })}
      {webhook ? (
        <View style={styles.tight}>
          <Text variant="small" tone="mutedForeground">
            {t("integrations.webhookHint")}
          </Text>
          <Text variant="small" selectable testID={`${id}-webhook`}>
            {`${API_ORIGIN}/api/v1/webhooks/${webhook}`}
          </Text>
        </View>
      ) : null}
      {HINTS[provider].map((key) => (
        <Text key={key} variant="small" tone="mutedForeground">
          {tp(key)}
        </Text>
      ))}
      {children}
      {save.error && !underField ? (
        <Notice tone="destructive" testID={`${id}-problem`}>
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      {save.isSuccess ? (
        <Notice tone="success" testID={`${id}-saved`}>
          {t("common.saved")}
        </Notice>
      ) : null}
      <Button
        label={t("common.save")}
        loading={save.isPending}
        onPress={submit}
        style={styles.start}
        testID={`${id}-save`}
      />
    </View>
  );
}

/** A form on a page of its own: on a tablet it keeps a width a line of text is read at. */
export const FORM_CARD = { width: "100%", maxWidth: 720, alignSelf: "center" } as const;

const styles = StyleSheet.create({
  form: { gap: space[4] },
  tight: { gap: space[1] },
  start: { alignSelf: "flex-start" },
});
