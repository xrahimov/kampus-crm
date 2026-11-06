"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { RubricCriterion } from "@/lib/validation/groups";
import type { HomeworkDto } from "@/server/services/homework/homework.service";

import { AttachmentField } from "./attachment-field";

/**
 * A standalone assignment for the whole group (A-161): a name, the task, an
 * optional link, file and due date, and a rubric of criteria with points.
 */
export function AssignmentDialog({
  open,
  groupId,
  assignment,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  groupId: string;
  /** Null for a new one. */
  assignment: HomeworkDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.homework");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [formKey, setFormKey] = useState(0);

  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const current = assignment?.id ?? null;
  if (open && seen !== current) {
    setSeen(current);
    setAttachmentUrl(assignment?.attachmentUrl ?? null);
    setSpeaking(assignment?.speaking ?? false);
    setRubric(assignment?.rubric ?? []);
    setFields({});
    setError(null);
    setFormKey((k) => k + 1);
  } else if (!open && seen !== undefined) {
    setSeen(undefined);
  }

  const total = rubric.reduce((sum, c) => sum + (Number.isFinite(c.max) ? c.max : 0), 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = {
        title: String(data.get("title") ?? ""),
        text: String(data.get("text") ?? ""),
        linkUrl: String(data.get("linkUrl") ?? "").trim() || null,
        attachmentUrl,
        speaking,
        dueDate: String(data.get("dueDate") ?? "") || null,
        rubric: rubric.filter((c) => c.name.trim() || c.max),
      };
      if (assignment) await api(`/homework/${assignment.id}`, { method: "PUT", body });
      else await api(`/groups/${groupId}/homework`, { method: "POST", body });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.fields ? null : e.message);
      } else setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const rubricError = Object.keys(fields).find((k) => k.startsWith("rubric"));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={assignment ? t("assignment.editTitle") : t("assignment.addTitle")}
      description={t("assignment.hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="assignment-dialog"
    >
      <div key={formKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="as-title">{t("assignment.title")}</Label>
          <Input
            id="as-title"
            name="title"
            defaultValue={assignment?.title ?? ""}
            data-testid="as-title"
          />
          <FieldError id="as-title-error" message={fields.title?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="as-text">{t("text")}</Label>
          <Textarea
            id="as-text"
            name="text"
            rows={4}
            defaultValue={assignment?.text ?? ""}
            data-testid="as-text"
          />
          <FieldError id="as-text-error" message={fields.text?.[0]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="as-link">{t("linkUrl")}</Label>
            <Input
              id="as-link"
              name="linkUrl"
              type="url"
              defaultValue={assignment?.linkUrl ?? ""}
            />
            <FieldError id="as-link-error" message={fields.linkUrl?.[0]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="as-due">{t("dueDate")}</Label>
            <Input
              id="as-due"
              name="dueDate"
              type="date"
              defaultValue={assignment?.dueDate ?? ""}
              data-testid="as-due"
            />
            <FieldError id="as-due-error" message={fields.dueDate?.[0]} />
          </div>
        </div>
        <AttachmentField
          id="as-file"
          label={t("attachment")}
          value={attachmentUrl}
          onChange={setAttachmentUrl}
        />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={speaking}
            onCheckedChange={(v) => setSpeaking(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{t("speaking")}</span>
            <span className="block text-xs text-muted-foreground">{t("speakingHint")}</span>
          </span>
        </label>

        <fieldset className="space-y-2" data-testid="as-rubric">
          <legend className="text-sm font-medium">{t("assignment.rubric")}</legend>
          <p className="text-xs text-muted-foreground">{t("assignment.rubricHint")}</p>
          {rubric.map((c, i) => (
            <div key={i} className="flex items-center gap-2" data-testid="as-criterion">
              <Input
                value={c.name}
                onChange={(e) =>
                  setRubric((list) =>
                    list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                placeholder={t("assignment.criterion")}
                aria-label={t("assignment.criterion")}
                data-testid="as-criterion-name"
              />
              <Input
                type="number"
                min={1}
                max={100}
                value={c.max}
                onChange={(e) =>
                  setRubric((list) =>
                    list.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)),
                  )
                }
                className="w-24"
                aria-label={t("assignment.points")}
                data-testid="as-criterion-max"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRubric((list) => list.filter((_, j) => j !== i))}
                aria-label={t("assignment.removeCriterion")}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rubric.length >= 10}
              onClick={() => setRubric((list) => [...list, { name: "", max: 10 }])}
              data-testid="as-criterion-add"
            >
              <Plus /> {t("assignment.addCriterion")}
            </Button>
            {rubric.length > 0 && (
              <span className="text-xs text-muted-foreground" data-testid="as-rubric-total">
                {t("assignment.total", { points: total })}
              </span>
            )}
          </div>
          <FieldError
            id="as-rubric-error"
            message={rubricError ? fields[rubricError]?.[0] : undefined}
          />
        </fieldset>
      </div>
    </FormDialog>
  );
}
