"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import { roleLabel } from "@/features/staff/role-label";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { RoleDto } from "@/server/services/staff/roles.service";

import { RowActions } from "../shared/row-actions";
import { RoleDialog } from "./role-dialog";

/** EXP §8 "Rollar (Beta)": name, active flag, permission count, add button, editor. */
export function RolesPage({ roles, grantable }: { roles: RoleDto[]; grantable: string[] }) {
  const t = useTranslations();
  const tr = useTranslations("settings.roles");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; role: RoleDto | null }>({
    open: false,
    role: null,
  });
  const [deleting, setDeleting] = useState<RoleDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{tr("title")}</h2>
          <p className="text-sm text-muted-foreground">{tr("description")}</p>
        </div>
        <Button onClick={() => setDialog({ open: true, role: null })} data-testid="add-button">
          <Plus /> {tr("add")}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("name")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{tr("permissions")}</TableHead>
              <TableHead>{tr("users")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id} data-testid="role-row">
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {roleLabel(t, role)}
                    {role.isSystem && <Badge variant="outline">{tr("system")}</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={role.isActive ? "default" : "secondary"}>
                    {role.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {role.permissions.includes("*")
                    ? tr("allPermissions")
                    : tr("permissionCount", { count: role.permissions.length })}
                </TableCell>
                <TableCell className="tabular-nums">{role.userCount}</TableCell>
                <TableCell>
                  {role.code !== "CEO" && (
                    <RowActions
                      name={roleLabel(t, role)}
                      onEdit={() => setDialog({ open: true, role })}
                      onDelete={() => setDeleting(role)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <RoleDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        role={dialog.role}
        grantable={grantable}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={tr("deleteTitle")}
        description={tr("deleteText", { name: deleting ? roleLabel(t, deleting) : "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/roles/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
