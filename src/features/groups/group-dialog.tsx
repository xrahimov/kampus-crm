"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { BranchSelect, type BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { idSchema } from "@/lib/validation/common";
import {
  GROUP_STATUSES,
  GROUP_TEACHER_ROLES,
  SHARE_TYPES,
  WEEKDAY_PATTERNS,
  WEEKDAYS,
  type GroupInput,
  type GroupUpdateInput,
  type Weekday,
} from "@/lib/validation/groups";
import { timeSchema } from "@/lib/validation/settings";
import type { GroupDto } from "@/server/services/groups/groups.service";
import type { GroupFormOptions } from "@/server/services/groups/options.service";

import { patternDays, weekdayLabel } from "./weekday";

export interface TeacherOption {
  id: string;
  fullName: string;
}

const NONE = "__none__";
const money = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");

/** The drawer's own shape (EXP §5): one time range for all days, or a row per day. */
const formSchema = z
  .object({
    branchId: idSchema,
    name: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
    courseId: z.string().min(1, "validation.required"),
    gradingSystemId: z.string().nullable(),
    weekdayPattern: z.enum(WEEKDAY_PATTERNS),
    customDays: z.array(z.coerce.number().int().min(1).max(7)),
    perDay: z.boolean(),
    startTime: timeSchema,
    endTime: timeSchema,
    roomId: z.string().nullable(),
    days: z.array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        startTime: timeSchema,
        endTime: timeSchema,
        roomId: z.string().nullable(),
      }),
    ),
    teachers: z
      .array(
        z.object({
          userId: z.string().min(1, "validation.required"),
          role: z.enum(GROUP_TEACHER_ROLES),
          shareType: z.enum(SHARE_TYPES),
          shareValue: money,
        }),
      )
      .max(3, "validation.teachersMax"),
    startDate: z.string().min(1, "validation.required"),
    endDate: z.string(),
    status: z.enum(GROUP_STATUSES),
  })
  .refine((g) => g.weekdayPattern !== "CUSTOM" || g.customDays.length > 0, {
    message: "validation.slotsMin",
    path: ["customDays"],
  })
  .refine((g) => g.perDay || g.endTime > g.startTime, {
    message: "validation.workHours",
    path: ["endTime"],
  })
  .refine((g) => !g.endDate || g.endDate >= g.startDate, {
    message: "validation.endAfterStart",
    path: ["endDate"],
  });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

function toApiBody(v: FormOutput): GroupInput {
  const days = patternDays(v.weekdayPattern, v.customDays as Weekday[]);
  const slots = days.map((weekday) => {
    const row = v.perDay ? v.days.find((d) => d.weekday === weekday) : undefined;
    return {
      weekday,
      startTime: row?.startTime ?? v.startTime,
      endTime: row?.endTime ?? v.endTime,
      roomId: (row ? row.roomId : v.roomId) || null,
    };
  });
  return {
    branchId: v.branchId,
    name: v.name,
    courseId: v.courseId,
    gradingSystemId: v.gradingSystemId || null,
    weekdayPattern: v.weekdayPattern,
    slots,
    teachers: v.teachers,
    startDate: v.startDate,
    endDate: v.endDate || null,
    status: v.status,
  };
}

export function GroupDialog({
  open,
  onOpenChange,
  group,
  branches,
  defaultBranchId,
  courses,
  rooms,
  gradingSystems,
  teachers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupDto | null;
  branches: BranchOption[];
  defaultBranchId: string;
  courses: GroupFormOptions["courses"];
  rooms: GroupFormOptions["rooms"];
  gradingSystems: GroupFormOptions["gradingSystems"];
  teachers: TeacherOption[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tg = useTranslations("groups.form");
  const format = useFormatter();
  const [error, setError] = useState<string | null>(null);

  const emptyDays = () =>
    WEEKDAYS.map((weekday) => ({ weekday, startTime: "09:00", endTime: "10:30", roomId: null }));
  const empty = (): FormInput => ({
    branchId: defaultBranchId,
    name: "",
    courseId: "",
    gradingSystemId: null,
    weekdayPattern: "EVEN",
    customDays: [],
    perDay: false,
    startTime: "09:00",
    endTime: "10:30",
    roomId: null,
    days: emptyDays(),
    teachers: [],
    startDate: todayIso(),
    endDate: "",
    status: "ACTIVE",
  });

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: empty(),
  });
  const teacherRows = useFieldArray({ control: form.control, name: "teachers" });

  useEffect(() => {
    if (!open) return;
    if (!group) {
      form.reset(empty());
      return;
    }
    const first = group.slots[0];
    const uniform = group.slots.every(
      (s) =>
        s.startTime === first?.startTime &&
        s.endTime === first?.endTime &&
        s.roomId === first?.roomId,
    );
    form.reset({
      branchId: group.branchId,
      name: group.name,
      courseId: group.courseId,
      gradingSystemId: group.gradingSystemId,
      weekdayPattern: group.weekdayPattern,
      customDays: group.slots.map((s) => s.weekday),
      perDay: !uniform,
      startTime: first?.startTime ?? "09:00",
      endTime: first?.endTime ?? "10:30",
      roomId: first?.roomId ?? null,
      days: WEEKDAYS.map((weekday) => {
        const slot = group.slots.find((s) => s.weekday === weekday);
        return {
          weekday,
          startTime: slot?.startTime ?? first?.startTime ?? "09:00",
          endTime: slot?.endTime ?? first?.endTime ?? "10:30",
          roomId: slot?.roomId ?? null,
        };
      }),
      teachers: group.teachers.map((x) => ({
        userId: x.userId,
        role: x.role,
        shareType: x.shareType,
        shareValue: x.shareValue,
      })),
      startDate: group.startDate,
      endDate: group.endDate,
      status: group.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, defaultBranchId]);

  async function onSubmit(values: FormOutput) {
    setError(null);
    const body = toApiBody(values);
    try {
      if (group) {
        const { branchId: _branchId, ...rest } = body;
        const patch: GroupUpdateInput = rest;
        await api(`/groups/${group.id}`, { method: "PATCH", body: patch });
      } else {
        await api("/groups", { method: "POST", body });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const branchId = useWatch({ control: form.control, name: "branchId" });
  const pattern = useWatch({ control: form.control, name: "weekdayPattern" });
  const customDays = useWatch({ control: form.control, name: "customDays" }) ?? [];
  const perDay = useWatch({ control: form.control, name: "perDay" });
  const activeDays = patternDays(pattern ?? "EVEN", customDays.map(Number) as Weekday[]);
  const branchCourses = courses.filter((c) => c.branchId === branchId && !c.isArchived);
  const branchRooms = rooms.filter((r) => r.branchId === branchId);

  const roomSelect = (
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    id: string,
  ) => (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} aria-label={tg("room")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{tg("noRoom")}</SelectItem>
        {branchRooms.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={group ? tg("edit") : tg("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="group-dialog"
    >
      {!group && (
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <BranchSelect
              id="group-branch"
              branches={branches}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="group-name">{tg("name")}</Label>
        <Input id="group-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="group-name-error" message={errors.name?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="courseId"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="group-course">{tg("course")}</Label>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id="group-course" aria-invalid={!!errors.courseId}>
                  <SelectValue placeholder={tg("pickCourse")} />
                </SelectTrigger>
                <SelectContent>
                  {branchCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="group-course-error" message={errors.courseId?.message} />
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="gradingSystemId"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="group-grading">{tg("gradingOverride")}</Label>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : v)}
              >
                <SelectTrigger id="group-grading">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tg("useCourseGrading")}</SelectItem>
                  {gradingSystems.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{tg("gradingHint")}</p>
            </div>
          )}
        />
      </div>

      <Controller
        control={form.control}
        name="weekdayPattern"
        render={({ field }) => (
          <div className="space-y-2">
            <Label htmlFor="group-pattern">{tg("weekdays")}</Label>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="group-pattern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_PATTERNS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`groups.patterns.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {pattern === "CUSTOM" && (
        <Controller
          control={form.control}
          name="customDays"
          render={({ field }) => (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{tg("customDays")}</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((weekday) => {
                  const checked = (field.value ?? []).map(Number).includes(weekday);
                  return (
                    <label key={weekday} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...(field.value ?? []), weekday]
                              : (field.value ?? []).filter((d) => Number(d) !== weekday),
                          )
                        }
                      />
                      {weekdayLabel(format, weekday)}
                    </label>
                  );
                })}
              </div>
              <FieldError id="group-days-error" message={errors.customDays?.message} />
            </fieldset>
          )}
        />
      )}

      <Controller
        control={form.control}
        name="perDay"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Switch id="group-perday" checked={!!field.value} onCheckedChange={field.onChange} />
            <Label htmlFor="group-perday">{tg("perDay")}</Label>
          </div>
        )}
      />

      {!perDay ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="group-start">{tg("startTime")}</Label>
            <Input id="group-start" type="time" {...form.register("startTime")} />
            <FieldError id="group-start-error" message={errors.startTime?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-end">{tg("endTime")}</Label>
            <Input id="group-end" type="time" {...form.register("endTime")} />
            <FieldError id="group-end-error" message={errors.endTime?.message} />
          </div>
          <Controller
            control={form.control}
            name="roomId"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="group-room">{tg("room")}</Label>
                {roomSelect(field.value, field.onChange, "group-room")}
              </div>
            )}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {activeDays.map((weekday) => {
            const index = weekday - 1;
            return (
              <div
                key={weekday}
                className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[5rem_1fr_1fr_1fr]"
              >
                <span className="text-sm font-medium">{weekdayLabel(format, weekday)}</span>
                <Input
                  type="time"
                  aria-label={tg("startTime")}
                  {...form.register(`days.${index}.startTime`)}
                />
                <Input
                  type="time"
                  aria-label={tg("endTime")}
                  {...form.register(`days.${index}.endTime`)}
                />
                <Controller
                  control={form.control}
                  name={`days.${index}.roomId`}
                  render={({ field }) =>
                    roomSelect(field.value, field.onChange, `group-room-${weekday}`)
                  }
                />
              </div>
            );
          })}
          <FieldError
            id="group-slots-error"
            message={errors.days?.message ?? errors.root?.message}
          />
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tg("teachers")}</legend>
        {teacherRows.fields.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_6rem_auto]"
          >
            <Controller
              control={form.control}
              name={`teachers.${index}.userId`}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    aria-label={tg("teacher")}
                    aria-invalid={!!errors.teachers?.[index]?.userId}
                  >
                    <SelectValue placeholder={tg("teacher")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller
              control={form.control}
              name={`teachers.${index}.role`}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label={tg("teacherRole")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_TEACHER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`groups.teacherRoles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller
              control={form.control}
              name={`teachers.${index}.shareType`}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label={tg("shareType")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`groups.shareTypes.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Input
              type="number"
              min={0}
              step="any"
              aria-label={tg("shareValue")}
              aria-invalid={!!errors.teachers?.[index]?.shareValue}
              {...form.register(`teachers.${index}.shareValue`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.remove")}
              onClick={() => teacherRows.remove(index)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {teacherRows.fields.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              teacherRows.append({ userId: "", role: "MAIN", shareType: "PERCENT", shareValue: 0 })
            }
          >
            <Plus /> {tg("addTeacher")}
          </Button>
        )}
        <FieldError
          id="group-teachers-error"
          message={errors.teachers?.message ?? errors.teachers?.root?.message}
        />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="group-startDate">{tg("startDate")}</Label>
          <Input id="group-startDate" type="date" {...form.register("startDate")} />
          <FieldError id="group-startDate-error" message={errors.startDate?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-endDate">{tg("endDate")}</Label>
          <Input id="group-endDate" type="date" {...form.register("endDate")} />
          <p className="text-xs text-muted-foreground">{tg("endDateHint")}</p>
          <FieldError id="group-endDate-error" message={errors.endDate?.message} />
        </div>
      </div>

      {group && (
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="group-status">{t("common.status")}</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="group-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`groups.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      )}
    </FormDialog>
  );
}
