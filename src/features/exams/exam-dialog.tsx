"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedGroup, SegmentedItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { parseDateOnly } from "@/lib/dates";
import { examSchema, type ExamInput, type ExamType } from "@/lib/validation/exams";
import type { ExamDto, ExamOptions } from "@/server/services/exams/exams.service";

type Input = z.input<typeof examSchema>;

const NONE = "__none";
const ALL = "__all";

const today = () => new Date().toISOString().slice(0, 10);

/** Months between a group's start date and today, rounded down. */
function monthsStudied(startDate: string): number {
  const start = parseDateOnly(startDate);
  const now = new Date();
  return Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      now.getMonth() -
      start.getMonth() -
      (now.getDate() < start.getDate() ? 1 : 0),
  );
}

/**
 * "Imtihon qo'shish" drawer (EXP §7): GURUH IMTIHONI / MOCK IMTIHON toggle,
 * group picker for mocks ("Guruhlarni saralash"), optional details, grading.
 */
export function ExamDialog({
  open,
  onOpenChange,
  exam,
  options,
  branches,
  fixedGroupId,
  defaultType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: ExamDto | null;
  options: ExamOptions;
  branches: BranchOption[];
  /** Group detail: the exam belongs to this group and the type cannot change. */
  fixedGroupId?: string;
  defaultType?: ExamType;
  onSaved: (exam: ExamDto) => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("exams.form");
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState<{
    courseId: string;
    allBranches: boolean;
    branchIds: string[];
    minMonths: string;
  }>({ courseId: ALL, allBranches: true, branchIds: [], minMonths: "" });

  const empty = (): Input => ({
    type: defaultType ?? "GROUP",
    name: "",
    groupId: fixedGroupId ?? "",
    isRetake: false,
    date: today(),
    startTime: "09:00",
    endTime: "10:00",
    examinerId: "",
    roomId: "",
    gradingSystemId: "",
    passScore: "",
    maxScore: "",
    price: "",
    capacity: "",
    groupIds: [],
  });

  const form = useForm<Input, unknown, ExamInput>({
    resolver: zodResolver(examSchema) as unknown as Resolver<Input, unknown, ExamInput>,
    defaultValues: empty(),
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setMore(!!(exam?.examinerId || exam?.roomId));
      setPick({ courseId: ALL, allBranches: true, branchIds: [], minMonths: "" });
    }
  }

  useEffect(() => {
    if (!open) return;
    form.reset(
      exam
        ? {
            type: exam.type,
            name: exam.name,
            groupId: exam.groupId ?? "",
            isRetake: exam.isRetake,
            date: exam.date,
            startTime: exam.startTime,
            endTime: exam.endTime,
            examinerId: exam.examinerId ?? "",
            roomId: exam.roomId ?? "",
            gradingSystemId: exam.gradingSystemId ?? "",
            passScore: exam.passScore,
            maxScore: exam.maxScore,
            price: exam.price || "",
            capacity: exam.capacity ?? "",
            groupIds: exam.groups.map((g) => g.id),
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam]);

  const type = useWatch({ control: form.control, name: "type" }) ?? "GROUP";
  const groupId = useWatch({ control: form.control, name: "groupId" });
  const groupIds = useWatch({ control: form.control, name: "groupIds" }) ?? [];

  /** Rooms follow the branch of the chosen group (or of the first target group). */
  const branchId =
    type === "GROUP"
      ? options.groups.find((g) => g.id === groupId)?.branchId
      : options.groups.find((g) => g.id === groupIds[0])?.branchId;
  const rooms = branchId ? options.rooms.filter((r) => r.branchId === branchId) : options.rooms;

  const filteredGroups = useMemo(() => {
    const min = Number(pick.minMonths) || 0;
    return options.groups.filter(
      (g) =>
        g.status !== "ARCHIVED" &&
        (pick.courseId === ALL || g.courseId === pick.courseId) &&
        (pick.allBranches || pick.branchIds.includes(g.branchId)) &&
        monthsStudied(g.startDate) >= min,
    );
  }, [options.groups, pick]);

  async function onSubmit(values: ExamInput) {
    setError(null);
    try {
      const saved = exam
        ? await api<ExamDto>(`/exams/${exam.id}`, { method: "PATCH", body: values })
        : await api<ExamDto>("/exams", { method: "POST", body: values });
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const msg = (key: keyof Input) => errors[key]?.message as string | undefined;

  const idSelect = (
    name: "examinerId" | "roomId" | "gradingSystemId",
    label: string,
    items: Array<{ id: string; name: string }>,
    noneLabel: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`exam-${name}`}>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value ? String(field.value) : NONE}
            onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
          >
            <SelectTrigger id={`exam-${name}`} aria-invalid={!!errors[name]}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{noneLabel}</SelectItem>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError id={`exam-${name}-error`} message={msg(name)} />
    </div>
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={exam ? t("exams.edit") : t("exams.add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="exam-dialog"
    >
      {!fixedGroupId && !exam && (
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <SegmentedGroup
              value={field.value}
              onValueChange={field.onChange}
              aria-label={tf("type")}
              data-testid="exam-type"
            >
              <SegmentedItem value="GROUP" id="exam-type-group">
                {t("exams.types.GROUP")}
              </SegmentedItem>
              <SegmentedItem value="MOCK" id="exam-type-mock">
                {t("exams.types.MOCK")}
              </SegmentedItem>
            </SegmentedGroup>
          )}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="exam-name">{tf("name")}</Label>
        <Input id="exam-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="exam-name-error" message={msg("name")} />
      </div>

      {type === "GROUP" ? (
        <>
          {!fixedGroupId && (
            <div className="space-y-2">
              <Label htmlFor="exam-groupId">{tf("group")}</Label>
              <Controller
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger id="exam-groupId" aria-invalid={!!errors.groupId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>----</SelectItem>
                      {options.groups
                        .filter((g) => g.status !== "ARCHIVED")
                        .map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} · {g.courseName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError id="exam-groupId-error" message={msg("groupId")} />
            </div>
          )}
          <Controller
            control={form.control}
            name="isRetake"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                {tf("retake")}
              </label>
            )}
          />
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="exam-price">{tf("price")}</Label>
            <Input
              id="exam-price"
              type="number"
              min={0}
              step="any"
              placeholder={tf("priceHint")}
              aria-invalid={!!errors.price}
              {...form.register("price")}
            />
            <FieldError id="exam-price-error" message={msg("price")} />
          </div>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{tf("pick")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exam-pick-course">{tf("course")}</Label>
                <Select
                  value={pick.courseId}
                  onValueChange={(v) => setPick((p) => ({ ...p, courseId: v }))}
                >
                  <SelectTrigger id="exam-pick-course">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{tf("anyCourse")}</SelectItem>
                    {options.courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-pick-months">{tf("minMonths")}</Label>
                <Input
                  id="exam-pick-months"
                  type="number"
                  min={0}
                  value={pick.minMonths}
                  onChange={(e) => setPick((p) => ({ ...p, minMonths: e.target.value }))}
                />
              </div>
            </div>
            {branches.length > 1 && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pick.allBranches}
                    onCheckedChange={(v) => setPick((p) => ({ ...p, allBranches: !!v }))}
                  />
                  {tf("allBranches")}
                </label>
                {!pick.allBranches && (
                  <div className="flex flex-wrap gap-3">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={pick.branchIds.includes(b.id)}
                          onCheckedChange={(v) =>
                            setPick((p) => ({
                              ...p,
                              branchIds: v
                                ? [...p.branchIds, b.id]
                                : p.branchIds.filter((x) => x !== b.id),
                            }))
                          }
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="exam-pick-all"
              onClick={() =>
                form.setValue(
                  "groupIds",
                  Array.from(new Set([...groupIds, ...filteredGroups.map((g) => g.id)])),
                  { shouldValidate: true },
                )
              }
            >
              {tf("pickAll")}
            </Button>
          </fieldset>

          <div className="space-y-2">
            <Label>
              {tf("selected")}{" "}
              <span className="text-muted-foreground">
                {tf("selectedCount", { count: groupIds.length })}
              </span>
            </Label>
            <Controller
              control={form.control}
              name="groupIds"
              render={({ field }) => {
                const shown = options.groups.filter(
                  (g) => filteredGroups.includes(g) || (field.value ?? []).includes(g.id),
                );
                return shown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tf("noGroups")}</p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {shown.map((g) => {
                      const checked = (field.value ?? []).includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            data-testid="exam-group-option"
                            onCheckedChange={(v) =>
                              field.onChange(
                                v
                                  ? [...(field.value ?? []), g.id]
                                  : (field.value ?? []).filter((x) => x !== g.id),
                              )
                            }
                          />
                          <span>{g.name}</span>
                          <span className="text-muted-foreground">· {g.courseName}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              }}
            />
            <FieldError id="exam-groupIds-error" message={msg("groupIds")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-capacity">{tf("capacity")}</Label>
            <Input
              id="exam-capacity"
              type="number"
              min={1}
              aria-invalid={!!errors.capacity}
              {...form.register("capacity")}
            />
            <FieldError id="exam-capacity-error" message={msg("capacity")} />
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="exam-date">{tf("date")}</Label>
          <Input
            id="exam-date"
            type="date"
            aria-invalid={!!errors.date}
            {...form.register("date")}
          />
          <FieldError id="exam-date-error" message={msg("date")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exam-start">{tf("startTime")}</Label>
          <Input id="exam-start" type="time" {...form.register("startTime")} />
          <FieldError id="exam-start-error" message={msg("startTime")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exam-end">{tf("endTime")}</Label>
          <Input id="exam-end" type="time" {...form.register("endTime")} />
          <FieldError id="exam-end-error" message={msg("endTime")} />
        </div>
      </div>

      <div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
        >
          {more ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {tf("more")}
        </button>
        {more && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {idSelect(
              "examinerId",
              tf("examiner"),
              options.examiners.map((e) => ({ id: e.id, name: e.fullName })),
              tf("none"),
            )}
            {idSelect("roomId", tf("room"), rooms, tf("none"))}
          </div>
        )}
      </div>

      {idSelect("gradingSystemId", tf("gradingSystem"), options.gradingSystems, tf("custom"))}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exam-pass">{tf("passScore")}</Label>
          <Input
            id="exam-pass"
            type="number"
            min={0}
            step="any"
            aria-invalid={!!errors.passScore}
            {...form.register("passScore")}
          />
          <FieldError id="exam-pass-error" message={msg("passScore")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exam-max">{tf("maxScore")}</Label>
          <Input
            id="exam-max"
            type="number"
            min={0}
            step="any"
            aria-invalid={!!errors.maxScore}
            {...form.register("maxScore")}
          />
          <FieldError id="exam-max-error" message={msg("maxScore")} />
        </div>
      </div>
    </FormDialog>
  );
}
