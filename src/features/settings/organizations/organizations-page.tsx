"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { OrganizationDto } from "@/server/services/settings/organizations.service";
import type { SystemStatusDto } from "@/server/services/system/monitoring.service";

import { FormDialog } from "../shared/form-dialog";
import { RowActions } from "../shared/row-actions";
import { OrganizationDialog } from "./organization-dialog";
import { ServerStatus } from "./server-status";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return bytes === 0 ? "0" : `${bytes} B`;
}

/**
 * Site owner's console (A-108, A-144): the centres this server hosts with their
 * usage, the suspend switch and the data export, plus the server's status (A-134).
 */
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
  const fmt = useDateFormat();
  const [suspending, setSuspending] = useState<OrganizationDto | null>(null);
  const [reason, setReason] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  async function toggleSuspended() {
    if (!suspending) return;
    setSuspendBusy(true);
    setSuspendError(null);
    try {
      await api(`/organizations/${suspending.id}/suspend`, {
        method: "POST",
        body: { suspended: !suspending.suspendedAt, reason: reason || undefined },
      });
      setSuspending(null);
      setReason("");
      refresh();
    } catch (e) {
      setSuspendError(e instanceof Error ? e.message : "errors.internal");
    } finally {
      setSuspendBusy(false);
    }
  }

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
                <TableHead className="text-right">{t("groupsCount")}</TableHead>
                <TableHead className="text-right">{t("storage")}</TableHead>
                <TableHead>{t("lastSignIn")}</TableHead>
                <TableHead>{t("integrations")}</TableHead>
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
                    {org.suspendedAt && (
                      <Badge
                        variant="destructive"
                        className="ml-2"
                        title={org.suspendedReason ?? undefined}
                        data-testid="organization-suspended"
                      >
                        {t("suspended")}
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
                  <TableCell
                    className="text-right tabular-nums"
                    data-testid="organization-students"
                  >
                    {org.studentsCount}
                    {org.archivedStudentsCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        {t("archivedCount", { count: org.archivedStudentsCount })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{org.groupsCount}</TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="organization-storage">
                    {formatBytes(org.storageBytes)}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    data-testid="organization-last-sign-in"
                  >
                    {org.lastSignInAt
                      ? fmt(new Date(org.lastSignInAt), { dateStyle: "medium", timeStyle: "short" })
                      : t("never")}
                  </TableCell>
                  <TableCell>
                    {org.integrations.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {org.integrations.map((p) => (
                          <Badge key={p} variant="outline">
                            {tc.has(`integrations.providers.${p}`)
                              ? tc(`integrations.providers.${p}`)
                              : p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={org.name}
                      onEdit={() => setDialog({ open: true, organization: org })}
                      extra={[
                        {
                          label: t("export"),
                          onSelect: () =>
                            window.open(`/api/v1/organizations/${org.id}/export`, "_blank"),
                          testId: "organization-export",
                        },
                        ...(org.id === ownId
                          ? []
                          : [
                              {
                                label: org.suspendedAt ? t("resume") : t("suspend"),
                                onSelect: () => {
                                  setReason("");
                                  setSuspendError(null);
                                  setSuspending(org);
                                },
                                testId: "organization-suspend",
                              },
                            ]),
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <FormDialog
        open={!!suspending}
        onOpenChange={(open) => !open && setSuspending(null)}
        title={suspending?.suspendedAt ? t("resumeTitle") : t("suspendTitle")}
        description={
          suspending?.suspendedAt
            ? t("resumeText", { name: suspending?.name ?? "" })
            : t("suspendText", { name: suspending?.name ?? "" })
        }
        onSubmit={toggleSuspended}
        submitting={suspendBusy}
        error={suspendError}
        submitLabel={suspending?.suspendedAt ? t("resume") : t("suspend")}
        testId="organization-suspend-dialog"
      >
        {!suspending?.suspendedAt && (
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">{t("reason")}</Label>
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>
        )}
      </FormDialog>
      <OrganizationDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        organization={dialog.organization}
        onSaved={refresh}
      />
    </div>
  );
}
