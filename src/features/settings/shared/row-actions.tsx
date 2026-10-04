"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The ⋮ menu at the end of each row (EXP §8 "Harakatlar"). */
export function RowActions({
  onEdit,
  onDelete,
  deleteLabel,
  name,
  extra,
}: {
  /** Omitted entries hide their menu item (the caller lacks the permission). */
  onEdit?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  name: string;
  /** Extra items shown above edit/delete, e.g. "Send SMS". */
  extra?: Array<{ label: string; onSelect: () => void; testId?: string }>;
}) {
  const t = useTranslations("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name })}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {extra?.map((item) => (
          <DropdownMenuItem key={item.label} onSelect={item.onSelect} data-testid={item.testId}>
            {item.label}
          </DropdownMenuItem>
        ))}
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> {t("edit")}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 /> {deleteLabel ?? t("delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
