"use client";

import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import type { SoffDetection, SoffRunResult } from "@/server/services/imports/soff-import.service";

import { BranchSelect, type BranchOption } from "../shared/branch-select";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function post<T>(fields: Record<string, string>, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf) headers[CSRF_HEADER] = csrf;
  const response = await fetch("/api/v1/imports/soff", {
    method: "POST",
    headers,
    credentials: "same-origin",
    body,
  });
  if (!response.ok) {
    let err: ApiErrorBody["error"] = { code: "INTERNAL", message: "errors.internal" };
    try {
      err = ((await response.json()) as ApiErrorBody).error ?? err;
    } catch {
      // keep the generic error
    }
    throw new ApiError(response.status, err);
  }
  return (await response.json()) as T;
}

const ORDER = ["staff", "groups", "students", "payments"] as const;

/**
 * Settings → Import from SOFF CRM (A-143): drop one of the vendor's Excel exports,
 * see which list it is and how its columns map, preview, import.
 */
export function SoffImportPage({
  branches,
  defaultBranchId,
}: {
  branches: BranchOption[];
  defaultBranchId: string;
}) {
  const t = useTranslations("settings.migration");
  const tc = useTranslations();
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<SoffDetection | null>(null);
  const [preview, setPreview] = useState<SoffRunResult | null>(null);
  const [result, setResult] = useState<SoffRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      const first = e.fields ? Object.values(e.fields)[0]?.[0] : undefined;
      setError(first ?? e.message);
    } else setError("errors.internal");
  };

  async function choose(next: File | null) {
    setFile(next);
    setDetection(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!next) return;
    setBusy(true);
    try {
      setDetection(await post<SoffDetection>({ detect: "1" }, next));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function run(dryRun: boolean) {
    if (!file || !detection?.kind) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post<SoffRunResult>(
        { kind: detection.kind, branchId, ...(dryRun ? { dryRun: "1" } : {}) },
        file,
      );
      if (dryRun) setPreview(data);
      else {
        setPreview(null);
        setResult(data);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const text = (key: string) => (tc.has(key) ? tc(key) : key);
  const shown = result ?? preview;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("stepsTitle")}</CardTitle>
          <CardDescription>{t("stepsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm sm:grid-cols-4">
            {ORDER.map((kind, i) => (
              <li key={kind} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t("step", { n: i + 1 })}</div>
                <div className="font-medium">{t(`kinds.${kind}`)}</div>
                <div className="text-xs text-muted-foreground">{t(`kindHints.${kind}`)}</div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <BranchSelect
            id="soff-branch"
            branches={branches}
            value={branchId}
            onChange={setBranchId}
          />
          <div className="space-y-2">
            <Label htmlFor="soff-file">{t("file")}</Label>
            <Input
              id="soff-file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
              data-testid="soff-file"
            />
          </div>
          {error && <Alert variant="destructive">{text(error)}</Alert>}
          {detection && (
            <div
              className="space-y-3"
              data-testid="soff-detection"
              data-kind={detection.kind ?? ""}
            >
              {detection.kind ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge data-testid="soff-kind">{t(`kinds.${detection.kind}`)}</Badge>
                  <span className="text-muted-foreground">
                    {t("rows", { count: detection.rows })}
                  </span>
                </div>
              ) : (
                <Alert variant="destructive">{t("notRecognised")}</Alert>
              )}
              {detection.kind && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("fileColumn")}</TableHead>
                        <TableHead>{t("kampusField")}</TableHead>
                        <TableHead>{t("sampleValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(detection.columns).map(([key, header]) => (
                        <TableRow key={key} data-testid="soff-column">
                          <TableCell className="font-medium">{header}</TableCell>
                          <TableCell>{t(`fields.${detection.kind}.${key}`)}</TableCell>
                          <TableCell className="max-w-64 truncate text-muted-foreground">
                            {detection.sample.map((s) => s[key]).find(Boolean) ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {detection.unknown.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("unknown", { columns: detection.unknown.join(", ") })}
                </p>
              )}
            </div>
          )}
          {shown && (
            <div className="space-y-2" data-testid={result ? "soff-result" : "soff-preview"}>
              <Alert
                variant={shown.imported > 0 ? (result ? "success" : "default") : "destructive"}
              >
                {result
                  ? t("imported", { count: shown.imported, skipped: shown.skipped.length })
                  : t("preview", { count: shown.imported, skipped: shown.skipped.length })}
              </Alert>
              {shown.extra.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {shown.extra.map((x) => (
                    <li key={x.key} data-testid={`soff-extra-${x.key}`}>
                      {t(`extra.${x.key}`, { count: x.imported, skipped: x.skipped })}
                    </li>
                  ))}
                </ul>
              )}
              {!result && shown.matched.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {shown.matched.slice(0, 50).map((m) => (
                    <li key={m.row}>
                      {m.row}: {m.label}
                    </li>
                  ))}
                </ul>
              )}
              {shown.skipped.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {shown.skipped.slice(0, 50).map((s) => (
                    <li key={`${s.row}-${s.reason}`}>
                      {tc("excel.skippedRow", { row: s.row, reason: text(s.reason) })}
                    </li>
                  ))}
                </ul>
              )}
              {(shown.logins?.length ?? 0) > 0 && (
                <div className="space-y-1" data-testid="soff-logins">
                  <p className="text-xs font-medium">{tc("excel.logins")}</p>
                  <ul className="max-h-48 space-y-1 overflow-auto rounded-md border p-2 font-mono text-xs">
                    {shown.logins!.map((l) => (
                      <li key={l.row}>
                        {l.label}: <span className="select-all">{l.secret}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{tc("excel.loginsHint")}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void run(true)}
              disabled={!file || !detection?.kind || busy || !branchId}
              data-testid="soff-preview-button"
            >
              {t("previewButton")}
            </Button>
            <Button
              type="button"
              onClick={() => void run(false)}
              disabled={!file || !detection?.kind || busy || !branchId || !preview || !!result}
              data-testid="soff-import-button"
            >
              <FileUp /> {busy ? tc("common.saving") : t("importButton")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
