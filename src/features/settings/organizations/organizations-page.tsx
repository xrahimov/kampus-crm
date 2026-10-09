"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
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
import { useRouter } from "@/i18n/navigation";
import type { OrganizationDto } from "@/server/services/settings/organizations.service";
import type { SystemStatusDto } from "@/server/services/system/monitoring.service";

import { RowActions } from "../shared/row-actions";
import { OrganizationDialog } from "./organization-dialog";
import { ServerStatus } from "./server-status";

/** Site owner's list of the centres this server hosts (A-108) and the server's status (A-134). */
export function OrganizationsPage({
  organizations,
  ownId,
  status,
}: {
  organizations: OrganizationDto[];
  ownId: string;
  status: SystemStatusDto;
}) {
  const t = useTranslations("settings.organizations");
  const tc = useTranslations("common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; organization: OrganizationDto | null }>({
    open: false,
    organization: null,
  });
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          onClick={() => setDialog({ open: true, organization: null })}
          data-testid="add-button"
        >
          <Plus /> {t("add")}
        </Button>
      </div>
      <ServerStatus initial={status} />
      <Card>
        {organizations.length === 0 ? (
          <EmptyState title={tc("nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("branches")}</TableHead>
                <TableHead>{t("domain")}</TableHead>
                <TableHead>{t("ceo")}</TableHead>
                <TableHead className="text-right">{t("staffCount")}</TableHead>
                <TableHead className="text-right">{t("studentsCount")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id} data-testid="organization-row">
                  <TableCell className="font-medium">
                    {org.name}
                    {org.id === ownId && (
                      <Badge variant="secondary" className="ml-2">
                        {t("yours")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {org.branches.map((b) => (
                        <Badge key={b.id} variant={b.isActive ? "outline" : "secondary"}>
                          {b.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell data-testid="organization-domain">
                    {org.domain ? (
                      <a
                        href={`https://${org.domain}/`}
                        className="hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {org.domain}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {org.ceo ? (
                      <div>
                        <div>{org.ceo.fullName}</div>
                        <div className="text-xs text-muted-foreground">{org.ceo.phone}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{org.staffCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{org.studentsCount}</TableCell>
                  <TableCell>
                    <RowActions
                      name={org.name}
                      onEdit={() => setDialog({ open: true, organization: org })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <OrganizationDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        organization={dialog.organization}
        onSaved={refresh}
      />
    </div>
  );
}
