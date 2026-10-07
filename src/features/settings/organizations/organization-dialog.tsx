"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { organizationCreateSchema, organizationUpdateSchema } from "@/lib/validation/settings";
import type { OrganizationDto } from "@/server/services/settings/organizations.service";

import { FormDialog } from "../shared/form-dialog";

/* The form types the branches one per line; the API gets the list. */
const createFormSchema = organizationCreateSchema.omit({ branches: true }).extend({
  branchesText: z.string().trim().min(1, "validation.required"),
});
/* Renaming touches the name only; the other fields stay in the form untouched. */
const editFormSchema = organizationUpdateSchema.extend({
  branchesText: z.string(),
  ceoFullName: z.string(),
  ceoPhone: z.string(),
  ceoPassword: z.string(),
});
type CreateForm = z.input<typeof createFormSchema>;

const linesOf = (text: string) =>
  Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  );

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: OrganizationDto | null;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.organizations");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateForm>({
    resolver: zodResolver(organization ? editFormSchema : createFormSchema),
    defaultValues: {
      name: "",
      branchesText: "",
      ceoFullName: "",
      ceoPhone: "+998",
      ceoPassword: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: organization?.name ?? "",
      branchesText: organization?.branches.map((b) => b.name).join("\n") ?? "",
      ceoFullName: organization?.ceo?.fullName ?? "",
      ceoPhone: organization?.ceo?.phone ?? "+998",
      ceoPassword: "",
    });
  }, [open, organization, form]);

  async function onSubmit(values: CreateForm) {
    setError(null);
    try {
      if (organization) {
        await api(`/organizations/${organization.id}`, {
          method: "PATCH",
          body: { name: values.name },
        });
      } else {
        const { branchesText, ...rest } = values;
        await api("/organizations", {
          method: "POST",
          body: { ...rest, branches: linesOf(branchesText) },
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={organization ? t("edit") : t("add")}
      description={organization ? undefined : t("addDescription")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="organization-dialog"
      submitLabel={organization ? undefined : t("create")}
    >
      <div className="space-y-2">
        <Label htmlFor="org-name">{t("name")}</Label>
        <Input id="org-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="org-name-error" message={errors.name?.message} />
      </div>
      {!organization && (
        <>
          <div className="space-y-2">
            <Label htmlFor="org-branches">{t("branches")}</Label>
            <Textarea
              id="org-branches"
              rows={3}
              placeholder={t("branchesPlaceholder")}
              aria-invalid={!!errors.branchesText}
              {...form.register("branchesText")}
            />
            <p className="text-xs text-muted-foreground">{t("branchesHint")}</p>
            <FieldError id="org-branches-error" message={errors.branchesText?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-ceo-name">{t("ceoFullName")}</Label>
            <Input
              id="org-ceo-name"
              aria-invalid={!!errors.ceoFullName}
              {...form.register("ceoFullName")}
            />
            <FieldError id="org-ceo-name-error" message={errors.ceoFullName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-ceo-phone">{t("ceoPhone")}</Label>
            <Input
              id="org-ceo-phone"
              inputMode="tel"
              aria-invalid={!!errors.ceoPhone}
              {...form.register("ceoPhone")}
            />
            <FieldError id="org-ceo-phone-error" message={errors.ceoPhone?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-ceo-password">{t("ceoPassword")}</Label>
            <Input
              id="org-ceo-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.ceoPassword}
              {...form.register("ceoPassword")}
            />
            <p className="text-xs text-muted-foreground">{t("ceoPasswordHint")}</p>
            <FieldError id="org-ceo-password-error" message={errors.ceoPassword?.message} />
          </div>
        </>
      )}
    </FormDialog>
  );
}
