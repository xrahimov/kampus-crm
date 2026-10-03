"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SortHeader } from "@/components/data/sort-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import type { SchoolDto } from "@/server/services/settings/schools.service";

import { ListHeader } from "../shared/list-header";
import { RowActions } from "../shared/row-actions";
import { SchoolDialog } from "./school-dialog";

export function SchoolsPage({ page }: { page: Page<SchoolDto> }) {
  const t = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; school: SchoolDto | null }>({
    open: false,
    school: null,
  });
  const [deleting, setDeleting] = useState<SchoolDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("settings.schools.title")}
        description={t("settings.schools.description")}
        addLabel={t("settings.schools.add")}
        onAdd={() => setDialog({ open: true, school: null })}
      />
      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="name">{t("settings.schools.name")}</SortHeader>
                </TableHead>
                <TableHead>{t("settings.schools.studentsCount")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((school) => (
                <TableRow key={school.id} data-testid="school-row">
                  <TableCell className="font-medium">{school.name}</TableCell>
                  <TableCell className="tabular-nums">{school.studentsCount}</TableCell>
                  <TableCell>
                    <RowActions
                      name={school.name}
                      onEdit={() => setDialog({ open: true, school })}
                      onDelete={() => setDeleting(school)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />

      <SchoolDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        school={dialog.school}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.schools.deleteTitle")}
        description={t("settings.schools.deleteText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/schools/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
