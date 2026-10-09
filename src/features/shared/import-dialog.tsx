"use client";

import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";

export interface ImportResult {
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
  /** Set by importers that preview: true while nothing has been written yet. */
  dryRun?: boolean;
  /** Rows a preview matched, as short labels. */
  matched?: Array<{ row: number; label: string }>;
  /** False when the file's header row was not recognised and the template order was assumed. */
  byHeader?: boolean;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * "EXCEL ORQALI QO'SHISH" (EXP §5, §6): download the template, drop the filled file,
 * read how many rows came in and which were skipped.
 */
export function ImportDialog({
  open,
  onOpenChange,
  title,
  description,
  templatePath,
  importPath,
  fields,
  preview,
  onDone,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Replaces the generic "download the template" hint. */
  description?: string;
  /** Path under /api/v1 of the template download. */
  templatePath: string;
  /** Path under /api/v1 that accepts the multipart file. */
  importPath: string;
  /** Extra form fields (e.g. branchId). */
  fields?: Record<string, string>;
  /** First upload runs with `dryRun=1` and shows what would happen; a second click imports. */
  preview?: boolean;
  onDone?: (result: ImportResult) => void;
  testId?: string;
}) {
  const t = useTranslations();
  const te = useTranslations("excel");
  const locale = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewed, setPreviewed] = useState<ImportResult | null>(null);

  function close(next: boolean) {
    if (!next) {
      setFile(null);
      setError(null);
      setResult(null);
      setPreviewed(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!file) return;
    const dryRun = !!preview && !previewed;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      for (const [k, v] of Object.entries(fields ?? {})) body.append(k, v);
      if (dryRun) body.append("dryRun", "1");
      const headers: Record<string, string> = { Accept: "application/json" };
      const csrf = readCookie(CSRF_COOKIE);
      if (csrf) headers[CSRF_HEADER] = csrf;
      const response = await fetch(`/api/v1${importPath}`, {
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
      const data = (await response.json()) as ImportResult;
      if (dryRun) {
        setPreviewed(data);
        return;
      }
      setPreviewed(null);
      setResult(data);
      onDone?.(data);
    } catch (e) {
      if (e instanceof ApiError) {
        const first = e.fields ? Object.values(e.fields)[0]?.[0] : undefined;
        setError(first ?? e.message);
      } else setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const reasonText = (reason: string) => (t.has(reason) ? t(reason) : reason);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent data-testid={testId ?? "import-dialog"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? te("importHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/v1${templatePath}?locale=${locale}`}
              download
              data-testid="import-template"
            >
              <Download /> {te("downloadTemplate")}
            </a>
          </Button>
          <div className="space-y-2">
            <Label htmlFor="import-file">{te("file")}</Label>
            <Input
              id="import-file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setPreviewed(null);
              }}
              data-testid="import-file"
            />
          </div>
          {error && <Alert variant="destructive">{t.has(error) ? t(error) : error}</Alert>}
          {previewed && !result && (
            <div className="space-y-2" data-testid="import-preview">
              <Alert variant={previewed.imported > 0 ? "default" : "destructive"}>
                {te("preview", { count: previewed.imported, skipped: previewed.skipped.length })}
              </Alert>
              {previewed.byHeader === false && (
                <p className="text-xs text-muted-foreground">{te("noHeader")}</p>
              )}
              {(previewed.matched?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{te("matchedRows")}</p>
                  <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                    {previewed.matched!.slice(0, 50).map((m) => (
                      <li key={m.row}>
                        {m.row}: {m.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {previewed.skipped.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {previewed.skipped.slice(0, 50).map((s) => (
                    <li key={s.row}>
                      {te("skippedRow", { row: s.row, reason: reasonText(s.reason) })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result && (
            <div className="space-y-2" data-testid="import-result">
              <Alert variant={result.imported > 0 ? "success" : "destructive"}>
                {te("imported", { count: result.imported, skipped: result.skipped.length })}
              </Alert>
              {result.skipped.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {result.skipped.slice(0, 50).map((s) => (
                    <li key={s.row}>
                      {te("skippedRow", { row: s.row, reason: reasonText(s.reason) })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!file || busy || (!!previewed && previewed.imported === 0)}
            data-testid="import-submit"
          >
            {busy
              ? t("common.saving")
              : previewed && !result
                ? te("confirmImport", { count: previewed.imported })
                : preview && !result
                  ? te("previewButton")
                  : te("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
