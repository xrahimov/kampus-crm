"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { CoinEvent } from "@/lib/validation/coins";
import type { CoinReasonDto, CoinSettingsDto } from "@/server/services/coins/coins.service";

import { RowActions } from "../shared/row-actions";
import { CoinReasonDialog } from "./coin-reason-dialog";

type RuleDraft = { event: CoinEvent; amount: string; isActive: boolean };

/** Rules without a trigger in v1 (A-79): shown, saved, not yet fired. */
const UNWIRED: CoinEvent[] = ["HOMEWORK", "BIRTHDAY"];

/** Settings → "Coin sozlamalari" (EXP §8): automatic rules and manual reasons. */
export function CoinsSettingsPage({
  settings,
  reasons,
  canEdit,
}: {
  settings: CoinSettingsDto;
  reasons: CoinReasonDto[];
  canEdit: boolean;
}) {
  const t = useTranslations("coins.settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [autoCoins, setAutoCoins] = useState(settings.autoCoins);
  const [rules, setRules] = useState<RuleDraft[]>(
    settings.rules.map((r) => ({ ...r, amount: String(r.amount) })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; reason: CoinReasonDto | null }>({
    open: false,
    reason: null,
  });
  const [deleting, setDeleting] = useState<CoinReasonDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/coins", {
        method: "PUT",
        body: {
          autoCoins,
          rules: rules.map((r) => ({ ...r, amount: Number(r.amount) })),
        },
      });
      setMessage({ kind: "ok", text: tc("saved") });
      refresh();
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof ApiError ? e.message : "errors.internal",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="auto-coins" className="font-medium">
                {t("autoCoins")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("autoCoinsHint")}</p>
            </div>
            <Switch
              id="auto-coins"
              checked={autoCoins}
              onCheckedChange={setAutoCoins}
              disabled={!canEdit}
              data-testid="auto-coins"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("rulesTitle")}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.event")}</TableHead>
                  <TableHead className="w-36">{t("columns.amount")}</TableHead>
                  <TableHead className="w-28">{tc("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule, i) => (
                  <TableRow key={rule.event} data-testid="coin-rule">
                    <TableCell>
                      <div className="font-medium">{t(`events.${rule.event}`)}</div>
                      {UNWIRED.includes(rule.event) && (
                        <div className="text-xs text-muted-foreground">{t("notWired")}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        aria-label={t(`events.${rule.event}`)}
                        value={rule.amount}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setRules((rs) =>
                            rs.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)),
                          )
                        }
                        className="h-8 w-28 tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={rule.isActive}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            setRules((rs) =>
                              rs.map((r, j) => (j === i ? { ...r, isActive: !!v } : r)),
                            )
                          }
                        />
                        {rule.isActive ? tc("active") : tc("inactive")}
                      </label>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {message && (
            <Alert variant={message.kind === "ok" ? "default" : "destructive"} role="status">
              {message.kind === "ok" ? message.text : tc("retry")}
            </Alert>
          )}
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} data-testid="save-coin-settings">
                {saving ? tc("saving") : tc("save")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t("reasonsTitle")}</CardTitle>
            <CardDescription>{t("reasonsDescription")}</CardDescription>
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setDialog({ open: true, reason: null })}
              data-testid="add-reason"
            >
              <Plus /> {t("addReason")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {reasons.length === 0 ? (
            <EmptyState title={tc("nothingFound")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reasonName")}</TableHead>
                  <TableHead className="text-right">{t("maxCoins")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasons.map((reason) => (
                  <TableRow key={reason.id} data-testid="coin-reason-row">
                    <TableCell className="font-medium">{reason.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t("upTo", { max: reason.maxCoins })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={reason.isActive ? "success" : "muted"}>
                        {reason.isActive ? tc("active") : tc("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <RowActions
                          name={reason.name}
                          onEdit={() => setDialog({ open: true, reason })}
                          onDelete={() => setDeleting(reason)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CoinReasonDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        reason={dialog.reason}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteReasonTitle")}
        description={t("deleteReasonText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/coin-reasons/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
