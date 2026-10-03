"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
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
import { api } from "@/lib/api-client";
import type { LeadFormDto } from "@/server/services/leads/forms.service";
import type { LeadOptions } from "@/server/services/leads/leads.service";

import { RowActions } from "../shared/row-actions";
import { FormDialog } from "./form-dialog";

/** EXP §8 "Formalar": public lead forms; clicking a row copies its link. */
export function FormsPage({
  forms,
  options,
  locale,
}: {
  forms: LeadFormDto[];
  options: LeadOptions;
  locale: string;
}) {
  const t = useTranslations();
  const tf = useTranslations("settings.forms");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; form: LeadFormDto | null }>({
    open: false,
    form: null,
  });
  const [deleting, setDeleting] = useState<LeadFormDto | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  const linkFor = (form: LeadFormDto) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/${locale}/forms/${form.slug}`;

  async function copy(form: LeadFormDto) {
    try {
      await navigator.clipboard.writeText(linkFor(form));
      setCopied(form.id);
      setTimeout(() => setCopied((c) => (c === form.id ? null : c)), 1500);
    } catch {
      // Clipboard access can be refused; the link stays visible in the row.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{tf("title")}</h2>
          <p className="text-sm text-muted-foreground">{tf("description")}</p>
        </div>
        <Button onClick={() => setDialog({ open: true, form: null })} data-testid="add-button">
          {tf("add")}
        </Button>
      </div>
      <Card>
        {forms.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} hint={tf("hint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{tf("name")}</TableHead>
                <TableHead>{tf("column")}</TableHead>
                <TableHead>{tf("source")}</TableHead>
                <TableHead className="text-right">{tf("leadCount")}</TableHead>
                <TableHead>{tf("link")}</TableHead>
                <TableHead>{tf("integration")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form, i) => (
                <TableRow
                  key={form.id}
                  data-testid="form-row"
                  className="cursor-pointer"
                  onClick={() => void copy(form)}
                  title={tf("hint")}
                >
                  <TableCell className="tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {form.name}
                    {!form.isActive && (
                      <Badge variant="muted" className="ml-2">
                        {t("common.inactive")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {form.boardName} · {form.columnName}
                  </TableCell>
                  <TableCell>{form.sourceName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{form.leadCount}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-xs">
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        /{locale}/forms/{form.slug}
                      </code>
                      {copied === form.id ? (
                        <Check className="size-4 text-success" aria-label={tf("copied")} />
                      ) : (
                        <Copy className="size-4 text-muted-foreground" />
                      )}
                      <a
                        href={linkFor(form)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={tf("open")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </span>
                  </TableCell>
                  <TableCell>{form.integration ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      name={form.name}
                      onEdit={() => setDialog({ open: true, form })}
                      onDelete={() => setDeleting(form)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        form={dialog.form}
        options={options}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={tf("deleteTitle")}
        description={tf("deleteText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/lead-forms/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
