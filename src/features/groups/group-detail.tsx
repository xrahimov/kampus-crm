"use client";

import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarOff,
  Flag,
  Pencil,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { creatableBranches, type BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import type { Page } from "@/lib/validation/common";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { GroupDayOffDto } from "@/server/services/groups/day-off.service";
import type {
  GroupDto,
  GroupHistoryDto,
  GroupNoteDto,
} from "@/server/services/groups/groups.service";
import type { GroupSyllabusDto } from "@/server/services/settings/syllabus.service";
import type { MonthGridDto } from "@/server/services/groups/lessons.service";
import type { GroupHomeworkDto } from "@/server/services/homework/homework.service";
import type { GroupMaterialsDto } from "@/server/services/materials/materials.service";
import type { MembershipDto } from "@/server/services/groups/memberships.service";
import type { GroupFormOptions } from "@/server/services/groups/options.service";
import type { PaymentOptionsDto } from "@/server/services/students/payments.service";
import type { DiscountDto } from "@/server/services/students/discounts.service";
import type { StudentCommentDto } from "@/server/services/students/students.service";

import { AttendanceGrid } from "./attendance-grid";
import { CommentsTab } from "./comments-tab";
import { DiscountsTab } from "./discounts-tab";
import { GradesGrid } from "./grades-grid";
import { GroupDialog } from "./group-dialog";
import { ChangeTeacherDialog, DayOffDialog, SupportTeachersDialog } from "./group-dialogs";
import { GroupCoinsTab } from "@/features/coins/group-coins-tab";
import { GroupExamsTab } from "@/features/exams/group-exams-tab";
import { GroupHomeworkTab } from "@/features/homework/group-homework-tab";
import { GroupMaterialsTab } from "@/features/materials/group-materials-tab";
import { GroupKnowledgeTab } from "@/features/tests/group-knowledge-tab";
import { GroupTestsTab } from "@/features/tests/group-tests-tab";
import { GroupVideoCard } from "@/features/video/group-video-card";
import type { GroupVideoDto } from "@/server/services/video/video.service";
import type { CoinReasonDto, GroupCoinRowDto } from "@/server/services/coins/coins.service";
import type { ExamDto, ExamOptions } from "@/server/services/exams/exams.service";
import type {
  GroupKnowledgeDto,
  TestDto,
  TestOptions,
} from "@/server/services/tests/tests.service";

import { GroupStatusBadge } from "./groups-page";
import { MembersPanel } from "./members-panel";
import { MoveBranchDialog } from "./move-branch-dialog";
import { HistoryTab, NotesTab } from "./notes-history";
import { SyllabusTab } from "./syllabus-tab";
import { weekdayLabel } from "./weekday";

const TABS = [
  "attendance",
  "grades",
  "homework",
  "materials",
  "syllabus",
  "tests",
  "knowledge",
  "notes",
  "exams",
  "discounts",
  "coins",
  "comments",
  "history",
] as const;

/** EXP §5 "/groups/:id": info card and members on the left, tabs on the right. */
export function GroupDetail({
  group,
  grid,
  members,
  daysOff,
  notes,
  syllabus,
  history,
  discounts,
  comments,
  exams,
  examOptions,
  tests,
  testOptions,
  knowledge,
  coins,
  coinReasons,
  video,
  homework,
  materials,
  paymentOptions,
  options,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
  can,
}: {
  group: GroupDto;
  grid: MonthGridDto;
  members: MembershipDto[];
  daysOff: GroupDayOffDto[];
  notes: GroupNoteDto[];
  syllabus: GroupSyllabusDto;
  history: Page<GroupHistoryDto>;
  discounts: DiscountDto[];
  comments: StudentCommentDto[];
  exams: ExamDto[] | null;
  examOptions: ExamOptions | null;
  /** null when the user may not see tests. */
  tests: TestDto[] | null;
  testOptions: TestOptions | null;
  knowledge: GroupKnowledgeDto | null;
  coins: GroupCoinRowDto[];
  coinReasons: CoinReasonDto[];
  video: GroupVideoDto;
  homework: GroupHomeworkDto;
  materials: GroupMaterialsDto;
  paymentOptions: PaymentOptionsDto;
  options: GroupFormOptions;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  can: {
    update: boolean;
    delete: boolean;
    mark: boolean;
    createStudent: boolean;
    pay: boolean;
    discount: boolean;
    comment: boolean;
    leads: boolean;
    exams: boolean;
    tests: boolean;
    giveCoins: boolean;
    manageCoins: boolean;
    sms: boolean;
  };
}) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    null | "edit" | "move" | "finish" | "archive" | "support" | "changeTeacher" | "dayOff"
  >(null);
  const close = () => setDialog(null);
  const refresh = () => startTransition(() => router.refresh());
  const { options: branchOptions, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const archived = group.status === "ARCHIVED";
  const editable = can.update && !archived;
  const tab = (searchParams.get("tab") ?? "attendance") as (typeof TABS)[number];
  const showArchived = searchParams.get("archived") === "1";

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const date = (v: string) => fmt(parseDateOnly(v), { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/groups">
          <ArrowLeft /> {t("groups.title")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="group-title">
            {group.name}
          </h1>
          <GroupStatusBadge status={group.status} />
          {group.courseColor && (
            <span
              className="inline-block size-3 rounded-full"
              style={{ backgroundColor: group.courseColor }}
              aria-hidden
            />
          )}
        </div>
        {(can.update || can.delete) && (
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog("edit")}
                data-testid="group-edit"
              >
                <Pencil /> {t("common.edit")}
              </Button>
            )}
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="group-more">
                    {td("more")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog("support")}>
                    <Users /> {td("supportTeachers")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setDialog("changeTeacher")}
                    disabled={group.teachers.length === 0}
                  >
                    <UserCog /> {td("changeTeacher")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog("dayOff")}>
                    <CalendarOff /> {td("dayOff")}
                  </DropdownMenuItem>
                  {branchOptions.length > 1 && (
                    <DropdownMenuItem onSelect={() => setDialog("move")}>
                      <ArrowRightLeft /> {t("groups.actions.moveBranch")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("finish")}>
                    <Flag /> {t("groups.actions.finish")}
                  </DropdownMenuItem>
                  {can.delete && (
                    <DropdownMenuItem
                      onSelect={() => setDialog("archive")}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 /> {t("common.archive")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{td("info")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label={t("groups.columns.course")} value={group.courseName} />
                <Row label={td("price")} value={money(group.coursePrice)} />
                <Row label={td("gradingSystem")} value={group.gradingSystemName || "—"} />
                <Row label={td("branch")} value={group.branchName} />
                <Row label={t("groups.columns.opened")} value={date(group.startDate)} />
                <Row label={t("groups.columns.ends")} value={date(group.endDate)} />
                <Row
                  label={td("duration")}
                  value={td("months", { count: group.courseDurationMonths })}
                />
                <Row label={td("activeStudents")} value={String(group.activeStudents)} />
                <Row label={td("lessonsHeld")} value={String(group.lessonsHeld)} />
                <Row
                  label={t("groups.columns.days")}
                  value={t(`groups.patterns.${group.weekdayPattern}`)}
                />
              </dl>

              <h3 className="mt-4 mb-1 text-sm font-medium">{td("schedule")}</h3>
              <ul className="text-sm" data-testid="group-schedule">
                {group.slots.map((s) => (
                  <li key={s.weekday} className="flex justify-between gap-2 py-0.5">
                    <span>{weekdayLabel(fmt, s.weekday, "long")}</span>
                    <span className="tabular-nums">
                      {s.startTime} – {s.endTime}
                      {s.roomName && <span className="text-muted-foreground"> · {s.roomName}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 mb-1 text-sm font-medium">{t("groups.form.teachers")}</h3>
              {group.teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1 text-sm" data-testid="group-teachers">
                  {group.teachers.map((x) => (
                    <li
                      key={x.userId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link href={`/teachers/${x.userId}`} className="font-medium hover:underline">
                        {x.fullName}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{t(`groups.teacherRoles.${x.role}`)}</Badge>
                        <span className="tabular-nums">
                          {x.shareType === "PERCENT" ? `${x.shareValue}%` : money(x.shareValue)}{" "}
                          {x.shareType !== "PERCENT" &&
                            t(`groups.shareTypes.${x.shareType}`).toLowerCase()}
                        </span>
                        <span>{td("sinceDate", { date: date(x.since) })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {group.supportTeachers.length > 0 && (
                <>
                  <h3 className="mt-4 mb-1 text-sm font-medium">{t("groups.columns.support")}</h3>
                  <ul className="text-sm" data-testid="group-support">
                    {group.supportTeachers.map((x) => (
                      <li key={x.userId}>
                        <Link href={`/teachers/${x.userId}`} className="hover:underline">
                          {x.fullName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {daysOff.length > 0 && (
                <>
                  <h3 className="mt-4 mb-1 text-sm font-medium">{td("daysOff")}</h3>
                  <ul className="text-sm" data-testid="group-days-off">
                    {daysOff.map((d) => (
                      <li key={d.id} className="flex justify-between gap-2">
                        <span>{date(d.date)}</span>
                        <span className="text-right text-muted-foreground">
                          {d.reason}
                          {d.movedTo && (
                            <>
                              {" · "}
                              {td("movedTo", {
                                date: date(d.movedTo.date),
                                start: d.movedTo.startTime,
                                end: d.movedTo.endTime,
                              })}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <GroupVideoCard
            groupId={group.id}
            initial={video}
            canHost={can.mark && !archived}
            canSms={can.sms}
          />

          <Card data-testid="members-card">
            <CardContent className="pt-6">
              <MembersPanel
                groupId={group.id}
                groupArchived={archived}
                members={members}
                showArchived={showArchived}
                onToggleArchived={(v) => setParam("archived", v ? "1" : null)}
                canEdit={can.update}
                canCreateStudent={can.createStudent}
                canPay={can.pay}
                canLeads={can.leads}
                canSms={can.sms}
                paymentOptions={paymentOptions}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "attendance" ? null : v)}>
              <TabsList className="h-auto flex-wrap">
                {TABS.map((k) => (
                  <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
                    {td(`tabs.${k}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="attendance" className="pt-4">
                <AttendanceGrid
                  groupId={group.id}
                  months={group.months}
                  grid={grid}
                  canMark={can.mark && !archived}
                  canEdit={editable}
                  topics={syllabus.topics}
                />
              </TabsContent>
              <TabsContent value="grades" className="pt-4">
                <GradesGrid
                  groupId={group.id}
                  months={group.months}
                  grid={grid}
                  gradingSystemName={group.gradingSystemName}
                  canMark={can.mark && !archived}
                />
              </TabsContent>
              <TabsContent value="homework" className="pt-4">
                <GroupHomeworkTab data={homework} canSet={can.mark && !archived} />
              </TabsContent>
              <TabsContent value="materials" className="pt-4">
                <GroupMaterialsTab
                  groupId={group.id}
                  data={materials}
                  canSet={can.mark && !archived}
                />
              </TabsContent>
              <TabsContent value="syllabus" className="pt-4">
                <SyllabusTab data={syllabus} />
              </TabsContent>
              <TabsContent value="notes" className="pt-4">
                <NotesTab groupId={group.id} notes={notes} canEdit={can.update} />
              </TabsContent>
              <TabsContent value="history" className="pt-4">
                <HistoryTab history={history} />
              </TabsContent>
              <TabsContent value="tests" className="pt-4">
                {tests === null ? (
                  <Alert>{t("tests.hidden")}</Alert>
                ) : (
                  <GroupTestsTab
                    groupId={group.id}
                    tests={tests}
                    options={testOptions}
                    canCreate={can.tests && !archived}
                  />
                )}
              </TabsContent>
              <TabsContent value="knowledge" className="pt-4">
                {knowledge === null ? (
                  <Alert>{t("tests.hidden")}</Alert>
                ) : (
                  <GroupKnowledgeTab groupId={group.id} initial={knowledge} />
                )}
              </TabsContent>
              <TabsContent value="coins" className="pt-4">
                <GroupCoinsTab
                  groupId={group.id}
                  rows={coins}
                  reasons={coinReasons}
                  canGive={can.giveCoins && !archived}
                  canExceed={can.manageCoins}
                />
              </TabsContent>
              <TabsContent value="exams" className="pt-4">
                <GroupExamsTab
                  groupId={group.id}
                  exams={exams}
                  options={examOptions}
                  branches={branches}
                  canCreate={can.exams && !archived}
                />
              </TabsContent>
              <TabsContent value="discounts" className="pt-4">
                <DiscountsTab
                  groupId={group.id}
                  discounts={discounts}
                  members={members}
                  coursePrice={group.coursePrice}
                  canGive={can.discount && !archived}
                />
              </TabsContent>
              <TabsContent value="comments" className="pt-4">
                <CommentsTab
                  groupId={group.id}
                  comments={comments}
                  members={members}
                  canWrite={can.comment}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <GroupDialog
        open={dialog === "edit"}
        onOpenChange={(open) => !open && close()}
        group={group}
        branches={branchOptions}
        defaultBranchId={defaultId}
        courses={options.courses}
        rooms={options.rooms}
        gradingSystems={options.gradingSystems}
        teachers={options.teachers}
        onSaved={refresh}
      />
      <MoveBranchDialog
        group={dialog === "move" ? group : null}
        branches={branchOptions}
        onOpenChange={(open) => !open && close()}
        onSaved={refresh}
      />
      <SupportTeachersDialog
        group={group}
        open={dialog === "support"}
        onOpenChange={(open) => !open && close()}
        teachers={options.teachers}
        onSaved={refresh}
      />
      <ChangeTeacherDialog
        group={group}
        open={dialog === "changeTeacher"}
        onOpenChange={(open) => !open && close()}
        teachers={options.teachers}
        onSaved={refresh}
      />
      <DayOffDialog
        group={group}
        open={dialog === "dayOff"}
        onOpenChange={(open) => !open && close()}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={dialog === "finish"}
        onOpenChange={(open) => !open && close()}
        title={t("groups.finishTitle")}
        description={t("groups.finishText", { name: group.name })}
        confirmLabel={t("groups.actions.finish")}
        onConfirm={async () => {
          await api(`/groups/${group.id}/finish`, { method: "POST" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => !open && close()}
        title={t("groups.archiveTitle")}
        description={t("groups.archiveText", { name: group.name })}
        confirmLabel={t("common.archive")}
        onConfirm={async () => {
          await api(`/groups/${group.id}`, { method: "DELETE" });
          router.push("/groups");
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
