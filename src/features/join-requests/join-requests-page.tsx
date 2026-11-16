"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { StudentPicker } from "@/features/students/student-picker";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { JoinRequestApproveInput, JoinRequestTab } from "@/lib/validation/sign-in";
import type { JoinRequestDto } from "@/server/services/sign-in/join-requests.service";

type StudentMode = "newStudent" | "student" | "parent";
const NO_GROUP = "__none";

/** The waiting list of the sign-in pages (A-196): let people in, or decline them. */
export function JoinRequestsPage({
  tab,
  items,
  branches,
  groups,
  roles,
  canLink,
}: {
  tab: JoinRequestTab;
  items: JoinRequestDto[];
  branches: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; branchId: string }>;
  roles: Array<{ code: string; name: string }>;
  /** May put the number on an existing student's card (needs the right to edit students). */
  canLink: boolean;
}) {
  const t = useTranslations("joinRequests");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [approving, setApproving] = useState<JoinRequestDto | null>(null);
  const [declining, setDeclining] = useState<JoinRequestDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="join-requests-title">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="inline-flex h-9 items-center gap-1 border-b" role="tablist">
        {(["PENDING", "DECLINED"] as const).map((key) => (
          <Link
            key={key}
            href={key === "PENDING" ? "/join-requests" : "/join-requests?status=DECLINED"}
            role="tab"
            aria-selected={tab === key}
            data-testid={`join-tab-${key.toLowerCase()}`}
            className={
              tab === key
                ? "inline-flex h-9 items-center border-b-2 border-primary px-3 text-sm font-medium text-primary"
                : "inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t(`empty.${tab}`)}
          hint={tab === "PENDING" ? t("emptyHint") : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table data-testid="join-requests-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.person")}</TableHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.branch")}</TableHead>
                <TableHead>{t("columns.note")}</TableHead>
                <TableHead>{t("columns.asked")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} data-testid="join-request-row">
                  <TableCell>
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{r.phone}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.door === "STAFF" ? "outline" : "muted"}>
                      {t(`kinds.${r.door}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.branchName ?? "—"}</TableCell>
                  <TableCell className="max-w-56 text-sm text-muted-foreground">
                    {r.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {fmt(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    {r.status === "DECLINED" && r.decidedByName && (
                      <span className="block">{t("declinedBy", { name: r.decidedByName })}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setApproving(r)} data-testid="join-approve">
                        <Check /> {t("approve")}
                      </Button>
                      {r.status === "PENDING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeclining(r)}
                          data-testid="join-decline"
                        >
                          <X /> {t("decline")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("selfClosing")}</p>

      {approving && (
        <ApproveDialog
          key={approving.id}
          request={approving}
          branches={branches}
          groups={groups}
          roles={roles}
          canLink={canLink}
          onClose={() => setApproving(null)}
          onDone={() => {
            setApproving(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={!!declining}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={t("declineTitle")}
        description={t("declineHint", { name: declining?.fullName ?? "" })}
        confirmLabel={t("decline")}
        onConfirm={async () => {
          if (!declining) return;
          await api(`/join-requests/${declining.id}/decline`, { method: "POST" });
          setDeclining(null);
          refresh();
        }}
      />
    </div>
  );
}

function ApproveDialog({
  request,
  branches,
  groups,
  roles,
  canLink,
  onClose,
  onDone,
}: {
  request: JoinRequestDto;
  branches: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; branchId: string }>;
  roles: Array<{ code: string; name: string }>;
  canLink: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const tj = useTranslations("joinRequests");
  const staff = request.door === "STAFF";
  const [mode, setMode] = useState<StudentMode>("newStudent");
  const [fullName, setFullName] = useState(request.fullName);
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [branchId, setBranchId] = useState(
    branches.some((b) => b.id === request.branchId) ? request.branchId! : (branches[0]?.id ?? ""),
  );
  const [groupId, setGroupId] = useState(NO_GROUP);
  const [roleCode, setRoleCode] = useState("");
  const [student, setStudent] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const branchGroups = groups.filter((g) => g.branchId === branchId);

  function build(): JoinRequestApproveInput | null {
    if (staff) {
      if (!fullName.trim() || !branchId || !roleCode) return null;
      return { mode: "newStaff", fullName, branchId, gender, roleCode };
    }
    if (mode === "newStudent") {
      if (!fullName.trim() || !branchId) return null;
      return {
        mode,
        fullName,
        branchId,
        gender,
        groupId: groupId === NO_GROUP ? null : groupId,
      };
    }
    if (!student.id) return null;
    if (mode === "student") return { mode, studentId: student.id };
    if (!fullName.trim()) return null;
    return { mode: "parent", studentId: student.id, fullName };
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const body = build();
    if (!body) {
      setError("joinRequests.fillAll");
      return;
    }
    setSubmitting(true);
    try {
      await api(`/join-requests/${request.id}/approve`, { method: "POST", body });
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        const field = Object.values(e.fields ?? {})[0]?.[0];
        setError(field ?? e.message);
      } else setError("errors.internal");
    } finally {
      setSubmitting(false);
    }
  }

  const showNew = staff || mode === "newStudent";
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={tj("approveTitle", { name: request.fullName })}
      description={tj(staff ? "approveStaffHint" : "approveStudentHint", { phone: request.phone })}
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      testId="join-approve-dialog"
      submitLabel={tj("approve")}
    >
      {!staff && (
        <SegmentedGroup
          value={mode}
          onValueChange={(value) => setMode(value as StudentMode)}
          aria-label={tj("modeLabel")}
        >
          <SegmentedItem value="newStudent" data-testid="join-mode-new">
            {tj("modes.newStudent")}
          </SegmentedItem>
          {canLink && (
            <>
              <SegmentedItem value="student" data-testid="join-mode-student">
                {tj("modes.student")}
              </SegmentedItem>
              <SegmentedItem value="parent" data-testid="join-mode-parent">
                {tj("modes.parent")}
              </SegmentedItem>
            </>
          )}
        </SegmentedGroup>
      )}

      {!staff && mode !== "newStudent" && (
        <div className="space-y-2">
          <Label htmlFor="join-student">{tj("existingStudent")}</Label>
          <StudentPicker
            id="join-student"
            value={student.id}
            valueName={student.name}
            onChange={(id, name) => setStudent({ id, name })}
          />
          <p className="text-xs text-muted-foreground">
            {tj(mode === "student" ? "studentHint" : "parentHint", { phone: request.phone })}
          </p>
        </div>
      )}

      {(showNew || mode === "parent") && (
        <div className="space-y-2">
          <Label htmlFor="join-full-name">
            {mode === "parent" && !staff ? tj("parentName") : tj("fullName")}
          </Label>
          <Input
            id="join-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
      )}

      {showNew && (
        <>
          <div className="space-y-2">
            <Label>{tj("gender")}</Label>
            <SegmentedGroup
              value={gender}
              onValueChange={(value) => setGender(value as "MALE" | "FEMALE")}
            >
              <SegmentedItem value="MALE">{t("students.genders.MALE")}</SegmentedItem>
              <SegmentedItem value="FEMALE">{t("students.genders.FEMALE")}</SegmentedItem>
            </SegmentedGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-approve-branch">{tj("columns.branch")}</Label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                setGroupId(NO_GROUP);
              }}
            >
              <SelectTrigger id="join-approve-branch">
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
          </div>
        </>
      )}

      {!staff && mode === "newStudent" && (
        <div className="space-y-2">
          <Label htmlFor="join-approve-group">{tj("group")}</Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger id="join-approve-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>{tj("noGroup")}</SelectItem>
              {branchGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {staff && (
        <div className="space-y-2">
          <Label htmlFor="join-approve-role">{tj("role")}</Label>
          <Select value={roleCode} onValueChange={setRoleCode}>
            <SelectTrigger id="join-approve-role">
              <SelectValue placeholder={tj("chooseRole")} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {request.note && <Alert>{tj("theirNote", { note: request.note })}</Alert>}
    </FormDialog>
  );
}
