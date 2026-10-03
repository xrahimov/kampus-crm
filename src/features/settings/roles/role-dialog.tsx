"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { PERMISSIONS, type Permission } from "@/lib/rbac/permissions";
import { roleSchema } from "@/lib/validation/staff";
import type { RoleDto } from "@/server/services/staff/roles.service";

import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof roleSchema>;
type Output = z.output<typeof roleSchema>;

/** Permissions grouped by module, in catalogue order (EXP §8 permission cards). */
function groupedPermissions(): Array<{ module: string; permissions: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const moduleKey = p.split(".")[0]!;
    if (!groups.has(moduleKey)) groups.set(moduleKey, []);
    groups.get(moduleKey)!.push(p);
  }
  return Array.from(groups, ([module, permissions]) => ({ module, permissions }));
}

export function RoleDialog({
  open,
  onOpenChange,
  role,
  grantable,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleDto | null;
  /** Permissions the signed-in user may hand out (their own). */
  grantable: readonly string[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.roles");
  const [error, setError] = useState<string | null>(null);
  const canGrant = (p: Permission) => grantable.includes("*") || grantable.includes(p);

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", isActive: true, permissions: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      role
        ? { name: role.name, isActive: role.isActive, permissions: role.permissions }
        : { name: "", isActive: true, permissions: [] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (role) await api(`/roles/${role.id}`, { method: "PATCH", body: values });
      else await api("/roles", { method: "POST", body: values });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const groups = groupedPermissions();

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={role ? tr("edit") : tr("add")}
      description={role?.isSystem ? tr("systemHint") : undefined}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="role-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="role-name">{tr("name")}</Label>
        <Input id="role-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="role-name-error" message={errors.name?.message} />
      </div>

      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Switch id="role-active" checked={!!field.value} onCheckedChange={field.onChange} />
            <Label htmlFor="role-active">{t("common.active")}</Label>
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="permissions"
        render={({ field }) => {
          const selected = new Set(field.value ?? []);
          const toggle = (p: Permission, next: boolean) => {
            const set = new Set(selected);
            if (next) set.add(p);
            else set.delete(p);
            field.onChange(Array.from(set));
          };
          return (
            <div className="space-y-3">
              <p className="text-sm font-medium">{tr("permissions")}</p>
              {groups.map((group) => {
                const all = group.permissions.filter(canGrant);
                const allOn = all.length > 0 && all.every((p) => selected.has(p));
                return (
                  <fieldset key={group.module} className="rounded-md border p-3">
                    <legend className="px-1 text-sm font-medium">
                      <label className="inline-flex items-center gap-2">
                        <Checkbox
                          checked={allOn}
                          disabled={all.length === 0}
                          onCheckedChange={(next) => {
                            const set = new Set(selected);
                            for (const p of all) {
                              if (next) set.add(p);
                              else set.delete(p);
                            }
                            field.onChange(Array.from(set));
                          }}
                        />
                        {t(`permissions.modules.${group.module}`)}
                      </label>
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected.has(p)}
                            disabled={!canGrant(p)}
                            onCheckedChange={(next) => toggle(p, next === true)}
                            data-testid={`perm-${p}`}
                          />
                          {t(`permissions.names.${p}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <FieldError id="role-permissions-error" message={errors.permissions?.message} />
            </div>
          );
        }}
      />
    </FormDialog>
  );
}
