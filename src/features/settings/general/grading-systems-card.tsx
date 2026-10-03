"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { gradingSystemSchema, ROUNDING_TYPES } from "@/lib/validation/settings";
import type { GradingSystemDto } from "@/server/services/settings/grading-systems.service";

import { FormDialog } from "../shared/form-dialog";
import { RowActions } from "../shared/row-actions";

type Input = z.input<typeof gradingSystemSchema>;
type Output = z.output<typeof gradingSystemSchema>;

const emptyValues = (): Input => ({
  name: "",
  rounding: "STANDARD",
  levels: [{ name: "", minScore: 0, maxScore: 100 }],
});

export function GradingSystemsCard({
  systems,
  onChanged,
}: {
  systems: GradingSystemDto[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [dialog, setDialog] = useState<{ open: boolean; system: GradingSystemDto | null }>({
    open: false,
    system: null,
  });
  const [deleting, setDeleting] = useState<GradingSystemDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(gradingSystemSchema),
    defaultValues: emptyValues(),
  });
  const levels = useFieldArray({ control: form.control, name: "levels" });

  useEffect(() => {
    if (!dialog.open) return;
    form.reset(
      dialog.system
        ? {
            name: dialog.system.name,
            rounding: dialog.system.rounding,
            levels: dialog.system.levels.map((l) => ({
              name: l.name,
              minScore: l.minScore,
              maxScore: l.maxScore,
            })),
          }
        : emptyValues(),
    );
  }, [dialog, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (dialog.system) {
        await api(`/grading-systems/${dialog.system.id}`, { method: "PUT", body: values });
      } else {
        await api("/grading-systems", { method: "POST", body: values });
      }
      setDialog({ open: false, system: null });
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
          <CardTitle>{t("settings.gradingSystems.title")}</CardTitle>
          <CardDescription>{t("settings.gradingSystems.description")}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, system: null })}
          data-testid="add-grading-system"
        >
          <Plus /> {t("settings.gradingSystems.add")}
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t("settings.gradingSystems.name")}</TableHead>
              <TableHead>{t("settings.gradingSystems.rounding")}</TableHead>
              <TableHead>{t("settings.gradingSystems.levelsCount")}</TableHead>
              <TableHead>{t("settings.gradingSystems.coursesCount")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {systems.map((system) => (
              <TableRow key={system.id} data-testid="grading-system-row">
                <TableCell className="pl-6 font-medium">{system.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {t(`settings.gradingSystems.roundingTypes.${system.rounding}`)}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{system.levels.length}</TableCell>
                <TableCell className="tabular-nums">{system.coursesCount}</TableCell>
                <TableCell>
                  <RowActions
                    name={system.name}
                    onEdit={() => setDialog({ open: true, system })}
                    onDelete={() => setDeleting(system)}
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
        title={dialog.system ? t("settings.gradingSystems.edit") : t("settings.gradingSystems.add")}
        description={t("settings.gradingSystems.formHint")}
        onSubmit={form.handleSubmit(onSubmit)}
        submitting={isSubmitting}
        error={error}
        side="right"
        testId="grading-system-dialog"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gs-name">{t("settings.gradingSystems.name")}</Label>
            <Input id="gs-name" aria-invalid={!!errors.name} {...form.register("name")} />
            <FieldError id="gs-name-error" message={errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gs-rounding">{t("settings.gradingSystems.rounding")}</Label>
            <Controller
              control={form.control}
              name="rounding"
              render={({ field }) => (
                <Select value={field.value ?? "STANDARD"} onValueChange={field.onChange}>
                  <SelectTrigger id="gs-rounding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUNDING_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`settings.gradingSystems.roundingTypes.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("settings.gradingSystems.levels")}</legend>
          <FieldError
            id="gs-levels-error"
            message={errors.levels?.root?.message ?? errors.levels?.message}
          />
          <div className="space-y-2">
            {levels.fields.map((level, index) => {
              const levelErrors = errors.levels?.[index];
              return (
                <div
                  key={level.id}
                  className="grid grid-cols-[1fr_5rem_5rem_auto] items-start gap-2"
                >
                  <div>
                    <Input
                      aria-label={t("settings.gradingSystems.levelName")}
                      placeholder={t("settings.gradingSystems.levelName")}
                      aria-invalid={!!levelErrors?.name}
                      {...form.register(`levels.${index}.name`)}
                    />
                    <FieldError
                      id={`gs-level-${index}-name`}
                      message={levelErrors?.name?.message}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      step="any"
                      aria-label={t("settings.gradingSystems.minScore")}
                      aria-invalid={!!levelErrors?.minScore}
                      {...form.register(`levels.${index}.minScore`)}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      step="any"
                      aria-label={t("settings.gradingSystems.maxScore")}
                      aria-invalid={!!levelErrors?.maxScore}
                      {...form.register(`levels.${index}.maxScore`)}
                    />
                    <FieldError
                      id={`gs-level-${index}-max`}
                      message={levelErrors?.maxScore?.message}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => levels.remove(index)}
                    disabled={levels.fields.length <= 1}
                    aria-label={t("common.remove")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const last = form.getValues(`levels.${levels.fields.length - 1}`);
              const nextMin = Number(last?.maxScore ?? 0) + 1;
              levels.append({ name: "", minScore: nextMin, maxScore: nextMin });
            }}
          >
            <Plus /> {t("settings.gradingSystems.addLevel")}
          </Button>
        </fieldset>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.gradingSystems.deleteTitle")}
        description={t("settings.gradingSystems.deleteText", {
          name: deleting?.name ?? "",
          count: deleting?.coursesCount ?? 0,
        })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/grading-systems/${deleting.id}`, { method: "DELETE" });
          onChanged();
        }}
      />
    </Card>
  );
}
