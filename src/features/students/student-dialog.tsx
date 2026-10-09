"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { generatePassword, todayIso } from "@/features/staff/password";
import { PhotoField } from "@/features/staff/photo-field";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import {
  GENDERS,
  studentCreateSchema,
  studentUpdateSchema,
  type StudentCreateInput,
  type StudentUpdateInput,
} from "@/lib/validation/students";
import type { StudentDetailDto, StudentOptions } from "@/server/services/students/students.service";

type Input = z.input<typeof studentCreateSchema>;
type Output = StudentCreateInput | StudentUpdateInput;

const ALL = "__all";

/** "O'quvchi qo'shish" drawer and the smaller "tahrirlash" dialog (EXP §6). */
export function StudentDialog({
  open,
  onOpenChange,
  student,
  options,
  branches,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentDetailDto | null;
  options: StudentOptions;
  branches: BranchOption[];
  defaultBranchId: string;
  onSaved: (student: StudentDetailDto) => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("students.form");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [sections, setSections] = useState({ group: false, parent: false, school: false });
  const [groupFilter, setGroupFilter] = useState({ branchId: ALL, teacherId: ALL, courseId: ALL });

  const empty = (): Input => ({
    branchId: defaultBranchId,
    fullName: "",
    phone: "+998",
    birthDate: "",
    gender: "MALE",
    photoUrl: null,
    password: "",
    sourceId: "",
    schoolId: "",
    note: "",
    membership: null,
    parent: null,
  });

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(
      student ? studentUpdateSchema : studentCreateSchema,
    ) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: empty(),
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setShowPassword(false);
      setSections({ group: false, parent: false, school: !!student?.schoolId });
      setGroupFilter({ branchId: defaultBranchId || ALL, teacherId: ALL, courseId: ALL });
    }
  }

  useEffect(() => {
    if (!open) return;
    form.reset(
      student
        ? {
            branchId: student.branchId,
            fullName: student.fullName,
            phone: student.phone ?? "",
            birthDate: student.birthDate ?? "",
            gender: student.gender,
            photoUrl: student.photoUrl,
            password: "",
            sourceId: student.sourceId ?? "",
            schoolId: student.schoolId ?? "",
            note: student.note ?? "",
            membership: null,
            parent: null,
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const membership = useWatch({ control: form.control, name: "membership" });
  const groups = options.groups.filter(
    (g) =>
      g.status !== "ARCHIVED" &&
      (groupFilter.branchId === ALL || g.branchId === groupFilter.branchId) &&
      (groupFilter.teacherId === ALL || g.teacherId === groupFilter.teacherId) &&
      (groupFilter.courseId === ALL || g.courseId === groupFilter.courseId),
  );
  const courses = options.courses.filter(
    (c) => groupFilter.branchId === ALL || c.branchId === groupFilter.branchId,
  );

  function toggle(key: keyof typeof sections) {
    const next = !sections[key];
    setSections((s) => ({ ...s, [key]: next }));
    if (key === "group") {
      form.setValue(
        "membership",
        next
          ? {
              groupId: "",
              joinedAt: todayIso(),
              billingFrom: "",
              customPrice: "",
              note: "",
              status: "ACTIVE",
            }
          : null,
      );
    }
    if (key === "parent") form.setValue("parent", next ? { fullName: "", phone: "+998" } : null);
    if (key === "school" && !next) form.setValue("schoolId", "");
  }

  async function onSubmit(values: Output) {
    setError(null);
    try {
      const saved = student
        ? await api<StudentDetailDto>(`/students/${student.id}`, { method: "PATCH", body: values })
        : await api<StudentDetailDto>("/students", { method: "POST", body: values });
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const err = (message: string | undefined) => (message ? message : undefined);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={student ? t("students.edit") : t("students.add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="student-dialog"
    >
      <Controller
        control={form.control}
        name="photoUrl"
        render={({ field }) => (
          <PhotoField
            value={field.value ?? null}
            name={form.getValues("fullName")}
            onChange={field.onChange}
          />
        )}
      />

      {!student && branches.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="student-branch">{tf("branch")}</Label>
          <Controller
            control={form.control}
            name="branchId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  setGroupFilter((f) => ({ ...f, branchId: v, courseId: ALL }));
                }}
              >
                <SelectTrigger id="student-branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="student-fullName">{tf("fullName")}</Label>
        <Input
          id="student-fullName"
          {...form.register("fullName")}
          aria-invalid={!!errors.fullName}
          autoComplete="off"
        />
        <FieldError id="student-fullName-error" message={err(errors.fullName?.message)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-phone">{tf("phone")}</Label>
          <Input
            id="student-phone"
            type="tel"
            {...form.register("phone")}
            aria-invalid={!!errors.phone}
          />
          <FieldError id="student-phone-error" message={err(errors.phone?.message)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-birthDate">{tf("birthDate")}</Label>
          <Input id="student-birthDate" type="date" {...form.register("birthDate")} />
          <FieldError id="student-birthDate-error" message={err(errors.birthDate?.message)} />
        </div>
      </div>

      {!student && (
        <>
          <div className="space-y-2">
            <Label htmlFor="student-password">{tf("password")}</Label>
            <div className="flex gap-2">
              <Input
                id="student-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                {...form.register("password")}
                aria-invalid={!!errors.password}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={tf("generate")}
                title={tf("generate")}
                onClick={() => {
                  form.setValue("password", generatePassword(), { shouldDirty: true });
                  setShowPassword(true);
                }}
              >
                <RefreshCw />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              {tf("showPassword")}
            </label>
            <p className="text-xs text-muted-foreground">{tf("passwordHint")}</p>
            <FieldError id="student-password-error" message={err(errors.password?.message)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-source">{tf("source")}</Label>
            <Controller
              control={form.control}
              name="sourceId"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger id="student-source">
                    <SelectValue placeholder={tf("sourcePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>{tf("gender")}</Label>
        <Controller
          control={form.control}
          name="gender"
          render={({ field }) => (
            <SegmentedGroup
              value={field.value}
              onValueChange={field.onChange}
              aria-label={tf("gender")}
            >
              {GENDERS.map((g) => (
                <SegmentedItem key={g} value={g} id={`student-gender-${g}`}>
                  {t(`students.genders.${g}`)}
                </SegmentedItem>
              ))}
            </SegmentedGroup>
          )}
        />
      </div>

      {student && (
        <div className="space-y-2">
          <Label htmlFor="student-note">{tf("note")}</Label>
          <Textarea id="student-note" rows={2} {...form.register("note")} />
        </div>
      )}

      {!student && (
        <>
          <Section
            open={sections.group}
            onToggle={() => toggle("group")}
            label={tf("groupSection")}
            hint={tf("groupHint")}
            testId="section-group"
          >
            {sections.group && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{tf("branch")}</Label>
                    <Select
                      value={groupFilter.branchId}
                      onValueChange={(v) =>
                        setGroupFilter((f) => ({ ...f, branchId: v, courseId: ALL }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("students.filters.all")}</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tf("teacher")}</Label>
                    <Select
                      value={groupFilter.teacherId}
                      onValueChange={(v) => setGroupFilter((f) => ({ ...f, teacherId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("students.filters.all")}</SelectItem>
                        {options.teachers.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tf("course")}</Label>
                    <Select
                      value={groupFilter.courseId}
                      onValueChange={(v) => setGroupFilter((f) => ({ ...f, courseId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("students.filters.all")}</SelectItem>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-group">{tf("group")}</Label>
                  <Controller
                    control={form.control}
                    name="membership.groupId"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="student-group"
                          aria-invalid={!!errors.membership?.groupId}
                        >
                          <SelectValue placeholder={tf("groupPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.length === 0 && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              {tf("noGroups")}
                            </p>
                          )}
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                              {g.teacherName ? ` (${g.teacherName})` : ""}
                              {g.time ? ` · ${g.time}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError
                    id="student-group-error"
                    message={err(errors.membership?.groupId?.message)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="student-joinedAt">{tf("joinedAt")}</Label>
                    <Input
                      id="student-joinedAt"
                      type="date"
                      {...form.register("membership.joinedAt")}
                      aria-invalid={!!errors.membership?.joinedAt}
                    />
                    <FieldError
                      id="student-joinedAt-error"
                      message={err(errors.membership?.joinedAt?.message)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-mstatus">{tf("status")}</Label>
                    <Controller
                      control={form.control}
                      name="membership.status"
                      render={({ field }) => (
                        <Select value={field.value ?? "ACTIVE"} onValueChange={field.onChange}>
                          <SelectTrigger id="student-mstatus">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["NEW", "TRIAL", "ACTIVE"] as const).map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`groups.memberStatuses.${s}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                {membership && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="student-customPrice">{t("groups.members.customPrice")}</Label>
                      <Input
                        id="student-customPrice"
                        type="number"
                        min={0}
                        step="1000"
                        {...form.register("membership.customPrice")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-billingFrom">{tf("billingFrom")}</Label>
                      <Input
                        id="student-billingFrom"
                        type="date"
                        {...form.register("membership.billingFrom")}
                        aria-invalid={!!errors.membership?.billingFrom}
                      />
                      <FieldError
                        id="student-billingFrom-error"
                        message={err(errors.membership?.billingFrom?.message)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section
            open={sections.parent}
            onToggle={() => toggle("parent")}
            label={tf("parentSection")}
            testId="section-parent"
          >
            {sections.parent && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="student-parentPhone">{tf("parentPhone")}</Label>
                    <Input
                      id="student-parentPhone"
                      type="tel"
                      {...form.register("parent.phone")}
                      aria-invalid={!!errors.parent?.phone}
                    />
                    <FieldError
                      id="student-parentPhone-error"
                      message={err(errors.parent?.phone?.message)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-parentName">{tf("parentName")}</Label>
                    <Input
                      id="student-parentName"
                      {...form.register("parent.fullName")}
                      aria-invalid={!!errors.parent?.fullName}
                    />
                    <FieldError
                      id="student-parentName-error"
                      message={err(errors.parent?.fullName?.message)}
                    />
                  </div>
                </div>
              </>
            )}
          </Section>
        </>
      )}

      <Section
        open={sections.school}
        onToggle={() => toggle("school")}
        label={tf("schoolSection")}
        testId="section-school"
      >
        {sections.school && (
          <>
            <div className="space-y-2">
              <Label htmlFor="student-school">{tf("school")}</Label>
              <Controller
                control={form.control}
                name="schoolId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="student-school">
                      <SelectValue placeholder={tf("schoolPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </>
        )}
      </Section>
    </FormDialog>
  );
}

/** The reference's collapsible "▸" sections of the drawer. */
function Section({
  open,
  onToggle,
  label,
  hint,
  testId,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        aria-expanded={open}
        data-testid={testId}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {label}
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
