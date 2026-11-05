"use client";

import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ExercisesPanel } from "./exercises-panel";

/** The exercises of one homework in a dialog of their own (A-158). */
export function ExercisesDialog({
  open,
  onOpenChange,
  anchor,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: { topicId?: string; homeworkId?: string };
  title: string;
}) {
  const t = useTranslations("exercises");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="exercises-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        {open && <ExercisesPanel anchor={anchor} />}
      </DialogContent>
    </Dialog>
  );
}
