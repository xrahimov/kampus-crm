"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { api, ApiError } from "@/lib/api-client";
import type { StudentRowDto } from "@/server/services/students/students.service";

const NONE = "__none";

/** "Izoh qo'shish" from the row menu and the profile (EXP §6). */
export function CommentDialog({
  student,
  onOpenChange,
  onSaved,
}: {
  student: StudentRowDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const tc = useTranslations("students.comments");
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastStudent, setLastStudent] = useState(student);
  if (student !== lastStudent) {
    setLastStudent(student);
    if (student) {
      setText("");
      setGroupId(NONE);
      setError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/students/${student.id}/comments`, {
        method: "POST",
        body: { text, groupId: groupId === NONE ? null : groupId },
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
      open={!!student}
      onOpenChange={onOpenChange}
      title={`${tc("addTitle")}: ${student?.fullName ?? ""}`}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="comment-dialog"
    >
      {student && student.groups.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="comment-group">{tc("forGroup")}</Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger id="comment-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{tc("noGroup")}</SelectItem>
              {student.groups.map((g) => (
                <SelectItem key={g.membershipId} value={g.groupId}>
                  {g.groupName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="comment-text">{tc("new")}</Label>
        <Textarea
          id="comment-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tc("placeholder")}
          required
        />
      </div>
    </FormDialog>
  );
}
