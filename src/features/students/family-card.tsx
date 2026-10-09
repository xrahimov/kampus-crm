"use client";

import { Link2, Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { FamilyDto } from "@/server/services/students/families.service";

import { FamilyPortalDialog } from "./family-portal-dialog";
import { StudentPicker } from "./student-picker";

/** "Oila" (A-123): the siblings linked to this student and their shared discount. */
export function FamilyCard({
  student,
  family,
  canEdit,
  canDiscount,
  canSms = false,
  onChanged,
}: {
  student: { id: string; fullName: string };
  family: FamilyDto | null;
  canEdit: boolean;
  canDiscount: boolean;
  /** May text the parents' page link to the parents (A-130). */
  canSms?: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("students.family");
  const [dialog, setDialog] = useState<null | "link" | "edit" | "unlink" | "portal">(null);
  const close = () => setDialog(null);

  return (
    <Card data-testid="family-card">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" /> {t("title")}
          </h2>
          {family && (
            <Badge
              variant={family.discountPercent > 0 ? "success" : "outline"}
              data-testid="family-discount"
            >
              {family.discountPercent > 0
                ? t("discount", { percent: family.discountPercent })
                : t("noDiscount")}
            </Badge>
          )}
        </div>
        {family ? (
          <>
            <p className="text-sm">
              <span className="font-medium" data-testid="family-name">
                {family.name}
              </span>{" "}
              <span className="text-muted-foreground">
                · {t("members", { count: family.members.length })}
              </span>
            </p>
            <ul className="space-y-1 text-sm">
              {family.members.map((m) => (
                <li key={m.id} className="flex justify-between gap-2" data-testid="family-member">
                  {m.id === student.id ? (
                    <span className="font-medium">{m.fullName}</span>
                  ) : (
                    <Link href={`/students/${m.id}`} className="font-medium hover:underline">
                      {m.fullName}
                    </Link>
                  )}
                  <span className="truncate text-right text-muted-foreground">
                    {m.groups.length > 0 ? m.groups.join(", ") : t("noGroups")}
                  </span>
                </li>
              ))}
            </ul>
            {family.note && <p className="text-xs text-muted-foreground">{family.note}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        )}
        {family && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog("portal")}
            data-testid="family-portal"
          >
            <Link2 /> {t("page.button")}
          </Button>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("link")}
              data-testid="family-link"
            >
              <UserPlus /> {t("link")}
            </Button>
            {family && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog("edit")}
                  data-testid="family-edit"
                >
                  <Pencil /> {t("edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDialog("unlink")}
                  data-testid="family-unlink"
                >
                  <UserMinus /> {t("unlink")}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>

      <LinkSiblingDialog
        open={dialog === "link"}
        onOpenChange={(open) => !open && close()}
        student={student}
        hasFamily={!!family}
        canDiscount={canDiscount}
        onSaved={onChanged}
      />
      {family && (
        <EditFamilyDialog
          open={dialog === "edit"}
          onOpenChange={(open) => !open && close()}
          family={family}
          canDiscount={canDiscount}
          onSaved={onChanged}
        />
      )}
      <FamilyPortalDialog
        open={dialog === "portal"}
        onOpenChange={(open) => !open && close()}
        studentId={student.id}
        canReset={canEdit}
        canSms={canSms}
      />
      <ConfirmDialog
        open={dialog === "unlink"}
        onOpenChange={(open) => !open && close()}
        title={t("unlinkTitle", { name: student.fullName })}
        description={t("unlinkText")}
        confirmLabel={t("unlink")}
        onConfirm={async () => {
          await api(`/students/${student.id}/family`, { method: "DELETE" });
          onChanged();
        }}
      />
    </Card>
  );
}

function LinkSiblingDialog({
  open,
  onOpenChange,
  student,
  hasFamily,
  canDiscount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; fullName: string };
  hasFamily: boolean;
  canDiscount: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("students.family");
  const tc = useTranslations();
  const [sibling, setSibling] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  function change(next: boolean) {
    if (!next) {
      setSibling(null);
      setError(null);
      setFields({});
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sibling) {
      setFields({ studentId: ["validation.required"] });
      return;
    }
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const percent = String(data.get("discountPercent") ?? "").trim();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/students/${student.id}/family/link`, {
        method: "POST",
        body: {
          studentId: sibling.id,
          ...(name ? { name } : {}),
          ...(percent ? { discountPercent: percent } : {}),
        },
      });
      change(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => {
    const k = fields[key]?.[0];
    return k ? (
      <p className="text-xs text-destructive">{tc.has(k) ? tc(k) : tc("validation.required")}</p>
    ) : null;
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={change}
      title={t("link")}
      description={t("form.linkHint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="family-link-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="family-sibling">{t("form.sibling")}</Label>
        <StudentPicker
          id="family-sibling"
          value={sibling?.id ?? null}
          valueName={sibling?.name ?? null}
          onChange={(id, name) => setSibling(id && name ? { id, name } : null)}
          excludeId={student.id}
          invalid={!!fields.studentId}
        />
        {fieldError("studentId")}
      </div>
      {!hasFamily && (
        <>
          <div className="space-y-2">
            <Label htmlFor="family-name">{t("form.name")}</Label>
            <Input id="family-name" name="name" placeholder={student.fullName} maxLength={120} />
            {fieldError("name")}
          </div>
          {canDiscount && (
            <div className="space-y-2">
              <Label htmlFor="family-percent">{t("form.discountPercent")}</Label>
              <Input
                id="family-percent"
                name="discountPercent"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                defaultValue={0}
              />
              {fieldError("discountPercent")}
              <p className="text-xs text-muted-foreground">{t("form.hint")}</p>
            </div>
          )}
        </>
      )}
    </FormDialog>
  );
}

function EditFamilyDialog({
  open,
  onOpenChange,
  family,
  canDiscount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: FamilyDto;
  canDiscount: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("students.family");
  const tc = useTranslations();
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
      await api(`/families/${family.id}`, {
        method: "PATCH",
        body: {
          name: String(data.get("name") ?? ""),
          discountPercent: canDiscount
            ? String(data.get("discountPercent") ?? "0")
            : family.discountPercent,
          note: String(data.get("note") ?? "").trim() || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => {
    const k = fields[key]?.[0];
    return k ? (
      <p className="text-xs text-destructive">{tc.has(k) ? tc(k) : tc("validation.required")}</p>
    ) : null;
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setFields({});
        }
        onOpenChange(next);
      }}
      title={t("edit")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="family-edit-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="family-edit-name">{t("form.name")}</Label>
        <Input
          id="family-edit-name"
          name="name"
          defaultValue={family.name}
          maxLength={120}
          required
        />
        {fieldError("name")}
      </div>
      <div className="space-y-2">
        <Label htmlFor="family-edit-percent">{t("form.discountPercent")}</Label>
        <Input
          id="family-edit-percent"
          name="discountPercent"
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          defaultValue={family.discountPercent}
          disabled={!canDiscount}
        />
        {fieldError("discountPercent")}
        <p className="text-xs text-muted-foreground">{t("form.hint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="family-edit-note">{t("form.note")}</Label>
        <Textarea id="family-edit-note" name="note" rows={2} defaultValue={family.note ?? ""} />
        {fieldError("note")}
      </div>
    </FormDialog>
  );
}
