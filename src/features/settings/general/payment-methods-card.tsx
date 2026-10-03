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
import { paymentMethodSchema } from "@/lib/validation/settings";
import type { PaymentMethodDto } from "@/server/services/settings/payment-methods.service";

import { FormDialog } from "../shared/form-dialog";
import { RowActions } from "../shared/row-actions";

type Input = z.input<typeof paymentMethodSchema>;
type Output = z.output<typeof paymentMethodSchema>;

export function PaymentMethodsCard({
  methods,
  onChanged,
}: {
  methods: PaymentMethodDto[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [dialog, setDialog] = useState<{ open: boolean; method: PaymentMethodDto | null }>({
    open: false,
    method: null,
  });
  const [deleting, setDeleting] = useState<PaymentMethodDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: { name: "", isActive: true, sortOrder: 0 },
  });

  useEffect(() => {
    if (!dialog.open) return;
    form.reset({
      name: dialog.method?.name ?? "",
      isActive: dialog.method?.isActive ?? true,
      sortOrder: dialog.method?.sortOrder ?? methods.length,
    });
  }, [dialog, form, methods.length]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (dialog.method) {
        await api(`/payment-methods/${dialog.method.id}`, { method: "PATCH", body: values });
      } else {
        await api("/payment-methods", { method: "POST", body: values });
      }
      setDialog({ open: false, method: null });
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
          <CardTitle>{t("settings.paymentMethods.title")}</CardTitle>
          <CardDescription>{t("settings.paymentMethods.description")}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, method: null })}
          data-testid="add-payment-method"
        >
          <Plus /> {t("settings.paymentMethods.add")}
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t("settings.paymentMethods.name")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map((method) => (
              <TableRow key={method.id} data-testid="payment-method-row">
                <TableCell className="pl-6 font-medium">{method.name}</TableCell>
                <TableCell>
                  <Badge variant={method.isActive ? "success" : "muted"}>
                    {method.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RowActions
                    name={method.name}
                    onEdit={() => setDialog({ open: true, method })}
                    onDelete={() => setDeleting(method)}
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
        title={dialog.method ? t("settings.paymentMethods.edit") : t("settings.paymentMethods.add")}
        onSubmit={form.handleSubmit(onSubmit)}
        submitting={isSubmitting}
        error={error}
        testId="payment-method-dialog"
      >
        <div className="space-y-2">
          <Label htmlFor="pm-name">{t("settings.paymentMethods.name")}</Label>
          <Input id="pm-name" aria-invalid={!!errors.name} {...form.register("name")} />
          <FieldError id="pm-name-error" message={errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-order">{t("settings.paymentMethods.sortOrder")}</Label>
          <Input id="pm-order" type="number" min={0} {...form.register("sortOrder")} />
          <FieldError id="pm-order-error" message={errors.sortOrder?.message} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pm-active">{t("common.active")}</Label>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="pm-active"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.paymentMethods.deleteTitle")}
        description={t("settings.paymentMethods.deleteText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/payment-methods/${deleting.id}`, { method: "DELETE" });
          onChanged();
        }}
      />
    </Card>
  );
}
