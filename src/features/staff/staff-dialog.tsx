"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  RadioGroup,
  RadioGroupItem,
  SegmentedGroup,
  SegmentedItem,
} from "@/components/ui/radio-group";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import {
  GENDERS,
  SALARY_AMOUNT_FIELD,
  SALARY_METHODS,
  staffCreateSchema,
  staffUpdateSchema,
  TEACHER_KIND_ROLE,
  type StaffCreateInput,
  type StaffUpdateInput,
  type TeacherKind,
} from "@/lib/validation/staff";
import type { RoleDto } from "@/server/services/staff/roles.service";
import type { StaffDto, StaffScope } from "@/server/services/staff/staff.service";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";

import { generatePassword, todayIso } from "./password";
import { PhotoField } from "./photo-field";
import { roleLabel } from "./role-label";

type Input = z.input<typeof staffCreateSchema> & { signInCode?: "OFF" | "TELEGRAM" };
type Output = StaffCreateInput | StaffUpdateInput;

/**
 * The create/edit drawer shared by Teachers (EXP §4) and Staff (EXP §8). In the
 * teachers scope the role is fixed by the tab the drawer was opened from.
 */
export function StaffDialog({
  open,
  onOpenChange,
  person,
  scope,
  kind = "teachers",
  roles,
  branches,
  defaultBranchId,
  selfId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: StaffDto | null;
  scope: StaffScope;
  kind?: TeacherKind;
  roles: RoleDto[];
  branches: BranchOption[];
  defaultBranchId: string;
  selfId: string;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("staff.form");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signedOut, setSignedOut] = useState<"idle" | "busy" | "done">("idle");
  const isSelf = person?.id === selfId;
  const base = scope === "teachers" ? "/teachers" : "/staff";
  const fixedRole = scope === "teachers" ? TEACHER_KIND_ROLE[kind] : null;

  const empty = (): Input => ({
    fullName: "",
    phone: "+998",
    gender: "MALE",
    birthDate: "",
    hireDate: todayIso(),
    photoUrl: null,
    roleCodes: fixedRole ? [fixedRole] : [],
    branchIds: defaultBranchId ? [defaultBranchId] : [],
    salaryMethod: scope === "teachers" ? "PERCENT" : "MONTHLY",
    fixedSalary: "",
    percentShare: "",
    perLessonFee: "",
    perStudentFee: "",
    password: "",
  });

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(person ? staffUpdateSchema : staffCreateSchema) as Resolver<
      Input,
      unknown,
      Output
    >,
    defaultValues: empty(),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      person
        ? {
            fullName: person.fullName,
            phone: person.phone,
            gender: person.gender,
            birthDate: person.birthDate ?? "",
            hireDate: person.hireDate ?? "",
            photoUrl: person.photoUrl,
            roleCodes: person.roles.map((r) => r.code),
            branchIds: person.branches.map((b) => b.id),
            salaryMethod: person.salaryMethod ?? (scope === "teachers" ? "PERCENT" : "MONTHLY"),
            fixedSalary: person.fixedSalary ?? "",
            percentShare: person.percentShare ?? "",
            perLessonFee: person.perLessonFee ?? "",
            perStudentFee: person.perStudentFee ?? "",
            password: "",
            signInCode: person.signInCode,
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person, defaultBranchId, kind]);

  async function signOutEverywhere() {
    if (!person) return;
    setSignedOut("busy");
    try {
      await api(`${base}/${person.id}/sign-out-all`, { method: "POST" });
      setSignedOut("done");
    } catch (e) {
      setSignedOut("idle");
      setError(applyApiError(e, form.setError));
    }
  }

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (person) {
        // Roles stay as they are for teachers (fixed by tab) and for yourself.
        const { roleCodes, ...rest } = values as StaffUpdateInput;
        const body = fixedRole || isSelf ? rest : { ...rest, roleCodes };
        await api(`${base}/${person.id}`, { method: "PATCH", body });
      } else {
        await api(base, { method: "POST", body: values });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const watchedMethod = useWatch({ control: form.control, name: "salaryMethod" });
  const watchedName = useWatch({ control: form.control, name: "fullName" });
  const method = watchedMethod ?? "PERCENT";
  const amountField = SALARY_AMOUNT_FIELD[method];
  const selectableRoles = roles.filter((r) => r.isActive);

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setSignedOut("idle");
        }
        onOpenChange(next);
      }}
      title={
        person
          ? tf(scope === "teachers" ? "editTeacher" : "editStaff")
          : tf(scope === "teachers" ? "addTeacher" : "addStaff")
      }
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="staff-dialog"
    >
      <Controller
        control={form.control}
        name="photoUrl"
        render={({ field }) => (
          <PhotoField
            value={field.value ?? null}
            name={watchedName || "?"}
            onChange={field.onChange}
          />
        )}
      />

      <div className="space-y-2">
        <Label htmlFor="staff-fullName">{tf("fullName")}</Label>
        <Input
          id="staff-fullName"
          aria-invalid={!!errors.fullName}
          autoComplete="off"
          {...form.register("fullName")}
        />
        <FieldError id="staff-fullName-error" message={errors.fullName?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="staff-phone">{tf("phone")}</Label>
        <Input
          id="staff-phone"
          type="tel"
          inputMode="tel"
          aria-invalid={!!errors.phone}
          autoComplete="off"
          {...form.register("phone")}
        />
        <FieldError id="staff-phone-error" message={errors.phone?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="staff-birthDate">{tf("birthDate")}</Label>
          <Input id="staff-birthDate" type="date" {...form.register("birthDate")} />
          <FieldError id="staff-birthDate-error" message={errors.birthDate?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-hireDate">{tf("hireDate")}</Label>
          <Input id="staff-hireDate" type="date" {...form.register("hireDate")} />
          <FieldError id="staff-hireDate-error" message={errors.hireDate?.message} />
        </div>
      </div>

      {branches.length > 1 && (
        <Controller
          control={form.control}
          name="branchIds"
          render={({ field }) => (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{tf("branches")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((branch) => {
                  const checked = (field.value ?? []).includes(branch.id);
                  return (
                    <label key={branch.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...(field.value ?? []), branch.id]
                              : (field.value ?? []).filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                    </label>
                  );
                })}
              </div>
              <FieldError id="staff-branches-error" message={errors.branchIds?.message} />
            </fieldset>
          )}
        />
      )}

      {!fixedRole && (
        <Controller
          control={form.control}
          name="roleCodes"
          render={({ field }) => (
            <fieldset className="space-y-2" disabled={isSelf}>
              <legend className="text-sm font-medium">{tf("roles")}</legend>
              {isSelf && <p className="text-xs text-muted-foreground">{tf("ownRolesLocked")}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {selectableRoles.map((role) => {
                  const checked = (field.value ?? []).includes(role.code);
                  return (
                    <label key={role.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={isSelf}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...(field.value ?? []), role.code]
                              : (field.value ?? []).filter((code) => code !== role.code),
                          )
                        }
                      />
                      {roleLabel(t, role)}
                    </label>
                  );
                })}
              </div>
              <FieldError id="staff-roles-error" message={errors.roleCodes?.message} />
            </fieldset>
          )}
        />
      )}

      <div className="space-y-2">
        <Label>{tf("salaryMethod")}</Label>
        <Controller
          control={form.control}
          name="salaryMethod"
          render={({ field }) => (
            <SegmentedGroup
              value={field.value ?? "PERCENT"}
              onValueChange={field.onChange}
              aria-label={tf("salaryMethod")}
            >
              {SALARY_METHODS.map((m) => (
                <SegmentedItem key={m} value={m} data-testid={`salary-${m}`}>
                  {tf(`methods.${m}`)}
                </SegmentedItem>
              ))}
            </SegmentedGroup>
          )}
        />
        <div className="space-y-2">
          <Label htmlFor="staff-amount">{tf(`amounts.${method}`)}</Label>
          <Input
            id="staff-amount"
            type="number"
            inputMode="decimal"
            step={method === "PERCENT" ? "0.1" : "1000"}
            min={0}
            key={amountField}
            aria-invalid={!!errors[amountField]}
            {...form.register(amountField)}
          />
          <FieldError id="staff-amount-error" message={errors[amountField]?.message} />
        </div>
      </div>

      <Controller
        control={form.control}
        name="gender"
        render={({ field }) => (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{tf("gender")}</legend>
            <RadioGroup
              value={field.value ?? "MALE"}
              onValueChange={field.onChange}
              className="flex gap-4"
            >
              {GENDERS.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={g} />
                  {tf(`genders.${g}`)}
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        )}
      />

      <div className="space-y-2">
        <Label htmlFor="staff-password">{person ? tf("newPassword") : tf("password")}</Label>
        <div className="flex gap-2">
          <Input
            id="staff-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            placeholder={person ? tf("keepPassword") : undefined}
            {...form.register("password")}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.setValue("password", generatePassword(), { shouldDirty: true });
              setShowPassword(true);
            }}
          >
            <RefreshCw /> {tf("generate")}
          </Button>
        </div>
        <FieldError id="staff-password-error" message={errors.password?.message} />
      </div>

      {person && (
        <fieldset className="space-y-3 rounded-md border p-3" data-testid="staff-safety">
          <legend className="px-1 text-sm font-medium">{tf("safety")}</legend>
          <Controller
            control={form.control}
            name="signInCode"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id="staff-signInCode"
                  checked={field.value === "TELEGRAM"}
                  disabled={!person.telegramLinked}
                  onCheckedChange={(on) => field.onChange(on ? "TELEGRAM" : "OFF")}
                  data-testid="staff-sign-in-code"
                />
                <div className="space-y-1">
                  <Label htmlFor="staff-signInCode">{tf("signInCode")}</Label>
                  <p className="text-xs text-muted-foreground">{tf("signInCodeHint")}</p>
                  <FieldError id="staff-signInCode-error" message={errors.signInCode?.message} />
                </div>
              </div>
            )}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={signOutEverywhere}
              disabled={signedOut !== "idle"}
              data-testid="staff-sign-out-all"
            >
              {tf("signOutAll")}
            </Button>
            {signedOut === "done" && (
              <span className="text-xs text-muted-foreground">{tf("signedOutAll")}</span>
            )}
          </div>
        </fieldset>
      )}
    </FormDialog>
  );
}
