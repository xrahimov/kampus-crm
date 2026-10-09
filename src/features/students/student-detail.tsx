"use client";

import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  Pencil,
  Plus,
  Printer,
  Scale,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToLeadDialog } from "@/features/groups/to-lead-dialog";
import { LeaveReasonField } from "@/features/groups/leave-reason-field";
import { TransferDialog } from "@/features/groups/transfer-dialog";
import { AdjustmentDialog } from "@/features/payments/adjustment-dialog";
import { AdjustmentsTable } from "@/features/payments/adjustments-table";
import { PaymentDialog, type PayableMembership } from "@/features/payments/payment-dialog";
import { PaymentsTable } from "@/features/payments/payments-table";
import { RefundDialog } from "@/features/payments/refund-dialog";
import { ExcelLink } from "@/features/shared/excel-link";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { Page } from "@/lib/validation/common";
import type { MembershipStatus } from "@/lib/validation/groups";
import type { AdjustmentDto } from "@/server/services/students/adjustments.service";
import type { FamilyDto } from "@/server/services/students/families.service";
import type { PaymentDto, PaymentOptionsDto } from "@/server/services/students/payments.service";
import type {
  StudentCommentDto,
  StudentDetailDto,
  StudentHistoryDto,
  StudentOptions,
} from "@/server/services/students/students.service";

import type { StudentProgressDto } from "@/server/services/exams/exams.service";
import type { StudentTestResultsDto } from "@/server/services/tests/tests.service";

import { SendSmsDialog } from "@/features/sms/send-sms-dialog";
import type { CallDto } from "@/server/services/calls/calls.service";
import type { SmsLogRowDto } from "@/server/services/sms/sms.service";

import { CallsTab } from "./calls-tab";
import { CommentDialog } from "./comment-dialog";
import { SmsTab } from "./sms-tab";
import { ProgressTab } from "./progress-tab";
import { TestResultsTab } from "./test-results-tab";
import { FamilyCard } from "./family-card";
import { GroupCard } from "./group-card";
import { InstalmentsDialog } from "./instalments-dialog";
import { StudentDialog } from "./student-dialog";
import { BalanceBadge } from "./students-page";

const TABS = [
  "groups",
  "progress",
  "testResults",
  "comments",
  "sms",
  "history",
  "parents",
  "calls",
] as const;
const LEFT: MembershipStatus[] = ["ARCHIVED", "GRADUATED"];
const ALL = "__all";

/** EXP §6 "/students/view": profile card, action buttons, tabs, payment history. */
export function StudentDetail({
  student,
  comments,
  history,
  payments,
  adjustments,
  paymentGroupId,
  progress,
  testResults,
  sms,
  calls,
  qrSvg,
  options,
  paymentOptions,
  branches,
  family,
  can,
}: {
  student: StudentDetailDto;
  comments: StudentCommentDto[];
  history: Page<StudentHistoryDto>;
  payments: Page<PaymentDto> & { totalAmount: number };
  adjustments: AdjustmentDto[];
  paymentGroupId: string | null;
  progress: StudentProgressDto;
  testResults: StudentTestResultsDto;
  sms: SmsLogRowDto[];
  calls: CallDto[];
  qrSvg: string;
  options: StudentOptions;
  paymentOptions: PaymentOptionsDto;
  branches: BranchOption[];
  family: FamilyDto | null;
  can: {
    update: boolean;
    delete: boolean;
    blacklist: boolean;
    pay: boolean;
    refund: boolean;
    groups: boolean;
    leads: boolean;
    sms: boolean;
    discounts: boolean;
  };
}) {
  const t = useTranslations();
  const td = useTranslations("students.detail");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [dialog, setDialog] = useState<
    | null
    | "edit"
    | "field"
    | "addGroup"
    | "pay"
    | "refund"
    | "adjust"
    | "blacklist"
    | "parent"
    | "comment"
  >(null);
  const [payMembership, setPayMembership] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<StudentDetailDto["groups"][number] | null>(null);
  const [removing, setRemoving] = useState<StudentDetailDto["groups"][number] | null>(null);
  const [returning, setReturning] = useState<StudentDetailDto["groups"][number] | null>(null);
  const [splitting, setSplitting] = useState<StudentDetailDto["groups"][number] | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [parentsSms, setParentsSms] = useState(false);
  const [deletingParent, setDeletingParent] = useState<StudentDetailDto["parents"][number] | null>(
    null,
  );
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => setDialog(null);

  const tab = (searchParams.get("tab") ?? "groups") as (typeof TABS)[number];
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const date = (v: string | null) => (v ? fmt(parseDateOnly(v), { dateStyle: "medium" }) : "—");
  const visibleGroups = student.groups.filter(
    (g) => showArchivedGroups || !LEFT.includes(g.status),
  );
  const payable: PayableMembership[] = student.groups
    .filter((g) => !LEFT.includes(g.status))
    .map((g) => ({
      membershipId: g.membershipId,
      groupName: g.groupName,
      status: g.status,
      teacherName: g.teacherName,
      time: g.time,
    }));

  async function setStatus(membershipId: string, status: MembershipStatus) {
    setError(null);
    try {
      await api(`/memberships/${membershipId}`, { method: "PATCH", body: { status } });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  const profile: Array<[string, React.ReactNode]> = [
    [td("grade"), student.gradeAverage ?? t("students.noGrade")],
    [
      td("id"),
      <span key="id" className="font-mono text-xs">
        {student.id}
      </span>,
    ],
    [td("phone"), student.phone ?? "—"],
    [td("birthDate"), date(student.birthDate)],
    [td("appStatus"), student.hasAppPassword ? td("appOn") : td("appOff")],
  ];
  if (student.schoolName) profile.push([t("students.form.school"), student.schoolName]);
  if (student.sourceName) profile.push([t("students.form.source"), student.sourceName]);
  if (student.referredByName) profile.push([td("referredBy"), student.referredByName]);
  if (student.referralCode) {
    profile.push([
      td("referralCode"),
      <span key="referralCode" className="font-mono" data-testid="student-referral-code">
        {student.referralCode}
      </span>,
    ]);
  }
  if (student.referrals > 0) profile.push([td("referrals"), String(student.referrals)]);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/students">
          <ArrowLeft /> {td("back")}
        </Link>
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.has(error) ? t(error) : t("errors.internal")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-2">
                <BalanceBadge value={student.balance} className="text-sm" />
                <div className="flex gap-1">
                  {can.update && !student.isArchived && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={td("edit")}
                      title={td("edit")}
                      onClick={() => setDialog("edit")}
                      data-testid="edit-student"
                    >
                      <Pencil />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <Avatar
                  src={student.photoUrl}
                  name={student.fullName}
                  className="size-24 text-3xl"
                />
                <h1 className="text-xl font-semibold tracking-tight" data-testid="student-title">
                  {student.fullName}
                </h1>
                <div className="flex flex-wrap justify-center gap-1">
                  {student.isArchived && <Badge variant="muted">{td("archived")}</Badge>}
                  {student.isBlacklisted && (
                    <Badge variant="destructive">{t("students.blacklisted")}</Badge>
                  )}
                </div>
              </div>
              <dl className="space-y-1 text-sm">
                {profile.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
                {student.customFields.map((f) => (
                  <div key={f.id} className="flex justify-between gap-2" data-testid="custom-field">
                    <dt className="text-muted-foreground">{f.name}</dt>
                    <dd className="flex items-center gap-1 text-right font-medium">
                      {f.value ?? "—"}
                      {can.update && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          aria-label={t("common.delete")}
                          onClick={async () => {
                            await api(`/custom-fields/${f.id}`, { method: "DELETE" });
                            refresh();
                          }}
                        >
                          ×
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <div
                className="mx-auto size-28 [&_svg]:size-full"
                aria-label={td("qr")}
                role="img"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              {student.note && <p className="text-sm text-muted-foreground">{student.note}</p>}
            </CardContent>
          </Card>

          <FamilyCard
            student={student}
            family={family}
            canEdit={can.update && !student.isArchived}
            canDiscount={can.discounts}
            canSms={can.sms && !student.isArchived}
            onChanged={refresh}
          />

          <div className="grid gap-2">
            {can.update && !student.isArchived && (
              <Button variant="outline" onClick={() => setDialog("field")} data-testid="add-field">
                <Plus /> {td("addField")}
              </Button>
            )}
            {can.groups && !student.isArchived && !student.isBlacklisted && (
              <Button
                variant="outline"
                onClick={() => setDialog("addGroup")}
                data-testid="add-to-group"
              >
                <Users /> {td("addToGroup")}
              </Button>
            )}
            {can.pay && !student.isArchived && (
              <Button
                onClick={() => {
                  setPayMembership(null);
                  setDialog("pay");
                }}
                data-testid="pay-student"
              >
                <Wallet /> {td("pay")}
              </Button>
            )}
            {can.refund && paymentOptions.refundsEnabled && (
              <Button
                variant="outline"
                onClick={() => setDialog("refund")}
                data-testid="refund-student"
              >
                <Undo2 /> {td("refund")}
              </Button>
            )}
            {can.pay && student.groups.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setDialog("adjust")}
                data-testid="adjust-student"
              >
                <Scale /> {td("adjust")}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/students/${student.id}/badge`} target="_blank">
                <Printer /> {td("badge")}
              </Link>
            </Button>
            {can.blacklist && (
              <Button
                variant="outline"
                className={student.isBlacklisted ? "" : "text-destructive"}
                onClick={() => setDialog("blacklist")}
                data-testid="blacklist-student"
              >
                {student.isBlacklisted ? <BadgeCheck /> : <Ban />}{" "}
                {student.isBlacklisted ? td("unblacklist") : td("blacklist")}
              </Button>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardContent className="pt-6">
              <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "groups" ? null : v)}>
                <TabsList className="h-auto flex-wrap">
                  {TABS.map((k) => (
                    <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
                      {td(`tabs.${k}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="groups" className="space-y-4 pt-4">
                  {visibleGroups.length === 0 ? (
                    <EmptyState title={td("noGroups")} />
                  ) : (
                    visibleGroups.map((g) => (
                      <GroupCard
                        key={g.membershipId}
                        group={g}
                        canEdit={can.groups && !student.isArchived}
                        canPay={can.pay && !student.isArchived}
                        onPay={() => {
                          setPayMembership(g.membershipId);
                          setDialog("pay");
                        }}
                        onTransfer={() => setTransferring(g)}
                        onToLead={can.leads ? () => setReturning(g) : null}
                        onRemove={() => setRemoving(g)}
                        onStatus={(s) => void setStatus(g.membershipId, s)}
                        onInstalments={
                          can.pay && !student.isArchived ? () => setSplitting(g) : null
                        }
                      />
                    ))
                  )}
                  {student.groups.some((g) => LEFT.includes(g.status)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowArchivedGroups((v) => !v)}
                      data-testid="toggle-archived-groups"
                    >
                      {showArchivedGroups ? td("hideArchivedGroups") : td("showArchivedGroups")}
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="progress" className="pt-4">
                  <ProgressTab progress={progress} />
                </TabsContent>
                <TabsContent value="testResults" className="pt-4">
                  <TestResultsTab studentId={student.id} initial={testResults} />
                </TabsContent>

                <TabsContent value="sms" className="pt-4">
                  <SmsTab
                    studentId={student.id}
                    studentName={student.fullName}
                    hasPhone={Boolean(student.phone)}
                    messages={sms}
                    canSend={can.sms && !student.isArchived}
                  />
                </TabsContent>

                <TabsContent value="calls" className="pt-4">
                  <CallsTab studentId={student.id} phone={student.phone} calls={calls} />
                </TabsContent>

                <TabsContent value="comments" className="space-y-4 pt-4">
                  <CommentsList comments={comments} onAdd={() => setDialog("comment")} />
                </TabsContent>

                <TabsContent value="history" className="pt-4">
                  <HistoryList history={history} />
                </TabsContent>

                <TabsContent value="parents" className="space-y-4 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{t("students.parents.title")}</h2>
                    <div className="flex gap-2">
                      {can.sms && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={student.parents.length === 0}
                          onClick={() => setParentsSms(true)}
                          data-testid="parents-sms"
                        >
                          {t("students.parents.sms")}
                        </Button>
                      )}
                      {can.update && !student.isArchived && (
                        <Button
                          size="sm"
                          onClick={() => setDialog("parent")}
                          data-testid="add-parent"
                        >
                          <Plus /> {t("students.parents.add")}
                        </Button>
                      )}
                    </div>
                  </div>
                  {student.parents.length === 0 ? (
                    <EmptyState title={t("students.parents.empty")} />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("students.parents.fullName")}</TableHead>
                          <TableHead>{t("students.parents.phone")}</TableHead>
                          <TableHead className="w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {student.parents.map((p) => (
                          <TableRow key={p.id} data-testid="parent-row">
                            <TableCell className="font-medium">{p.fullName}</TableCell>
                            <TableCell className="tabular-nums">{p.phone}</TableCell>
                            <TableCell>
                              {can.update && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setDeletingParent(p)}
                                >
                                  {t("common.delete")}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{td("paymentHistory")}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={paymentGroupId ?? ALL}
                    onValueChange={(v) => setParam("paymentGroup", v)}
                  >
                    <SelectTrigger className="min-w-44" aria-label={t("payments.history.group")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{td("allGroups")}</SelectItem>
                      {student.groups.map((g) => (
                        <SelectItem key={g.membershipId} value={g.groupId}>
                          {g.groupName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t("payments.history.total", { amount: money(payments.totalAmount) })}
                  </span>
                  <ExcelLink
                    path="/payments/export.xlsx"
                    params={{ studentId: student.id, groupId: paymentGroupId ?? null }}
                    label={t("payments.history.excel")}
                    testId="payments-history-excel"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <PaymentsTable payments={payments.items} />
              </div>
              <Pagination
                page={payments.page}
                pageSize={payments.pageSize}
                total={payments.total}
              />
              <AdjustmentsTable
                adjustments={adjustments}
                canRemove={can.refund}
                onChanged={refresh}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <StudentDialog
        open={dialog === "edit"}
        onOpenChange={(open) => !open && close()}
        student={student}
        options={options}
        branches={branches}
        defaultBranchId={student.branchId}
        onSaved={refresh}
      />
      <CustomFieldDialog
        open={dialog === "field"}
        onOpenChange={(open) => !open && close()}
        studentId={student.id}
        onSaved={refresh}
      />
      <AddToGroupDialog
        open={dialog === "addGroup"}
        onOpenChange={(open) => !open && close()}
        student={student}
        options={options}
        onSaved={refresh}
      />
      <ParentDialog
        open={dialog === "parent"}
        onOpenChange={(open) => !open && close()}
        studentId={student.id}
        onSaved={refresh}
      />
      <CommentDialog
        student={dialog === "comment" ? student : null}
        onOpenChange={(open) => !open && close()}
        onSaved={refresh}
      />
      <PaymentDialog
        open={dialog === "pay"}
        onOpenChange={(open) => !open && close()}
        studentName={student.fullName}
        memberships={payable}
        defaultMembershipId={payMembership}
        options={paymentOptions}
        onSaved={refresh}
      />
      <RefundDialog
        open={dialog === "refund"}
        onOpenChange={(open) => !open && close()}
        payments={payments.items}
        onSaved={refresh}
      />
      <AdjustmentDialog
        open={dialog === "adjust"}
        onOpenChange={(open) => !open && close()}
        memberships={student.groups.map((g) => ({
          membershipId: g.membershipId,
          groupName: g.groupName,
          status: g.status,
        }))}
        onSaved={refresh}
      />
      <InstalmentsDialog
        open={!!splitting}
        onOpenChange={(open) => !open && setSplitting(null)}
        membershipId={splitting?.membershipId ?? null}
        groupName={splitting?.groupName ?? ""}
        onSaved={refresh}
      />
      <TransferDialog
        open={!!transferring}
        onOpenChange={(open) => !open && setTransferring(null)}
        membershipId={transferring?.membershipId ?? null}
        currentGroupId={transferring?.groupId ?? ""}
        studentName={student.fullName}
        onSaved={refresh}
      />
      <ToLeadDialog
        open={!!returning}
        onOpenChange={(open) => !open && setReturning(null)}
        membershipId={returning?.membershipId ?? null}
        studentName={student.fullName}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setRemoveReason("");
          }
        }}
        title={t("students.remove.title")}
        description={t("students.remove.text", { name: student.fullName })}
        confirmLabel={t("students.groupCard.actions.remove")}
        onConfirm={async () => {
          if (!removing) return;
          await api(`/memberships/${removing.membershipId}/remove`, {
            method: "POST",
            body: { reason: removeReason.trim() || null },
          });
          refresh();
        }}
      >
        <LeaveReasonField
          kind="LEAVE"
          value={removeReason}
          onChange={setRemoveReason}
          active={!!removing}
          id="remove-reason"
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "blacklist"}
        onOpenChange={(open) => !open && close()}
        title={student.isBlacklisted ? td("unblacklist") : t("students.blacklistTitle")}
        description={
          student.isBlacklisted ? "" : t("students.blacklistText", { name: student.fullName })
        }
        confirmLabel={student.isBlacklisted ? td("unblacklist") : td("blacklist")}
        onConfirm={async () => {
          await api(`/students/${student.id}/blacklist`, {
            method: "POST",
            body: { value: !student.isBlacklisted },
          });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deletingParent}
        onOpenChange={(open) => !open && setDeletingParent(null)}
        title={t("students.parents.deleteTitle")}
        description={t("students.parents.deleteText", { name: deletingParent?.fullName ?? "" })}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!deletingParent) return;
          await api(`/parents/${deletingParent.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <SendSmsDialog
        open={parentsSms}
        onOpenChange={setParentsSms}
        target={{ kind: "parents", studentId: student.id }}
        title={t("students.parents.smsTitle", { name: student.fullName })}
      />
    </div>
  );
}

function CommentsList({ comments, onAdd }: { comments: StudentCommentDto[]; onAdd: () => void }) {
  const tc = useTranslations("students.comments");
  const fmt = useDateFormat();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{tc("title")}</h2>
        <Button size="sm" onClick={onAdd} data-testid="add-comment">
          <Plus /> {tc("new")}
        </Button>
      </div>
      {comments.length === 0 ? (
        <EmptyState title={tc("empty")} />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border p-3 text-sm" data-testid="student-comment">
              <p className="whitespace-pre-wrap">{c.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {c.groupName ? ` · ${c.groupName}` : ""}
                {c.authorName ? ` · ${c.authorName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HistoryList({ history }: { history: Page<StudentHistoryDto> }) {
  const t = useTranslations();
  const th = useTranslations("students.history");
  const fmt = useDateFormat();
  if (history.items.length === 0) return <EmptyState title={th("empty")} />;
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {history.items.map((h) => {
          const key = `students.history.actions.${h.action}`;
          const details = Object.entries(h.details);
          return (
            <li key={h.id} className="flex gap-3 text-sm" data-testid="history-row">
              <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">
                {fmt(new Date(h.at), { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.has(key) ? t(key) : h.action}</p>
                {details.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {details.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}
                  </p>
                )}
                {h.actorName && <p className="text-xs text-muted-foreground">{h.actorName}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <Pagination page={history.page} pageSize={history.pageSize} total={history.total} />
    </div>
  );
}

/** "Yangi ma'lumot qo'shish": a named extra field on the profile card. */
function CustomFieldDialog({
  open,
  onOpenChange,
  studentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  onSaved: () => void;
}) {
  const td = useTranslations("students.detail");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/students/${studentId}/custom-fields`, {
        method: "POST",
        body: { name: data.get("name"), value: String(data.get("value") ?? "").trim() || null },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={td("fieldDialog")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="field-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="field-name">{td("fieldName")}</Label>
        <Input id="field-name" name="name" required maxLength={60} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="field-value">{td("fieldValue")}</Label>
        <Textarea id="field-value" name="value" rows={2} />
      </div>
    </FormDialog>
  );
}

/** "Guruhga qo'shish" from the profile: pick a group, the student is known. */
function AddToGroupDialog({
  open,
  onOpenChange,
  student,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentDetailDto;
  options: StudentOptions;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("students.form");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const inGroups = new Set(
    student.groups.filter((g) => !LEFT.includes(g.status)).map((g) => g.groupId),
  );
  const groups = options.groups.filter(
    (g) => g.status !== "ARCHIVED" && g.branchId === student.branchId && !inGroups.has(g.id),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) {
      setFields({ groupId: ["validation.required"] });
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/groups/${groupId}/members`, {
        method: "POST",
        body: {
          studentId: student.id,
          joinedAt: data.get("joinedAt"),
          status: data.get("status"),
          customPrice: null,
          note: null,
        },
      });
      onOpenChange(false);
      setGroupId("");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("students.detail.addToGroup")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="add-to-group-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="atg-group">{tf("group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="atg-group" aria-invalid={!!fields.groupId}>
            <SelectValue placeholder={tf("groupPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
                {g.teacherName ? ` (${g.teacherName})` : ""}
                {g.time ? ` · ${g.time}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fields.groupId && <p className="text-xs text-destructive">{t(fields.groupId[0]!)}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="atg-joined">{tf("joinedAt")}</Label>
          <Input id="atg-joined" name="joinedAt" type="date" defaultValue={todayIso()} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="atg-status">{tf("status")}</Label>
          <select
            id="atg-status"
            name="status"
            defaultValue="ACTIVE"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(["NEW", "TRIAL", "ACTIVE"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`groups.memberStatuses.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}

function ParentDialog({
  open,
  onOpenChange,
  studentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  onSaved: () => void;
}) {
  const tp = useTranslations("students.parents");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/students/${studentId}/parents`, {
        method: "POST",
        body: { fullName: data.get("fullName"), phone: data.get("phone") },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
    } finally {
      setBusy(false);
    }
  }
  const t = useTranslations();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tp("add")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="parent-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="parent-name">{tp("fullName")}</Label>
        <Input id="parent-name" name="fullName" required aria-invalid={!!fields.fullName} />
        {fields.fullName && <p className="text-xs text-destructive">{t(fields.fullName[0]!)}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="parent-phone">{tp("phone")}</Label>
        <Input
          id="parent-phone"
          name="phone"
          type="tel"
          defaultValue="+998"
          required
          aria-invalid={!!fields.phone}
        />
        {fields.phone && <p className="text-xs text-destructive">{t(fields.phone[0]!)}</p>}
      </div>
    </FormDialog>
  );
}
