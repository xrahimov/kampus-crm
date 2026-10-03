"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { branchSchema } from "@/lib/validation/settings";
import type { BranchDto } from "@/server/services/settings/branches.service";

import { FormDialog } from "../shared/form-dialog";
import { RowActions } from "../shared/row-actions";

type Input = z.input<typeof branchSchema>;
type Output = z.output<typeof branchSchema>;

export function BranchesCard({
  branches,
  onChanged,
}: {
  branches: BranchDto[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [dialog, setDialog] = useState<{ open: boolean; branch: BranchDto | null }>({
    open: false,
    branch: null,
  });
  const [deactivating, setDeactivating] = useState<BranchDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(branchSchema),
    defaultValues: { name: "", isActive: true },
  });

  useEffect(() => {
    if (!dialog.open) return;
    form.reset({ name: dialog.branch?.name ?? "", isActive: dialog.branch?.isActive ?? true });
  }, [dialog, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (dialog.branch)
        await api(`/branches/${dialog.branch.id}`, { method: "PATCH", body: values });
      else await api("/branches", { method: "POST", body: values });
      setDialog({ open: false, branch: null });
      onChanged();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>{t("settings.branches.title")}</CardTitle>
          <CardDescription>{t("settings.branches.description")}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, branch: null })}
          data-testid="add-branch"
        >
          <Plus /> {t("settings.branches.add")}
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t("settings.branches.name")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => (
              <TableRow key={branch.id} data-testid="branch-row">
                <TableCell className="pl-6 font-medium">{branch.name}</TableCell>
                <TableCell>
                  <Badge variant={branch.isActive ? "success" : "muted"}>
                    {branch.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RowActions
                    name={branch.name}
                    onEdit={() => setDialog({ open: true, branch })}
                    onDelete={() => setDeactivating(branch)}
                    deleteLabel={t("settings.branches.deactivate")}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) setError(null);
          setDialog((d) => ({ ...d, open }));
        }}
        title={dialog.branch ? t("settings.branches.edit") : t("settings.branches.add")}
        onSubmit={form.handleSubmit(onSubmit)}
        submitting={isSubmitting}
        error={error}
        testId="branch-dialog"
      >
        <div className="space-y-2">
          <Label htmlFor="branch-name">{t("settings.branches.name")}</Label>
          <Input id="branch-name" aria-invalid={!!errors.name} {...form.register("name")} />
          <FieldError id="branch-name-error" message={errors.name?.message} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="branch-active">{t("common.active")}</Label>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="branch-active"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={t("settings.branches.deactivateTitle")}
        description={t("settings.branches.deactivateText", { name: deactivating?.name ?? "" })}
        confirmLabel={t("settings.branches.deactivate")}
        onConfirm={async () => {
          if (!deactivating) return;
          await api(`/branches/${deactivating.id}`, { method: "DELETE" });
          onChanged();
        }}
      />
    </Card>
  );
}
