import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  ORG_SWITCHES,
  SCHEDULE_STEPS,
  useLeadFormNames,
  useSaveOrgSettings,
  type OrgSettings,
  type OrgSettingsInput,
  type OrgSwitch,
} from "@/api/office-general-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Card, Divider, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { useOpenSite } from "@/features/office/site-paths";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/** The numbers of the form, as typed. */
const NUMBERS = [
  "debtTelegramDays",
  "debtSmsDays",
  "debtTaskDays",
  "absenceStreak",
  "absenceSilentDays",
  "referralBonus",
  "studentRescheduleHours",
] as const;
type NumberKey = (typeof NUMBERS)[number];

/** What each number may be; `empty` is what an empty field means, or "no" when it may not be empty. */
const RANGE: Record<NumberKey, { min: number; max: number; empty: null | 0 | "no" }> = {
  debtTelegramDays: { min: 0, max: 90, empty: null },
  debtSmsDays: { min: 0, max: 90, empty: null },
  debtTaskDays: { min: 0, max: 90, empty: null },
  absenceStreak: { min: 1, max: 10, empty: null },
  absenceSilentDays: { min: 1, max: 90, empty: null },
  referralBonus: { min: 0, max: 99_999_999, empty: 0 },
  studentRescheduleHours: { min: 1, max: 168, empty: "no" },
};

const PUBLIC_TEXTS = [
  "publicIntro",
  "publicPhone",
  "publicAddress",
  "publicInstagram",
  "publicTelegram",
] as const;
type PublicText = (typeof PUBLIC_TEXTS)[number];
const PUBLIC_MAX: Record<PublicText, number> = {
  publicIntro: 1000,
  publicPhone: 30,
  publicAddress: 300,
  publicInstagram: 100,
  publicTelegram: 100,
};

/** The page's address on the server's own name: 3 to 40 Latin letters, digits and dashes. */
const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

type Draft = Record<OrgSwitch, boolean> &
  Record<NumberKey, string> &
  Record<PublicText, string> & {
    name: string;
    workStart: string | null;
    workEnd: string | null;
    scheduleStepMinutes: number;
    publicPage: boolean;
    publicSlug: string;
    publicFormId: string | null;
  };

function toDraft(settings: OrgSettingsInput): Draft {
  const typed = (value: number | null) => (value === null ? "" : String(value));
  return {
    ...(Object.fromEntries(ORG_SWITCHES.map((key) => [key, settings[key]])) as Record<
      OrgSwitch,
      boolean
    >),
    ...(Object.fromEntries(NUMBERS.map((key) => [key, typed(settings[key])])) as Record<
      NumberKey,
      string
    >),
    ...(Object.fromEntries(PUBLIC_TEXTS.map((key) => [key, settings[key] ?? ""])) as Record<
      PublicText,
      string
    >),
    name: settings.name,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    scheduleStepMinutes: settings.scheduleStepMinutes,
    publicPage: settings.publicPage,
    publicSlug: settings.publicSlug ?? "",
    publicFormId: settings.publicFormId,
  };
}

/** A typed number in its range; `undefined` when it is not one. */
export function typedInRange(
  typed: string,
  range: { min: number; max: number; empty: null | 0 | "no" },
): number | null | undefined {
  const value = typed.trim();
  if (value === "") return range.empty === "no" ? undefined : range.empty;
  if (!/^\d{1,9}$/.test(value)) return undefined;
  const number = Number(value);
  return number >= range.min && number <= range.max ? number : undefined;
}

type Problems = Partial<Record<keyof Draft, string>>;

/** What is wrong with the draft before it is sent, as message keys. */
function problemsOf(draft: Draft): Problems {
  const problems: Problems = {};
  if (!draft.name.trim()) problems.name = "validation.required";
  if (!draft.workStart) problems.workStart = "validation.time";
  if (!draft.workEnd) problems.workEnd = "validation.time";
  else if (draft.workStart && draft.workStart >= draft.workEnd) {
    problems.workEnd = "validation.workHours";
  }
  for (const key of NUMBERS) {
    const range = RANGE[key];
    if (typedInRange(draft[key], range) !== undefined) continue;
    const value = draft[key].trim();
    problems[key] =
      value === ""
        ? "validation.required"
        : !/^\d+$/.test(value)
          ? "validation.integer"
          : Number(value) < range.min
            ? "validation.min"
            : "validation.max";
  }
  const slug = draft.publicSlug.trim().toLowerCase();
  if (slug !== "" && !PUBLIC_SLUG.test(slug)) problems.publicSlug = "validation.slug";
  return problems;
}

function toInput(draft: Draft): OrgSettingsInput {
  const number = (key: NumberKey) => typedInRange(draft[key], RANGE[key]) ?? null;
  return {
    ...(Object.fromEntries(ORG_SWITCHES.map((key) => [key, draft[key]])) as Record<
      OrgSwitch,
      boolean
    >),
    name: draft.name.trim(),
    workStart: draft.workStart ?? "",
    workEnd: draft.workEnd ?? "",
    scheduleStepMinutes: draft.scheduleStepMinutes,
    debtTelegramDays: number("debtTelegramDays"),
    debtSmsDays: number("debtSmsDays"),
    debtTaskDays: number("debtTaskDays"),
    absenceStreak: number("absenceStreak"),
    absenceSilentDays: number("absenceSilentDays"),
    referralBonus: number("referralBonus") ?? 0,
    studentRescheduleHours: number("studentRescheduleHours") ?? 12,
    publicPage: draft.publicPage,
    publicSlug: draft.publicSlug.trim().toLowerCase() || null,
    publicIntro: draft.publicIntro.trim() || null,
    publicPhone: draft.publicPhone.trim() || null,
    publicAddress: draft.publicAddress.trim() || null,
    publicInstagram: draft.publicInstagram.trim() || null,
    publicTelegram: draft.publicTelegram.trim() || null,
    publicFormId: draft.publicFormId,
  };
}

/** The same settings, whatever order their keys came in. */
function same(a: OrgSettingsInput, b: OrgSettingsInput): boolean {
  return (Object.keys(a) as Array<keyof OrgSettingsInput>).every((key) => a[key] === b[key]);
}

/**
 * "Center settings" (A-243): the site's first card of General settings. The
 * centre's name and working hours, when debt reminders and absence rules
 * fire, the referral bonus, how late a 1:1 student may move a lesson, the
 * public page, and the yes-or-no rules the rest of the system follows.
 * **Save** wakes once something differs from what the server has.
 */
export function OrgForm({ settings }: { settings: OrgSettings }) {
  const t = useTranslations();
  const tg = useTranslations("settings.general");
  const me = useMe();
  const { wide } = useLayout();
  const { locale } = useLocaleChoice();
  const site = useOpenSite();
  const save = useSaveOrgSettings();
  const forms = useLeadFormNames(can(me, "settings.catalog"));
  // What the server has, as the form's own shape: the draft is compared with it.
  const [stored, setStored] = useState<OrgSettingsInput>(() => toInput(toDraft(settings)));
  const [live, setLive] = useState({ page: settings.publicPage, slug: settings.publicSlug });
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [checked, setChecked] = useState(false);
  const set = (patch: Partial<Draft>) => {
    if (save.error) save.reset();
    setDraft((now) => ({ ...now, ...patch }));
  };

  const problems = problemsOf(draft);
  const dirty = !same(toInput(draft), stored);
  const fieldError = fieldErrorOf(t, save.error);
  const problem = (key: keyof Draft) =>
    fieldError(key) ?? (checked && problems[key] ? t(problems[key]) : null);

  const submit = () => {
    setChecked(true);
    if (Object.keys(problems).length > 0) return;
    save.mutate(toInput(draft), {
      onSuccess: (saved) => {
        // The server's own spelling (a trimmed name, a lower-case address) goes back in the form.
        setDraft(toDraft(saved));
        setStored(toInput(toDraft(saved)));
        setLive({ page: saved.publicPage, slug: saved.publicSlug });
        setChecked(false);
      },
    });
  };

  const number = (key: NumberKey, label: string, unit: string, placeholder?: string) => (
    <View key={key} style={wide ? styles.third : styles.full}>
      <Field
        label={label}
        value={draft[key]}
        onChangeText={(text) => set({ [key]: text } as Partial<Draft>)}
        keyboardType="number-pad"
        maxLength={8}
        placeholder={placeholder}
        hint={unit}
        error={problem(key)}
        testID={`org-${key}`}
      />
    </View>
  );
  const part = (title: string, hint: string) => (
    <View style={styles.tight}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="small" tone="mutedForeground">
        {hint}
      </Text>
    </View>
  );
  const slug = draft.publicSlug.trim().toLowerCase();

  return (
    <Card testID="org-form">
      <View style={styles.tight}>
        <Text variant="heading">{tg("centerTitle")}</Text>
        <Text variant="small" tone="mutedForeground">
          {tg("centerDescription")}
        </Text>
      </View>
      <Field
        label={tg("orgName")}
        value={draft.name}
        onChangeText={(name) => set({ name })}
        maxLength={120}
        error={problem("name")}
        testID="org-name"
      />
      <View style={styles.grid}>
        <View style={wide ? styles.third : styles.half}>
          <TimeField
            label={tg("workStart")}
            value={draft.workStart}
            onChange={(workStart) => set({ workStart })}
            error={problem("workStart")}
            testID="org-workStart"
          />
        </View>
        <View style={wide ? styles.third : styles.half}>
          <TimeField
            label={tg("workEnd")}
            value={draft.workEnd}
            onChange={(workEnd) => set({ workEnd })}
            error={problem("workEnd")}
            testID="org-workEnd"
          />
        </View>
        <View style={[wide ? styles.third : styles.full, styles.tight]}>
          <Text variant="smallStrong">{tg("scheduleStep")}</Text>
          <Segmented
            options={SCHEDULE_STEPS.map((step) => ({
              value: String(step),
              label: tg("minutes", { count: step }),
            }))}
            value={String(draft.scheduleStepMinutes)}
            onChange={(step) => set({ scheduleStepMinutes: Number(step) })}
            testID="org-step"
          />
        </View>
      </View>

      <Divider />
      {part(tg("debt.title"), tg("debt.hint"))}
      <View style={styles.grid} testID="org-debt">
        {number("debtTelegramDays", tg("debt.telegram"), tg("debt.days"), tg("debt.off"))}
        {number("debtSmsDays", tg("debt.sms"), tg("debt.days"), tg("debt.off"))}
        {number("debtTaskDays", tg("debt.task"), tg("debt.days"), tg("debt.off"))}
      </View>

      <Divider />
      {part(tg("absence.title"), tg("absence.hint"))}
      <View style={styles.grid} testID="org-absence">
        {number("absenceStreak", tg("absence.streak"), tg("absence.lessons"), tg("absence.off"))}
        {number("absenceSilentDays", tg("absence.silent"), tg("absence.days"), tg("absence.off"))}
      </View>

      <Divider />
      {part(tg("referral.title"), tg("referral.hint"))}
      <View style={styles.grid}>
        {number("referralBonus", tg("referral.bonus"), tg("referral.currency"))}
      </View>

      <Divider />
      {part(tg("reschedule.title"), tg("reschedule.hint"))}
      <View style={styles.grid}>
        {number("studentRescheduleHours", tg("reschedule.hours"), tg("reschedule.unit"))}
      </View>

      <Divider />
      {part(tg("publicPage.title"), tg("publicPage.hint"))}
      <View style={styles.block} testID="org-public">
        <Check
          label={tg("publicPage.enabled")}
          value={draft.publicPage}
          onChange={(publicPage) => set({ publicPage })}
          testID="org-publicPage"
        />
        <Field
          label={tg("publicPage.slug")}
          value={draft.publicSlug}
          onChangeText={(publicSlug) => set({ publicSlug })}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          placeholder="kingston"
          hint={tg("publicPage.link", { path: `/${locale}/c/${slug || "…"}` })}
          error={problem("publicSlug")}
          testID="org-publicSlug"
        />
        {forms.data ? (
          <Select
            label={tg("publicPage.form")}
            value={draft.publicFormId}
            onChange={(publicFormId) => set({ publicFormId })}
            placeholder={tg("publicPage.formAuto")}
            clearLabel={tg("publicPage.formAuto")}
            options={forms.data.map((form) => ({ value: form.id, label: form.name }))}
            error={problem("publicFormId")}
            testID="org-publicFormId"
          />
        ) : null}
        {PUBLIC_TEXTS.map((key) => (
          <Field
            key={key}
            label={tg(`publicPage.${key === "publicIntro" ? "intro" : key}`)}
            value={draft[key]}
            onChangeText={(text) => set({ [key]: text } as Partial<Draft>)}
            multiline={key === "publicIntro"}
            style={key === "publicIntro" ? styles.intro : undefined}
            maxLength={PUBLIC_MAX[key]}
            autoCapitalize={key === "publicIntro" || key === "publicAddress" ? "sentences" : "none"}
            keyboardType={key === "publicPhone" ? "phone-pad" : "default"}
            error={problem(key)}
            testID={`org-${key}`}
          />
        ))}
        {live.page && live.slug ? (
          <Button
            compact
            variant="outline"
            label={tg("publicPage.open")}
            onPress={() => site.open(`/c/${live.slug}`)}
            testID="org-public-open"
          />
        ) : null}
        {site.error ? <Notice tone="destructive">{site.error}</Notice> : null}
      </View>

      <Divider />
      <Text variant="bodyStrong">{tg("switchesTitle")}</Text>
      <View style={styles.block} testID="org-switches">
        {ORG_SWITCHES.map((key) => (
          <Check
            key={key}
            label={t(`settings.switches.${key}`)}
            hint={
              t.has(`settings.switchHints.${key}`) ? t(`settings.switchHints.${key}`) : undefined
            }
            value={draft[key]}
            onChange={(on) => set({ [key]: on } as Partial<Draft>)}
            testID={`org-switch-${key}`}
          />
        ))}
      </View>

      {save.error && !hasFieldErrors(save.error) ? (
        <Notice tone="destructive" testID="org-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      {checked && Object.keys(problems).length > 0 ? (
        <Notice tone="destructive" testID="org-check">
          {t("mobile.settingsPages.fixFields")}
        </Notice>
      ) : null}
      {save.isSuccess && !dirty ? (
        <Notice tone="success" testID="org-saved">
          {t("common.saved")}
        </Notice>
      ) : null}
      <Button
        label={t("common.save")}
        loading={save.isPending}
        disabled={!dirty}
        onPress={submit}
        testID="org-save"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  tight: { gap: space[1] },
  block: { gap: space[3] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  half: { width: "50%", paddingHorizontal: space[2] },
  third: { width: "33.333%", paddingHorizontal: space[2] },
  intro: { minHeight: 96, textAlignVertical: "top" },
});
