"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Dialog chrome shared by every create/edit form: title, error banner, Cancel/Save. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitting,
  error,
  children,
  side,
  testId,
  submitLabel,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  error: string | null;
  children: React.ReactNode;
  side?: "center" | "right";
  testId?: string;
  /** Replaces the default "Save" on the submit button. */
  submitLabel?: string;
  /** For a form that needs more room than the usual window, such as one with a table. */
  className?: string;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side={side} data-testid={testId} className={className}>
        {/* min-w-0: a wide table scrolls inside the form instead of pushing the window's edge out. */}
        <form onSubmit={onSubmit} className="min-w-0 space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {error && (
            <Alert variant="destructive">{t.has(error) ? t(error) : t("errors.internal")}</Alert>
          )}
          <div className="space-y-4">{children}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.saving") : (submitLabel ?? t("common.save"))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
