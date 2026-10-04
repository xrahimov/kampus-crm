"use client";

import { Coins } from "lucide-react";
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
import { useRouter } from "@/i18n/navigation";
import type { CoinReasonDto, GroupCoinRowDto } from "@/server/services/coins/coins.service";

import { GiveCoinsDialog } from "./give-coins-dialog";

/** Group → COINLAR (EXP §5): rank, student, total coins, comment, "COIN BERISH". */
export function GroupCoinsTab({
  groupId,
  rows,
  reasons,
  canGive,
  canExceed,
}: {
  groupId: string;
  rows: GroupCoinRowDto[];
  reasons: CoinReasonDto[];
  canGive: boolean;
  canExceed: boolean;
}) {
  const t = useTranslations("coins.group");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<{ id: string; fullName: string } | null>(null);

  if (rows.length === 0) return <EmptyState title={t("noMembers")} />;
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">{t("columns.rank")}</TableHead>
            <TableHead>{t("columns.student")}</TableHead>
            <TableHead className="text-right">{t("columns.total")}</TableHead>
            <TableHead className="text-right">{t("columns.groupCoins")}</TableHead>
            <TableHead>{t("columns.comment")}</TableHead>
            {canGive && <TableHead className="w-32" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.studentId} data-testid="coin-row">
              <TableCell className="tabular-nums">{r.rank}</TableCell>
              <TableCell className="font-medium">{r.fullName}</TableCell>
              <TableCell className="text-right tabular-nums" data-testid="coin-balance">
                {r.balance}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.groupCoins}</TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground">
                {r.lastComment ?? "—"}
              </TableCell>
              {canGive && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget({ id: r.studentId, fullName: r.fullName })}
                    data-testid="give-coins"
                  >
                    <Coins /> {t("give")}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <GiveCoinsDialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
        student={target}
        groupId={groupId}
        reasons={reasons}
        canExceed={canExceed}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
