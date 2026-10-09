"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SortHeader } from "@/components/data/sort-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImportDialog } from "@/features/shared/import-dialog";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import type { RoomDto } from "@/server/services/settings/rooms.service";

import { creatableBranches, type BranchOption } from "../shared/branch-select";
import { ListHeader } from "../shared/list-header";
import { RowActions } from "../shared/row-actions";
import { RoomDialog } from "./room-dialog";

export function RoomsPage({
  page,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
}: {
  page: Page<RoomDto>;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; room: RoomDto | null }>({
    open: false,
    room: null,
  });
  const [deleting, setDeleting] = useState<RoomDto | null>(null);
  const [importing, setImporting] = useState(false);
  const { options, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("settings.rooms.title")}
        description={t("settings.rooms.description")}
        addLabel={t("settings.rooms.add")}
        onAdd={() => setDialog({ open: true, room: null })}
      >
        <Button variant="outline" onClick={() => setImporting(true)} data-testid="rooms-import">
          {t("excel.importButton")}
        </Button>
        <ImportDialog
          open={importing}
          onOpenChange={setImporting}
          title={t("excel.importTitles.rooms")}
          description={t("excel.hints.rooms")}
          templatePath="/rooms/import-template.xlsx"
          importPath="/rooms/import"
          fields={{ branchId: defaultId }}
          onDone={refresh}
          testId="rooms-import-dialog"
        />
      </ListHeader>
      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="name">{t("settings.rooms.name")}</SortHeader>
                </TableHead>
                <TableHead>{t("branch.select")}</TableHead>
                <TableHead>
                  <SortHeader field="capacity">{t("settings.rooms.capacity")}</SortHeader>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((room) => (
                <TableRow key={room.id} data-testid="room-row">
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.branchName}</TableCell>
                  <TableCell className="tabular-nums">{room.capacity}</TableCell>
                  <TableCell>
                    <RowActions
                      name={room.name}
                      onEdit={() => setDialog({ open: true, room })}
                      onDelete={() => setDeleting(room)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />

      <RoomDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        room={dialog.room}
        branches={options}
        defaultBranchId={defaultId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.rooms.deleteTitle")}
        description={t("settings.rooms.deleteText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/rooms/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
