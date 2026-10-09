"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { ORG_SWITCHES, orgSettingsSchema, SCHEDULE_STEPS } from "@/lib/validation/settings";
import type { OrgSettingsDto } from "@/server/services/settings/org-settings.service";

type Input = z.input<typeof orgSettingsSchema>;
type Output = z.output<typeof orgSettingsSchema>;

function toFormValues(settings: OrgSettingsDto): Input {
  const { organizationId: _id, logoUrl: _logo, ...rest } = settings;
  return rest;
}

const NO_FORM = "__auto";

export function OrgForm({
  settings,
  forms,
  onSaved,
}: {
  settings: OrgSettingsDto;
  forms: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(orgSettingsSchema),
    defaultValues: toFormValues(settings),
  });

  async function onSubmit(values: Output) {
    setError(null);
    setSaved(false);
    try {
      const updated = await api<OrgSettingsDto>("/settings/org", { method: "PUT", body: values });
      form.reset(toFormValues(updated));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting, isDirty } = form.formState;
  const publicSlug = useWatch({ control: form.control, name: "publicSlug" });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.centerTitle")}</CardTitle>
          <CardDescription>{t("settings.general.centerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">{t.has(error) ? t(error) : t("errors.internal")}</Alert>
          )}
          {saved && !isDirty && (
            <Alert variant="success" data-testid="org-saved">
              {t("common.saved")}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="org-name">{t("settings.general.orgName")}</Label>
              <Input id="org-name" aria-invalid={!!errors.name} {...form.register("name")} />
              <FieldError id="org-name-error" message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-start">{t("settings.general.workStart")}</Label>
              <Input
                id="work-start"
                type="time"
                aria-invalid={!!errors.workStart}
                {...form.register("workStart")}
              />
              <FieldError id="work-start-error" message={errors.workStart?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-end">{t("settings.general.workEnd")}</Label>
              <Input
                id="work-end"
                type="time"
                aria-invalid={!!errors.workEnd}
                {...form.register("workEnd")}
              />
              <FieldError id="work-end-error" message={errors.workEnd?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-step">{t("settings.general.scheduleStep")}</Label>
              <Controller
                control={form.control}
                name="scheduleStepMinutes"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="schedule-step">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_STEPS.map((step) => (
                        <SelectItem key={step} value={String(step)}>
                          {t("settings.general.minutes", { count: step })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <fieldset className="space-y-3" data-testid="debt-cadence">
            <legend className="text-sm font-medium">{t("settings.general.debt.title")}</legend>
            <p className="text-xs text-muted-foreground">{t("settings.general.debt.hint")}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["debtTelegramDays", "debtSmsDays", "debtTaskDays"] as const).map((key) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`cadence-${key}`}>
                    {t(
                      `settings.general.debt.${
                        key === "debtTelegramDays"
                          ? "telegram"
                          : key === "debtSmsDays"
                            ? "sms"
                            : "task"
                      }`,
                    )}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`cadence-${key}`}
                      type="number"
                      min={0}
                      max={90}
                      className="w-24"
                      placeholder={t("settings.general.debt.off")}
                      aria-invalid={!!errors[key]}
                      {...form.register(key)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("settings.general.debt.days")}
                    </span>
                  </div>
                  <FieldError id={`cadence-${key}-error`} message={errors[key]?.message} />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" data-testid="absence-rules">
            <legend className="text-sm font-medium">{t("settings.general.absence.title")}</legend>
            <p className="text-xs text-muted-foreground">{t("settings.general.absence.hint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["absenceStreak", "absenceSilentDays"] as const).map((key) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`absence-${key}`}>
                    {t(`settings.general.absence.${key === "absenceStreak" ? "streak" : "silent"}`)}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`absence-${key}`}
                      type="number"
                      min={1}
                      max={key === "absenceStreak" ? 10 : 90}
                      className="w-24"
                      placeholder={t("settings.general.absence.off")}
                      aria-invalid={!!errors[key]}
                      {...form.register(key)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {t(
                        `settings.general.absence.${key === "absenceStreak" ? "lessons" : "days"}`,
                      )}
                    </span>
                  </div>
                  <FieldError id={`absence-${key}-error`} message={errors[key]?.message} />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" data-testid="referral-settings">
            <legend className="text-sm font-medium">{t("settings.general.referral.title")}</legend>
            <p className="text-xs text-muted-foreground">{t("settings.general.referral.hint")}</p>
            <div className="space-y-2">
              <Label htmlFor="referral-bonus">{t("settings.general.referral.bonus")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="referral-bonus"
                  type="number"
                  min={0}
                  step={1000}
                  className="w-40"
                  aria-invalid={!!errors.referralBonus}
                  {...form.register("referralBonus")}
                />
                <span className="text-sm text-muted-foreground">
                  {t("settings.general.referral.currency")}
                </span>
              </div>
              <FieldError id="referral-bonus-error" message={errors.referralBonus?.message} />
            </div>
          </fieldset>

          <fieldset className="space-y-3" data-testid="public-page">
            <legend className="text-sm font-medium">
              {t("settings.general.publicPage.title")}
            </legend>
            <p className="text-xs text-muted-foreground">{t("settings.general.publicPage.hint")}</p>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <Label htmlFor="switch-publicPage" className="font-normal">
                {t("settings.general.publicPage.enabled")}
              </Label>
              <Controller
                control={form.control}
                name="publicPage"
                render={({ field }) => (
                  <Switch
                    id="switch-publicPage"
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-publicPage"
                  />
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="public-slug">{t("settings.general.publicPage.slug")}</Label>
                <Input
                  id="public-slug"
                  placeholder="kingston"
                  aria-invalid={!!errors.publicSlug}
                  {...form.register("publicSlug")}
                />
                <p
                  className="text-xs text-muted-foreground break-all"
                  data-testid="public-page-link"
                >
                  {t("settings.general.publicPage.link", {
                    path: `/${locale}/c/${publicSlug || "…"}`,
                  })}
                </p>
                <FieldError id="public-slug-error" message={errors.publicSlug?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="public-form">{t("settings.general.publicPage.form")}</Label>
                <Controller
                  control={form.control}
                  name="publicFormId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : NO_FORM}
                      onValueChange={(v) => field.onChange(v === NO_FORM ? "" : v)}
                    >
                      <SelectTrigger id="public-form" aria-invalid={!!errors.publicFormId}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_FORM}>
                          {t("settings.general.publicPage.formAuto")}
                        </SelectItem>
                        {forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id="public-form-error" message={errors.publicFormId?.message} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="public-intro">{t("settings.general.publicPage.intro")}</Label>
                <Textarea
                  id="public-intro"
                  rows={3}
                  aria-invalid={!!errors.publicIntro}
                  {...form.register("publicIntro")}
                />
                <FieldError id="public-intro-error" message={errors.publicIntro?.message} />
              </div>
              {(["publicPhone", "publicAddress", "publicInstagram", "publicTelegram"] as const).map(
                (key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`field-${key}`}>
                      {t(`settings.general.publicPage.${key}`)}
                    </Label>
                    <Input
                      id={`field-${key}`}
                      aria-invalid={!!errors[key]}
                      {...form.register(key)}
                    />
                    <FieldError id={`field-${key}-error`} message={errors[key]?.message} />
                  </div>
                ),
              )}
            </div>
            {settings.publicPage && settings.publicSlug && (
              <a
                href={`/${locale}/c/${settings.publicSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline underline-offset-4"
                data-testid="public-page-open"
              >
                {t("settings.general.publicPage.open")}
              </a>
            )}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="mb-2 text-sm font-medium">
              {t("settings.general.switchesTitle")}
            </legend>
            <ul className="divide-y rounded-lg border">
              {ORG_SWITCHES.map((key) => (
                <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="space-y-0.5">
                    <Label htmlFor={`switch-${key}`} className="font-normal">
                      {t(`settings.switches.${key}`)}
                    </Label>
                    {t.has(`settings.switchHints.${key}`) && (
                      <p className="text-xs text-muted-foreground">
                        {t(`settings.switchHints.${key}`)}
                      </p>
                    )}
                  </div>
                  <Controller
                    control={form.control}
                    name={key}
                    render={({ field }) => (
                      <Switch
                        id={`switch-${key}`}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid={`switch-${key}`}
                      />
                    )}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isSubmitting || !isDirty} data-testid="org-save">
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
