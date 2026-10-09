"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import type {
  GroupWaitlistDto,
  WaitlistOfferResult,
} from "@/server/services/leads/waitlist.service";

/**
 * "Offer seats to the waiting list" on a group (A-138): shows the free seats
 * and who is next in line for the group's course, then texts them and marks
 * them offered.
 */
export function OfferSeatsDialog({
  groupId,
  open,
  onOpenChange,
  onDone,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (result: WaitlistOfferResult) => void;
}) {
  const t = useTranslations("groups.waitlist");
  const [preview, setPreview] = useState<{ groupId: string; data: GroupWaitlistDto } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<GroupWaitlistDto>(`/groups/${groupId}/waitlist`)
      .then((data) => {
        if (live) setPreview({ groupId, data });
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => {
      live = false;
    };
  }, [open, groupId]);
  const data = preview && preview.groupId === groupId ? preview.data : null;
  const count = data ? data.next.length : 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || count === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<WaitlistOfferResult>(`/groups/${groupId}/waitlist`, {
        method: "POST",
        body: {},
      });
      onOpenChange(false);
      onDone(result);
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
      title={t("title")}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy || !data || count === 0}
      error={error}
      submitLabel={t("offer", { count })}
      testId="offer-seats-dialog"
    >
      {data && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">{t("freeSeats")}</dt>
            <dd className="font-medium tabular-nums" data-testid="offer-free-seats">
              {data.freeSeats === null ? t("freeSeatsUnknown") : data.freeSeats}
            </dd>
            <dt className="text-muted-foreground">{t("waiting")}</dt>
            <dd className="font-medium tabular-nums" data-testid="offer-waiting">
              {data.waiting}
            </dd>
          </dl>
          {count === 0 ? (
            <p className="text-muted-foreground" data-testid="offer-none">
              {data.waiting > 0 ? t("noSeats") : t("none")}
            </p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5" data-testid="offer-next">
              {data.next.map((e) => (
                <li key={e.id}>
                  {e.fullName} <span className="text-muted-foreground">{e.phone}</span>
                </li>
              ))}
            </ol>
          )}
          <Alert variant={data.smsActive ? "success" : "default"}>
            {data.smsActive ? t("smsOn") : t("smsOff")}
          </Alert>
        </div>
      )}
    </FormDialog>
  );
}
