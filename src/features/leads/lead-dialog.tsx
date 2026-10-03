"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import {
  LEAD_DAYS,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  leadSchema,
  leadUpdateSchema,
  type LeadInput,
  type LeadUpdateInput,
} from "@/lib/validation/leads";
import type { LeadColumnDto } from "@/server/services/leads/boards.service";
import type { LeadDto, LeadOptions } from "@/server/services/leads/leads.service";

type Input = z.input<typeof leadSchema>;
type Output = LeadInput | LeadUpdateInput;

const NONE = "__none";
const NEW = "__new";

/** "Yangi Lid" (EXP §2 form): every field optional except the name and the column. */
export function LeadDialog({
  open,
  onOpenChange,
  lead,
  boardId,
  columns,
  defaultColumnId,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadDto | null;
  boardId: string;
  columns: Array<{ id: string; name: string }>;
  defaultColumnId: string;
  options: LeadOptions;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("leads.form");
  const [error, setError] = useState<string | null>(null);
  const [phoneCount, setPhoneCount] = useState(1);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState(false);
  const [sources, setSources] = useState(options.sources);
  const [columnList, setColumnList] = useState(columns);

  const empty = (): Input => ({
    columnId: defaultColumnId,
    fullName: "",
    phones: ["+998"],
    birthDate: "",
    age: "",
    sourceId: "",
    teacherId: "",
    days: "",
    lessonTime: "",
    status: "NEW",
    temperature: "",
    comment: "",
  });

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(lead ? leadUpdateSchema : leadSchema) as unknown as Resolver<
      Input,
      unknown,
      Output
    >,
    defaultValues: empty(),
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setPhoneCount(Math.max(1, lead?.phones.length ?? 1));
      setNewColumn(null);
      setNewSource(null);
      setCustomTime(!!lead?.lessonTime && !options.lessonTimes.includes(lead.lessonTime));
      setSources(options.sources);
      setColumnList(columns);
    }
  }

  useEffect(() => {
    if (!open) return;
    form.reset(
      lead
        ? {
            columnId: lead.columnId,
            fullName: lead.fullName,
            phones: lead.phones.length ? lead.phones : ["+998"],
            birthDate: lead.birthDate ?? "",
            age: lead.age ?? "",
            sourceId: lead.sourceId ?? "",
            teacherId: lead.teacherId ?? "",
            days: lead.days ?? "",
            lessonTime: lead.lessonTime ?? "",
            status: lead.status,
            temperature: lead.temperature ?? "",
            comment: lead.comment ?? "",
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      let columnId = values.columnId;
      if (newColumn !== null) {
        const name = newColumn.trim();
        if (!name) {
          form.setError("columnId", { type: "manual", message: "validation.required" });
          return;
        }
        const created = await api<LeadColumnDto>(`/lead-boards/${boardId}/columns`, {
          method: "POST",
          body: { name },
        });
        columnId = created.id;
      }
      let sourceId = values.sourceId;
      if (newSource !== null) {
        const name = newSource.trim();
        if (!name) {
          form.setError("sourceId", { type: "manual", message: "validation.required" });
          return;
        }
        const created = await api<{ id: string; name: string }>("/lead-sources", {
          method: "POST",
          body: { name, isActive: true },
        });
        sourceId = created.id;
      }
      const body = { ...values, columnId, sourceId };
      if (lead) await api(`/leads/${lead.id}`, { method: "PATCH", body });
      else await api("/leads", { method: "POST", body });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const phoneErrors = errors.phones as Array<{ message?: string } | undefined> | undefined;

  const selectField = (
    name: "sourceId" | "teacherId" | "days" | "temperature",
    label: string,
    items: Array<{ value: string; label: string }>,
    extra?: { onNew?: () => void; noneLabel?: string },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`lead-${name}`}>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value ? String(field.value) : NONE}
            onValueChange={(v) => {
              if (v === NEW) {
                extra?.onNew?.();
                field.onChange("");
                return;
              }
              field.onChange(v === NONE ? "" : v);
            }}
          >
            <SelectTrigger id={`lead-${name}`} aria-invalid={!!errors[name]}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{extra?.noneLabel ?? "----"}</SelectItem>
              {items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
              {extra?.onNew && <SelectItem value={NEW}>{tf("createNew")}</SelectItem>}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError id={`lead-${name}-error`} message={errors[name]?.message as string | undefined} />
    </div>
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={lead ? t("leads.edit") : t("leads.add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="lead-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="lead-column">{tf("column")}</Label>
        {newColumn === null ? (
          <Controller
            control={form.control}
            name="columnId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  if (v === NEW) setNewColumn("");
                  else field.onChange(v);
                }}
              >
                <SelectTrigger id="lead-column" aria-invalid={!!errors.columnId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columnList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW}>{tf("createNew")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              id="lead-column"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder={tf("newColumn")}
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.cancel")}
              onClick={() => setNewColumn(null)}
            >
              <X />
            </Button>
          </div>
        )}
        <FieldError id="lead-column-error" message={errors.columnId?.message} />
      </div>

      {newSource === null ? (
        selectField(
          "sourceId",
          tf("source"),
          sources.map((s) => ({ value: s.id, label: s.name })),
          { onNew: () => setNewSource("") },
        )
      ) : (
        <div className="space-y-2">
          <Label htmlFor="lead-sourceId">{tf("source")}</Label>
          <div className="flex gap-2">
            <Input
              id="lead-sourceId"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder={tf("newSource")}
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.cancel")}
              onClick={() => setNewSource(null)}
            >
              <X />
            </Button>
          </div>
          <FieldError id="lead-sourceId-error" message={errors.sourceId?.message} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="lead-fullName">{tf("fullName")}</Label>
        <Input id="lead-fullName" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        <FieldError id="lead-fullName-error" message={errors.fullName?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lead-phone-0">{tf("phone")}</Label>
        {Array.from({ length: phoneCount }, (_, i) => (
          <div key={i} className="flex gap-2">
            <Input
              id={`lead-phone-${i}`}
              inputMode="tel"
              aria-label={i === 0 ? tf("phone") : tf("phoneN", { n: i + 1 })}
              aria-invalid={!!phoneErrors?.[i]}
              {...form.register(`phones.${i}` as const)}
            />
            {i > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={tf("removePhone")}
                onClick={() => {
                  const phones = [...(form.getValues("phones") ?? [])];
                  phones.splice(i, 1);
                  form.setValue("phones", phones);
                  setPhoneCount((n) => n - 1);
                }}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
        {phoneErrors?.map((e, i) =>
          e?.message ? (
            <FieldError key={i} id={`lead-phone-${i}-error`} message={e.message} />
          ) : null,
        )}
        {phoneCount < 5 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => {
              form.setValue(`phones.${phoneCount}`, "+998");
              setPhoneCount((n) => n + 1);
            }}
          >
            <Plus /> {tf("addPhone")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-birthDate">{tf("birthDate")}</Label>
          <Input
            id="lead-birthDate"
            type="date"
            aria-invalid={!!errors.birthDate}
            {...form.register("birthDate")}
          />
          <FieldError id="lead-birthDate-error" message={errors.birthDate?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-age">{tf("age")}</Label>
          <Input
            id="lead-age"
            type="number"
            min={1}
            max={120}
            aria-invalid={!!errors.age}
            {...form.register("age")}
          />
          <FieldError id="lead-age-error" message={errors.age?.message} />
        </div>
      </div>

      {selectField(
        "teacherId",
        tf("teacher"),
        options.teachers.map((x) => ({ value: x.id, label: x.fullName })),
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {selectField(
          "days",
          tf("days"),
          LEAD_DAYS.map((d) => ({ value: d, label: t(`leads.days.${d}`) })),
        )}
        <div className="space-y-2">
          <Label htmlFor="lead-lessonTime">{tf("lessonTime")}</Label>
          {customTime ? (
            <div className="flex gap-2">
              <Input
                id="lead-lessonTime"
                type="time"
                aria-invalid={!!errors.lessonTime}
                {...form.register("lessonTime")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("common.cancel")}
                onClick={() => {
                  setCustomTime(false);
                  form.setValue("lessonTime", "");
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
            <Controller
              control={form.control}
              name="lessonTime"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : NONE}
                  onValueChange={(v) => {
                    if (v === NEW) {
                      setCustomTime(true);
                      field.onChange("");
                      return;
                    }
                    field.onChange(v === NONE ? "" : v);
                  }}
                >
                  <SelectTrigger id="lead-lessonTime" aria-invalid={!!errors.lessonTime}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>----</SelectItem>
                    {options.lessonTimes.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW}>{tf("createNew")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          )}
          <FieldError id="lead-lessonTime-error" message={errors.lessonTime?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-status">{tf("status")}</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value ?? "NEW"} onValueChange={field.onChange}>
                <SelectTrigger id="lead-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`leads.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        {selectField(
          "temperature",
          tf("temperature"),
          LEAD_TEMPERATURES.map((x) => ({ value: x, label: t(`leads.temperatures.${x}`) })),
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lead-comment">{tf("comment")}</Label>
        <Textarea id="lead-comment" rows={3} {...form.register("comment")} />
        <FieldError id="lead-comment-error" message={errors.comment?.message} />
      </div>
    </FormDialog>
  );
}
