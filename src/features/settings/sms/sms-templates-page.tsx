"use client";

import { Download, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { SmsCategoryDto, SmsTemplateDto } from "@/server/services/sms/templates.service";

import { RowActions } from "../shared/row-actions";
import { SmsCategoryDialog } from "./sms-category-dialog";
import { SmsTemplateDialog } from "./sms-template-dialog";

/** Settings → "SMS shablonlari" (EXP §8): categories, templates grouped by category, import. */
export function SmsTemplatesPage({
  categories,
  templates,
  canEdit,
}: {
  categories: SmsCategoryDto[];
  templates: SmsTemplateDto[];
  canEdit: boolean;
}) {
  const t = useTranslations("sms.templates");
  const tc = useTranslations("common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [templateDialog, setTemplateDialog] = useState<{
    open: boolean;
    template: SmsTemplateDto | null;
  }>({ open: false, template: null });
  const [deletingTemplate, setDeletingTemplate] = useState<SmsTemplateDto | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<SmsCategoryDto | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function importFromProvider() {
    const category = categories[0];
    if (!category) {
      setMessage({ kind: "error", text: t("importNeedsCategory") });
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const r = await api<{ imported: number; adapter: string }>("/sms-templates/import", {
        method: "POST",
        body: { categoryId: category.id },
      });
      setMessage({
        kind: "ok",
        text: t("imported", { count: r.imported, category: category.name, adapter: r.adapter }),
      });
      refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setImporting(false);
    }
  }

  async function remove(kind: "template" | "category", id: string) {
    await api(`/${kind === "template" ? "sms-templates" : "sms-categories"}/${id}`, {
      method: "DELETE",
    });
    refresh();
  }

  const grouped = categories.map((c) => ({
    category: c,
    templates: templates.filter((x) => x.categoryId === c.id),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={importFromProvider}
                disabled={importing}
                data-testid="import-templates"
              >
                <Download /> {t("import")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCategoryOpen(true)}
                data-testid="add-sms-category"
              >
                <Plus /> {t("addCategory")}
              </Button>
              <Button
                size="sm"
                onClick={() => setTemplateDialog({ open: true, template: null })}
                disabled={categories.length === 0}
                data-testid="add-sms-template"
              >
                <Plus /> {t("addTemplate")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Alert variant={message.kind === "ok" ? "success" : "destructive"}>
              {message.text}
            </Alert>
          )}
          {categories.length === 0 ? (
            <EmptyState title={t("empty")} hint={t("emptyHint")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">{t("columns.category")}</TableHead>
                  <TableHead>{t("columns.text")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(({ category, templates: rows }) => (
                  <React.Fragment key={category.id}>
                    <TableRow className="bg-muted/40" data-testid="sms-category-row">
                      <TableCell className="font-medium" colSpan={2}>
                        {category.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({category.templatesCount})
                        </span>
                      </TableCell>
                      <TableCell>
                        {canEdit && rows.length === 0 && (
                          <RowActions
                            name={category.name}
                            onDelete={() => setDeletingCategory(category)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                    {rows.map((tpl) => (
                      <TableRow key={tpl.id} data-testid="sms-template-row">
                        <TableCell className="text-muted-foreground">
                          {tpl.imported && <Badge variant="outline">{t("importedBadge")}</Badge>}
                        </TableCell>
                        <TableCell className="whitespace-pre-wrap">{tpl.text}</TableCell>
                        <TableCell>
                          {canEdit && (
                            <RowActions
                              name={tpl.text.slice(0, 30)}
                              onEdit={() => setTemplateDialog({ open: true, template: tpl })}
                              onDelete={() => setDeletingTemplate(tpl)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SmsCategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} onSaved={refresh} />
      <SmsTemplateDialog
        open={templateDialog.open}
        onOpenChange={(open) => setTemplateDialog((d) => ({ ...d, open }))}
        template={templateDialog.template}
        categories={categories}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deletingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null);
        }}
        title={t("deleteTemplate")}
        description={deletingTemplate?.text ?? ""}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (deletingTemplate) await remove("template", deletingTemplate.id);
          setDeletingTemplate(null);
        }}
      />
      <ConfirmDialog
        open={deletingCategory !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null);
        }}
        title={t("deleteCategory")}
        description={deletingCategory?.name ?? ""}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (deletingCategory) await remove("category", deletingCategory.id);
          setDeletingCategory(null);
        }}
      />
    </div>
  );
}
