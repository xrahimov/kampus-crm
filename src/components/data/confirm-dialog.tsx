"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api-client";

/** Destructive-action confirmation. `onConfirm` runs the API call; errors show inline. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  /** Optional extra inputs, such as a reason field. */
  children?: React.ReactNode;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each opening gets a fresh dialog tree. Radix portals the overlay and the panel
  // separately; re-opened while the previous panel was still fading out, a remounted
  // overlay would land after that panel in the DOM and swallow its clicks.
  const [opening, setOpening] = useState({ open, count: 0 });
  if (open !== opening.open) {
    setOpening({ open, count: opening.count + (open ? 1 : 0) });
    if (open) setError(null);
  }

  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      const key = e instanceof ApiError ? e.message : "errors.internal";
      setError(t.has(key) ? t(key) : t("errors.internal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog key={opening.count} open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={busy}>
            {confirmLabel ?? t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
