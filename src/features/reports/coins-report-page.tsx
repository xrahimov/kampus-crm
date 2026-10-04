"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { SearchBox } from "@/components/data/search-box";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RowActions } from "@/features/settings/shared/row-actions";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import {
  COIN_PERIODS,
  PURCHASE_STATUSES,
  type CoinRatingFilters,
  type PurchaseStatus,
} from "@/lib/validation/coins";
import { useDateFormat } from "@/lib/use-date-format";
import type {
  CoinReportOptions,
  CoinsReportDto,
  CoinTransactionDto,
} from "@/server/services/coins/coins.service";
import type {
  ProductCategoryDto,
  ProductDto,
  PurchaseRequestDto,
} from "@/server/services/coins/marketplace.service";

import { ProductDialog } from "./product-dialog";

const ALL = "__all";
export type CoinsTab = "rating" | "marketplace" | "requests";

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const t = useTranslations("coins.requests.statuses");
  const variant =
    status === "APPROVED" ? "success" : status === "REJECTED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Reports → Coins (EXP §10): KPIs, REYTING / MARKETPLACE / XARID SO'ROVLARI. */
export function CoinsReportPage({
  tab,
  filters,
  report,
  options,
  categories,
  products,
  requests,
  requestStatus,
  can,
}: {
  tab: CoinsTab;
  filters: CoinRatingFilters;
  report: CoinsReportDto;
  options: CoinReportOptions;
  categories: ProductCategoryDto[];
  products: ProductDto[];
  requests: PurchaseRequestDto[];
  requestStatus: PurchaseStatus | "ALL";
  can: { manage: boolean };
}) {
  const t = useTranslations("coins.report");
  const tm = useTranslations("coins.marketplace");
  const tr = useTranslations("coins.requests");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [history, setHistory] = useState<{
    name: string;
    balance: number;
    items: CoinTransactionDto[];
  } | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [productDialog, setProductDialog] = useState<{ open: boolean; product: ProductDto | null }>(
    {
      open: false,
      product: null,
    },
  );
  const [deletingProduct, setDeletingProduct] = useState<ProductDto | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function openHistory(row: { studentId: string; fullName: string }) {
    const data = await api<{ balance: number; items: CoinTransactionDto[] }>(
      `/students/${row.studentId}/coins`,
    );
    setHistory({ name: row.fullName, ...data });
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      await api(`/marketplace/purchase-requests/${id}`, { method: "PATCH", body: { status } });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const kpis: Array<[string, number]> = [
    [t("kpis.totalGiven"), report.kpis.totalGiven],
    [t("kpis.totalSpent"), report.kpis.totalSpent],
    [t("kpis.purchases"), report.kpis.purchases],
    [t("kpis.activeStudents"), report.kpis.activeStudents],
  ];
  const groups = options.groups.filter(
    (g) =>
      (!filters.branchId || g.branchId === filters.branchId) &&
      (!filters.courseId || g.courseId === filters.courseId),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="coins-kpi">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "rating" ? null : v })}>
        <TabsList>
          {(["rating", "marketplace", "requests"] as const).map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`coins-tab-${k}`}>
              {t(`tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "rating" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox />
            <Select
              value={filters.branchId ?? ALL}
              onValueChange={(v) => setParams({ branchId: v, groupId: null })}
            >
              <SelectTrigger className="w-40" aria-label={t("filters.branch")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anyBranch")}</SelectItem>
                {options.branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.courseId ?? ALL}
              onValueChange={(v) => setParams({ courseId: v, groupId: null })}
            >
              <SelectTrigger className="w-40" aria-label={t("filters.course")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anyCourse")}</SelectItem>
                {options.courses
                  .filter((c) => !filters.branchId || c.branchId === filters.branchId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={filters.groupId ?? ALL} onValueChange={(v) => setParams({ groupId: v })}>
              <SelectTrigger className="w-44" aria-label={t("filters.group")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anyGroup")}</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-1">
              {COIN_PERIODS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={filters.period === p ? "default" : "outline"}
                  onClick={() => setParams({ period: p === "ALL" ? null : p })}
                  data-testid={`period-${p}`}
                >
                  {t(`periods.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <Card>
            {report.rating.length === 0 ? (
              <EmptyState title={tc("nothingFound")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t("columns.rank")}</TableHead>
                    <TableHead>{t("columns.student")}</TableHead>
                    <TableHead>{t("columns.branch")}</TableHead>
                    <TableHead className="text-right">{t("columns.balance")}</TableHead>
                    <TableHead className="text-right">{t("columns.earned")}</TableHead>
                    <TableHead className="text-right">{t("columns.spent")}</TableHead>
                    <TableHead>{t("columns.lastActivity")}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rating.map((r) => (
                    <TableRow key={r.studentId} data-testid="rating-row">
                      <TableCell className="tabular-nums">{r.rank}</TableCell>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell>{r.branchName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.balance}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.earned}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.spent}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.lastActivity
                          ? fmt(new Date(r.lastActivity), { dateStyle: "medium" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openHistory(r)}
                          data-testid="rating-view"
                        >
                          {t("view")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "marketplace" && (
        <>
          {can.manage && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCategoriesOpen(true)}
                data-testid="categories-button"
              >
                {tm("categories")}
              </Button>
              <Button
                onClick={() => setProductDialog({ open: true, product: null })}
                data-testid="add-product"
              >
                <Plus /> {tm("addProduct")}
              </Button>
            </div>
          )}
          <Card>
            {products.length === 0 ? (
              <EmptyState title={tm("empty")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{tm("columns.image")}</TableHead>
                    <TableHead>{tm("columns.name")}</TableHead>
                    <TableHead>{tm("columns.category")}</TableHead>
                    <TableHead className="text-right">{tm("columns.price")}</TableHead>
                    <TableHead className="text-right">{tm("columns.purchased")}</TableHead>
                    <TableHead className="text-right">{tm("columns.stock")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    {can.manage && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id} data-testid="product-row">
                      <TableCell>
                        <Avatar src={p.imageUrl} name={p.name} className="size-9 rounded-md" />
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.categoryName}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.priceCoins}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.purchasedCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "success" : "muted"}>
                          {p.isActive ? tc("active") : tc("inactive")}
                        </Badge>
                      </TableCell>
                      {can.manage && (
                        <TableCell>
                          <RowActions
                            name={p.name}
                            onEdit={() => setProductDialog({ open: true, product: p })}
                            onDelete={() => setDeletingProduct(p)}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "requests" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              value={requestStatus === "ALL" ? ALL : requestStatus}
              onValueChange={(v) => setParams({ status: v })}
            >
              <SelectTrigger
                className="w-44"
                aria-label={tr("filters.status")}
                data-testid="request-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tr("filters.anyStatus")}</SelectItem>
                {PURCHASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tr(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {can.manage && (
              <Button onClick={() => setRequestOpen(true)} data-testid="add-request">
                <Plus /> {tr("add")}
              </Button>
            )}
          </div>
          <Card>
            {requests.length === 0 ? (
              <EmptyState title={tc("nothingFound")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("columns.student")}</TableHead>
                    <TableHead>{tr("columns.product")}</TableHead>
                    <TableHead className="text-right">{tr("columns.coins")}</TableHead>
                    <TableHead>{tr("columns.date")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    {can.manage && <TableHead className="w-48" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id} data-testid="request-row">
                      <TableCell className="font-medium">{r.studentName}</TableCell>
                      <TableCell>{r.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.coins}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmt(new Date(r.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell>
                        <PurchaseStatusBadge status={r.status} />
                        {r.decidedByName && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.decidedByName}
                          </span>
                        )}
                      </TableCell>
                      {can.manage && (
                        <TableCell className="text-right">
                          {r.status === "PENDING" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                disabled={busyId === r.id}
                                onClick={() => decide(r.id, "APPROVED")}
                                data-testid="approve-request"
                              >
                                {tr("approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.id}
                                onClick={() => decide(r.id, "REJECTED")}
                              >
                                {tr("reject")}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* "KO'RISH": a student's coin history */}
      <Dialog open={!!history} onOpenChange={(open) => !open && setHistory(null)}>
        <DialogContent data-testid="coin-history">
          <DialogHeader>
            <DialogTitle>{history?.name}</DialogTitle>
            <DialogDescription>{t("balance", { count: history?.balance ?? 0 })}</DialogDescription>
          </DialogHeader>
          {history && history.items.length === 0 ? (
            <EmptyState title={tc("nothingFound")} />
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("history.date")}</TableHead>
                    <TableHead className="text-right">{t("history.amount")}</TableHead>
                    <TableHead>{t("history.reason")}</TableHead>
                    <TableHead>{t("history.by")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.items.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmt(new Date(x.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${x.amount < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {x.amount > 0 ? `+${x.amount}` : x.amount}
                      </TableCell>
                      <TableCell>
                        {x.reasonName ??
                          (x.event ? t(`events.${x.event}`) : (x.comment ?? t(`kinds.${x.kind}`)))}
                        {x.groupName && (
                          <span className="text-muted-foreground"> · {x.groupName}</span>
                        )}
                      </TableCell>
                      <TableCell>{x.givenByName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        onChanged={refresh}
      />
      <ProductDialog
        open={productDialog.open}
        onOpenChange={(open) => setProductDialog((d) => ({ ...d, open }))}
        product={productDialog.product}
        categories={categories}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deletingProduct}
        onOpenChange={(open) => !open && setDeletingProduct(null)}
        title={tm("deleteTitle")}
        description={tm("deleteText", { name: deletingProduct?.name ?? "" })}
        onConfirm={async () => {
          if (!deletingProduct) return;
          await api(`/marketplace/products/${deletingProduct.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <PurchaseRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        products={products.filter((p) => p.isActive && p.stock > 0)}
        onSaved={refresh}
      />
    </div>
  );
}

/** "KATEGORIYALAR": name + QO'SHISH, with the existing list and delete. */
function CategoriesDialog({
  open,
  onOpenChange,
  categories,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategoryDto[];
  onChanged: () => void;
}) {
  const tm = useTranslations("coins.marketplace");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/marketplace/categories", { method: "POST", body: { name } });
      setName("");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.name?.[0] ?? e.message) : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/marketplace/categories/${id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="categories-dialog">
        <DialogHeader>
          <DialogTitle>{tm("categories")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={add} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="category-name">{tm("categoryName")}</Label>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !name.trim()} data-testid="add-category">
            {tc("add")}
          </Button>
        </form>
        <CategoryError error={error} />
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tm("noCategories")}</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
                data-testid="category-row"
              >
                <span>
                  {c.name} <span className="text-muted-foreground">· {c.productCount}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={c.productCount > 0}
                  onClick={() => remove(c.id)}
                  aria-label={tc("actionsFor", { name: c.name })}
                >
                  {tc("delete")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryError({ error }: { error: string | null }) {
  const t = useTranslations();
  if (!error) return null;
  return (
    <p className="text-sm text-destructive">{t.has(error) ? t(error) : t("errors.internal")}</p>
  );
}

/** Staff files a purchase request for a student (A-80). */
function PurchaseRequestDialog({
  open,
  onOpenChange,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductDto[];
  onSaved: () => void;
}) {
  const tr = useTranslations("coins.requests");
  const tc = useTranslations("common");
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<
    Array<{ id: string; fullName: string; phone: string | null; balance: number }>
  >([]);
  const [student, setStudent] = useState<{ id: string; fullName: string; balance: number } | null>(
    null,
  );
  const [productId, setProductId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setQuery("");
    setCandidates([]);
    setStudent(null);
    setProductId("");
    setError(null);
  }

  async function search(value: string) {
    setQuery(value);
    setStudent(null);
    if (value.trim().length < 2) {
      setCandidates([]);
      return;
    }
    setCandidates(await api(`/coins/students?q=${encodeURIComponent(value)}`));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || !productId) return;
    setBusy(true);
    setError(null);
    try {
      await api("/marketplace/purchase-requests", {
        method: "POST",
        body: { studentId: student.id, productId },
      });
      onOpenChange(false);
      reset();
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : "errors.internal",
      );
    } finally {
      setBusy(false);
    }
  }

  const product = products.find((p) => p.id === productId);
  const unaffordable = !!product && !!student && student.balance < product.priceCoins;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="request-dialog">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{tr("add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="request-student">{tr("student")}</Label>
            <Input
              id="request-student"
              value={student ? student.fullName : query}
              onChange={(e) => search(e.target.value)}
              placeholder={tc("search")}
              data-testid="request-student"
            />
            {!student && candidates.length > 0 && (
              <ul className="divide-y rounded-md border text-sm" data-testid="request-candidates">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-secondary"
                      onClick={() => setStudent(c)}
                    >
                      <span>
                        {c.fullName} <span className="text-muted-foreground">{c.phone ?? ""}</span>
                      </span>
                      <span className="tabular-nums">{c.balance}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {student && (
              <p className="text-xs text-muted-foreground">
                {t("coins.report.balance", { count: student.balance })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-product">{tr("product")}</Label>
            <Select value={productId || undefined} onValueChange={setProductId}>
              <SelectTrigger id="request-product" data-testid="request-product">
                <SelectValue placeholder={tr("pickProduct")} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.priceCoins}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unaffordable && (
              <p className="text-xs text-destructive">{t("validation.notEnoughCoins")}</p>
            )}
          </div>
          <CategoryError error={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !student || !productId || unaffordable}>
              {busy ? tc("saving") : tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
