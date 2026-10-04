"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { TestDto, TestOptions } from "@/server/services/tests/tests.service";

import { TestDialog } from "./test-dialog";
import { TestStatusBadge } from "./tests-settings-page";

/** Group → TEST (EXP §5): "Test yaratish" and the tests given to this group. */
export function GroupTestsTab({
  groupId,
  tests,
  options,
  canCreate,
}: {
  groupId: string;
  tests: TestDto[];
  options: TestOptions | null;
  canCreate: boolean;
}) {
  const t = useTranslations("tests");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {canCreate && options && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)} data-testid="group-test-add">
            {t("add")}
          </Button>
        </div>
      )}
      {tests.length === 0 ? (
        <EmptyState title={t("groupTab.empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.subject")}</TableHead>
              <TableHead className="text-right">{t("columns.questions")}</TableHead>
              <TableHead className="text-right">{t("columns.attempts")}</TableHead>
              <TableHead>{t("columns.deadline")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((x) => (
              <TableRow key={x.id} data-testid="group-test-row">
                <TableCell className="font-medium">
                  <Link href={`/settings/tests/${x.id}`} className="hover:underline">
                    {x.name}
                  </Link>
                </TableCell>
                <TableCell>{x.subject}</TableCell>
                <TableCell className="text-right tabular-nums">{x.questionCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {x.attemptCount}
                  {x.accuracy !== null && (
                    <span className="text-muted-foreground"> · {x.accuracy}%</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {x.deadline ? fmt(parseDateOnly(x.deadline), { dateStyle: "medium" }) : "—"}
                </TableCell>
                <TableCell>
                  <TestStatusBadge status={x.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {options && (
        <TestDialog
          open={open}
          onOpenChange={setOpen}
          test={null}
          options={options}
          fixedGroupId={groupId}
          onSaved={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}
