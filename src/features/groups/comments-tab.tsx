"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { MembershipDto } from "@/server/services/groups/memberships.service";
import type { StudentCommentDto } from "@/server/services/students/students.service";

/** EXP §5 IZOHLAR tab: notes about individual students of this group. */
export function CommentsTab({
  groupId,
  comments,
  members,
  canWrite,
}: {
  groupId: string;
  comments: StudentCommentDto[];
  members: MembershipDto[];
  canWrite: boolean;
}) {
  const t = useTranslations();
  const tc = useTranslations("students.comments");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [studentId, setStudentId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    if (!studentId) {
      setError("validation.studentRequired");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${groupId}/student-comments`, {
        method: "POST",
        body: { studentId, text },
      });
      setText("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={submit} className="space-y-2" data-testid="group-comment-form">
          <div className="space-y-2">
            <Label htmlFor="comment-student">{t("groups.members.student")}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="comment-student" className="sm:max-w-xs">
                <SelectValue placeholder={t("validation.studentRequired")} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.studentId}>
                    {m.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tc("placeholder")}
            rows={3}
            aria-label={tc("new")}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t.has(error) ? t(error) : t("errors.internal")}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            {tc("new")}
          </Button>
        </form>
      )}
      {comments.length === 0 ? (
        <EmptyState title={tc("empty")} />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border p-3 text-sm" data-testid="student-comment">
              <p className="whitespace-pre-wrap">{c.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <Link href={`/students/${c.studentId}`} className="font-medium hover:underline">
                  {c.studentName}
                </Link>
                {" · "}
                {fmt(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {c.authorName ? ` · ${c.authorName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
