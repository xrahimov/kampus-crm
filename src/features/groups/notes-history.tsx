"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import type { GroupHistoryDto, GroupNoteDto } from "@/server/services/groups/groups.service";

/** EXP §5 ESLATMALAR. */
export function NotesTab({
  groupId,
  notes,
  canEdit,
}: {
  groupId: string;
  notes: GroupNoteDto[];
  canEdit: boolean;
}) {
  const t = useTranslations("groups.notes");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${groupId}/notes`, { method: "POST", body: { text } });
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
      {canEdit && (
        <form onSubmit={submit} className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            aria-label={t("newNote")}
            data-testid="note-text"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy || !text.trim()} data-testid="note-save">
            {busy ? tc("saving") : t("newNote")}
          </Button>
        </form>
      )}
      {notes.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border p-3 text-sm" data-testid="note-row">
              <p className="whitespace-pre-wrap">{n.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.authorName ?? "—"} ·{" "}
                {format.dateTime(new Date(n.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderValue(value: unknown, t: ReturnType<typeof useTranslations>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    for (const ns of ["groups.statuses", "groups.patterns"]) {
      if (t.has(`${ns}.${value}`)) return t(`${ns}.${value}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if ("fullName" in o) {
            const extra =
              "shareValue" in o ? ` ${o.shareValue}${o.shareType === "PERCENT" ? "%" : ""}` : "";
            return `${o.fullName}${extra}`;
          }
          if ("weekday" in o)
            return `${o.weekday}: ${o.startTime}–${o.endTime}${o.roomName ? ` (${o.roomName})` : ""}`;
        }
        return String(v);
      })
      .join("; ");
  }
  return JSON.stringify(value);
}

/** EXP §5 GURUH TARIXI: field, old value, new value, who, when. */
export function HistoryTab({ history }: { history: Page<GroupHistoryDto> }) {
  const t = useTranslations();
  const th = useTranslations("groups.history");
  const format = useFormatter();
  if (history.items.length === 0) return <EmptyState title={th("empty")} />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">{th("field")}</th>
              <th className="px-3 py-2 font-medium">{th("before")}</th>
              <th className="px-3 py-2 font-medium">{th("after")}</th>
              <th className="px-3 py-2 font-medium">{th("by")}</th>
              <th className="px-3 py-2 font-medium">{th("at")}</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((h) => (
              <tr key={h.id} className="border-b last:border-0 align-top" data-testid="history-row">
                <td className="px-3 py-2 whitespace-nowrap">
                  {h.field
                    ? th.has(`fields.${h.field}`)
                      ? th(`fields.${h.field}`)
                      : h.field
                    : th(`actions.${h.action.split(".")[1] ?? "update"}`)}
                </td>
                <td className="max-w-xs px-3 py-2 text-muted-foreground">
                  {h.field ? renderValue(h.before, t) : "—"}
                </td>
                <td className="max-w-xs px-3 py-2">{h.field ? renderValue(h.after, t) : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{h.actorName ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {format.dateTime(new Date(h.at), { dateStyle: "medium", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={history.page} pageSize={history.pageSize} total={history.total} />
    </div>
  );
}
