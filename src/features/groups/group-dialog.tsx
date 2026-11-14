"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
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
import { api, ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { idSchema } from "@/lib/validation/common";
import {
  GROUP_STATUSES,
  GROUP_TEACHER_ROLES,
  SHARE_TYPES,
  BILLING_MODES,
  WEEKDAY_PATTERNS,
  WEEKDAYS,
  type GroupInput,
  type GroupScheduleInput,
  type GroupUpdateInput,
  type Weekday,
} from "@/lib/validation/groups";
import { timeSchema } from "@/lib/validation/settings";
import { useDateFormat } from "@/lib/use-date-format";
import type { ClashDto } from "@/server/services/groups/clashes.service";
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
    billingMode: z.enum(BILLING_MODES),
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
    /** A running group: the day its new times start, and whether the students hear of it (A-193). */
    scheduleFrom: z.string(),
    notifySchedule: z.boolean(),
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
  })
  .superRefine((g, ctx) => {
    if (!g.perDay) return;
    // Each lesson day's own row must end after it starts.
    for (const weekday of patternDays(g.weekdayPattern, g.customDays as Weekday[])) {
      const row = g.days[weekday - 1];
      if (row && row.endTime <= row.startTime) {
        ctx.addIssue({
          code: "custom",
          message: "validation.workHours",
          path: ["days", weekday - 1, "endTime"],
        });
      }
    }
  });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** The slots the form describes: one per lesson day, with the common time or the day's own. */
function formSlots(v: {
  weekdayPattern: FormOutput["weekdayPattern"];
  customDays: Array<number | string | unknown>;
  perDay: boolean;
  startTime: string;
  endTime: string;
  roomId: string | null;
  days: FormOutput["days"];
}) {
  const days = [...patternDays(v.weekdayPattern, v.customDays.map(Number) as Weekday[])].sort();
  return days.map((weekday) => {
    const row = v.perDay ? v.days.find((d) => d.weekday === weekday) : undefined;
    return {
      weekday,
      startTime: row?.startTime ?? v.startTime,
      endTime: row?.endTime ?? v.endTime,
      roomId: (row ? row.roomId : v.roomId) || null,
    };
  });
}

function toApiBody(v: FormOutput): GroupInput {
  const slots = formSlots(v);
  return {
    branchId: v.branchId,
    name: v.name,
    courseId: v.courseId,
    gradingSystemId: v.gradingSystemId || null,
    billingMode: v.billingMode,
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
  mode = "full",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "schedule" shows only the days, times and rooms of an existing group (A-193). */
  mode?: "full" | "schedule";
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
  const fmt = useDateFormat();
  const [error, setError] = useState<string | null>(null);
  /* The clash warning (A-116) belongs to one exact form state: any edit hides it again. */
  const [clashState, setClashState] = useState<{ sig: string; clashes: ClashDto[] } | null>(null);

  const emptyDays = () =>
    WEEKDAYS.map((weekday) => ({ weekday, startTime: "09:00", endTime: "10:30", roomId: null }));
  const empty = (): FormInput => ({
    branchId: defaultBranchId,
    name: "",
    courseId: "",
    gradingSystemId: null,
    billingMode: "MONTHLY",
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
    scheduleFrom: todayIso(),
    notifySchedule: true,
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
      billingMode: group.billingMode,
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
      scheduleFrom: todayIso(),
      notifySchedule: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, defaultBranchId]);

  const watchedAll = useWatch({ control: form.control });
  const sig = JSON.stringify(watchedAll);
  const clashes = clashState && clashState.sig === sig ? clashState.clashes : null;

  async function onSubmit(values: FormOutput) {
    setError(null);
    // "Save anyway" resends the very form state the warning was shown for.
    const body: GroupInput = { ...toApiBody(values), ignoreClashes: clashes !== null };
    // A running group whose days or times change: from which day, and who hears of it (A-193).
    const change = timesChanged
      ? {
          ...(running ? { scheduleFrom: values.scheduleFrom || todayIso() } : {}),
          notifySchedule: values.notifySchedule,
        }
      : {};
    try {
      if (group && mode === "schedule") {
        const patch: GroupScheduleInput = {
          weekdayPattern: body.weekdayPattern,
          slots: body.slots,
          ignoreClashes: body.ignoreClashes,
          ...change,
        };
        await api(`/groups/${group.id}/schedule`, { method: "PATCH", body: patch });
      } else if (group) {
        const { branchId: _branchId, ...rest } = body;
        const patch: GroupUpdateInput = { ...rest, ...change };
        await api(`/groups/${group.id}`, { method: "PATCH", body: patch });
      } else {
        await api("/groups", { method: "POST", body });
      }
      setClashState(null);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT" && Array.isArray(e.meta?.clashes)) {
        setClashState({ sig, clashes: e.meta.clashes as ClashDto[] });
        return;
      }
      setError(applyApiError(e, form.setError));
    }
  }

  const clashLine = (c: ClashDto) => {
    const values = {
      day: weekdayLabel(fmt, c.weekday as Weekday, "short"),
      start: c.startTime,
      end: c.endTime,
      group: c.groupName,
      room: c.roomName ?? "",
      teacher: c.teacherName ?? "",
    };
    return c.kind === "ROOM" ? tg("clashes.room", values) : tg("clashes.teacher", values);
  };

  const { errors, isSubmitting } = form.formState;
  const branchId = useWatch({ control: form.control, name: "branchId" });
  const pattern = useWatch({ control: form.control, name: "weekdayPattern" });
  const customDays = useWatch({ control: form.control, name: "customDays" }) ?? [];
  const perDay = useWatch({ control: form.control, name: "perDay" });
  const activeDays = patternDays(pattern ?? "EVEN", customDays.map(Number) as Weekday[]);
  const scheduleOnly = mode === "schedule" && !!group;
  /* Changed days or times of a saved group: the form then asks from which day (A-193). */
  const timesOf = (slots: Array<{ weekday: number; startTime: string; endTime: string }>) =>
    slots.map((x) => `${x.weekday}:${x.startTime}-${x.endTime}`).join("|");
  const timesChanged =
    !!group &&
    timesOf(
      formSlots({
        weekdayPattern: pattern ?? "EVEN",
        customDays,
        perDay: !!perDay,
        startTime: watchedAll.startTime ?? "",
        endTime: watchedAll.endTime ?? "",
        roomId: null,
        days: (watchedAll.days ?? []).map((d, i) => ({
          weekday: d?.weekday ?? i + 1,
          startTime: d?.startTime ?? "",
          endTime: d?.endTime ?? "",
          roomId: null,
        })),
      }),
    ) !== timesOf(group.slots);
  const running = !!group && group.startDate < todayIso();
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
        if (!next) {
          setError(null);
          setClashState(null);
        }
        onOpenChange(next);
      }}
      title={scheduleOnly ? tg("scheduleTitle") : group ? tg("edit") : tg("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="group-dialog"
      submitLabel={clashes ? tg("clashes.saveAnyway") : undefined}
    >
      {clashes && (
        <Alert variant="destructive" data-testid="group-clashes">
          <p className="font-medium">{tg("clashes.title")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {clashes.map((c, i) => (
              <li key={i}>{clashLine(c)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">{tg("clashes.hint")}</p>
        </Alert>
      )}
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

      {!scheduleOnly && (
        <div className="space-y-2">
          <Label htmlFor="group-name">{tg("name")}</Label>
          <Input id="group-name" aria-invalid={!!errors.name} {...form.register("name")} />
          <FieldError id="group-name-error" message={errors.name?.message} />
        </div>
      )}

      <div className={scheduleOnly ? "hidden" : "grid gap-4 sm:grid-cols-2"}>
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
        name="billingMode"
        render={({ field }) => (
          <div className={scheduleOnly ? "hidden" : "space-y-2"}>
            <Label htmlFor="group-billing">{tg("billing")}</Label>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="group-billing" data-testid="group-billing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLING_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {tg(mode === "MONTHLY" ? "billingMonthly" : "billingPackages")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{tg("billingHint")}</p>
          </div>
        )}
      />

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
                      {weekdayLabel(fmt, weekday)}
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
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                id="group-perday"
                data-testid="group-perday"
                checked={!!field.value}
                onCheckedChange={(next) => {
                  const v = form.getValues();
                  if (next) {
                    // Every day starts from the common time and room, ready to be changed.
                    form.setValue(
                      "days",
                      WEEKDAYS.map((weekday) => ({
                        weekday,
                        startTime: v.startTime,
                        endTime: v.endTime,
                        roomId: v.roomId,
                      })),
                    );
                  } else {
                    const firstDay = v.days[activeDays[0] ? activeDays[0] - 1 : 0];
                    if (firstDay) {
                      form.setValue("startTime", firstDay.startTime);
                      form.setValue("endTime", firstDay.endTime);
                      form.setValue("roomId", firstDay.roomId);
                    }
                  }
                  field.onChange(next);
                }}
              />
              <Label htmlFor="group-perday">{tg("perDay")}</Label>
            </div>
            <p className="text-xs text-muted-foreground">{tg("perDayHint")}</p>
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
          {[...activeDays].sort().map((weekday) => {
            const index = weekday - 1;
            const rowError =
              errors.days?.[index]?.endTime?.message ?? errors.days?.[index]?.startTime?.message;
            return (
              <div
                key={weekday}
                data-testid={`group-day-${weekday}`}
                className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[5rem_1fr_1fr_1fr]"
              >
                <span className="text-sm font-medium">{weekdayLabel(fmt, weekday)}</span>
                <Input
                  type="time"
                  aria-label={`${weekdayLabel(fmt, weekday, "long")}: ${tg("startTime")}`}
                  {...form.register(`days.${index}.startTime`)}
                />
                <Input
                  type="time"
                  aria-label={`${weekdayLabel(fmt, weekday, "long")}: ${tg("endTime")}`}
                  aria-invalid={!!rowError}
                  {...form.register(`days.${index}.endTime`)}
                />
                <Controller
                  control={form.control}
                  name={`days.${index}.roomId`}
                  render={({ field }) =>
                    roomSelect(field.value, field.onChange, `group-room-${weekday}`)
                  }
                />
                {rowError && (
                  <div className="sm:col-span-4">
                    <FieldError id={`group-day-${weekday}-error`} message={rowError} />
                  </div>
                )}
              </div>
            );
          })}
          <FieldError
            id="group-slots-error"
            message={errors.days?.message ?? errors.root?.message}
          />
        </div>
      )}

      {timesChanged && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3" data-testid="schedule-change">
          {running && (
            <div className="space-y-2">
              <Label htmlFor="group-schedule-from">{tg("scheduleFrom")}</Label>
              <Input
                id="group-schedule-from"
                type="date"
                min={group?.startDate}
                max={todayIso()}
                aria-invalid={!!errors.scheduleFrom}
                {...form.register("scheduleFrom")}
              />
              <p className="text-xs text-muted-foreground">{tg("scheduleFromHint")}</p>
              <FieldError id="group-schedule-from-error" message={errors.scheduleFrom?.message} />
            </div>
          )}
          <Controller
            control={form.control}
            name="notifySchedule"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(next) => field.onChange(next === true)}
                  data-testid="schedule-notify"
                />
                {tg("notifySchedule")}
              </label>
            )}
          />
        </div>
      )}

      <fieldset className={scheduleOnly ? "hidden" : "space-y-2"}>
        <legend className="text-sm font-medium">{tg("teachers")}</legend>
        {teacherRows.fields.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.remove")}
              onClick={() => teacherRows.remove(index)}
            >
              <Trash2 />
            </Button>
            <div className="col-span-2 grid grid-cols-[1fr_1fr_5rem] gap-2">
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
            </div>
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

      <div className={scheduleOnly ? "hidden" : "grid gap-4 sm:grid-cols-2"}>
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

      {group && !scheduleOnly && (
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
