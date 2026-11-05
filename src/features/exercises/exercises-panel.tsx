"use client";

import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { ExerciseDto } from "@/server/services/exercises/exercises.service";

import { ExerciseDialog } from "./exercise-dialog";

/**
 * The exercises on a topic or a homework, for staff (A-158): the list with
 * how many students tried each, and, for those who may write, add, edit and
 * delete. Loads on its own so it can sit inside another dialog.
 */
export function ExercisesPanel({
  anchor,
  onChanged,
}: {
  anchor: { topicId?: string; homeworkId?: string };
  onChanged?: () => void;
}) {
  const t = useTranslations("exercises");
  const [data, setData] = useState<{ items: ExerciseDto[]; canEdit: boolean } | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<ExerciseDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ExerciseDto | null>(null);
  const query = anchor.topicId ? `topicId=${anchor.topicId}` : `homeworkId=${anchor.homeworkId}`;

  useEffect(() => {
    let live = true;
    api<{ items: ExerciseDto[]; canEdit: boolean }>(`/exercises?${query}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ items: [], canEdit: false }));
    return () => {
      live = false;
    };
  }, [query, reloads]);

  const refresh = () => {
    setReloads((n) => n + 1);
    onChanged?.();
  };

  return (
    <section className="space-y-2" data-testid="exercises-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden /> {t("heading")}
        </h3>
        {data?.canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing("new")}
            data-testid="exercise-new"
          >
            <Plus /> {t("new")}
          </Button>
        )}
      </div>
      {!data ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : data.items.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="exercises-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {data.items.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center gap-2 px-3 py-1.5"
              data-testid="exercise-row"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{ex.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("summary", { items: ex.items.length, attempted: ex.attempted })}
              </span>
              {data.canEdit && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setEditing(ex)}
                    aria-label={t("edit")}
                    data-testid="exercise-edit"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => setDeleting(ex)}
                    aria-label={t("delete")}
                    data-testid="exercise-delete"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ExerciseDialog
        open={editing !== null}
        anchor={anchor}
        exercise={editing === "new" ? null : editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteText")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/exercises/${deleting.id}`, { method: "DELETE" });
          setDeleting(null);
          refresh();
        }}
      />
    </section>
  );
}
