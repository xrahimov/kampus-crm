import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  COIN_PERIODS,
  COINS_TABS,
  PURCHASE_STATUSES,
  useCoinReportOptions,
  useCoinsReport,
  useDecidePurchase,
  useDeleteProduct,
  useProductCategories,
  useProducts,
  usePurchaseRequests,
  type CoinPeriod,
  type CoinRatingRow,
  type CoinsTab,
  type Product,
  type PurchaseRequest,
  type PurchaseStatus,
} from "@/api/office-coins";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { ActionRow } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Loading,
  Notice,
  Screen,
  Segmented,
} from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import {
  CategoriesSheet,
  CoinHistorySheet,
  ProductPicture,
  ProductSheet,
  PurchaseRequestSheet,
} from "./coins-sheets";
import { Filters, Kpis, OptionFilter, Rows, Stats, Tabs } from "./parts";

const STATUS_TONE = { PENDING: "neutral", APPROVED: "success", REJECTED: "destructive" } as const;

/**
 * Reports, Coins (A-239): the key figures and the site's three tabs. The
 * rating of students by coins with each one's history, the marketplace
 * (products and their categories) and the purchase requests, which someone
 * who manages coins approves or rejects.
 */
export function CoinsReportScreen() {
  const t = useTranslations();
  const tr = useTranslations("coins.report");
  const me = useMe();
  const [tab, setTab] = useState<CoinsTab>("rating");
  const [typed, setTyped] = useState("");
  const [branchId, setBranch] = useState<string | null>(null);
  const [courseId, setCourse] = useState<string | null>(null);
  const [groupId, setGroup] = useState<string | null>(null);
  const [period, setPeriod] = useState<CoinPeriod>("ALL");
  const [viewing, setViewing] = useState<CoinRatingRow | null>(null);
  const q = useRested(typed.trim());
  const query = useCoinsReport({ q, branchId, courseId, groupId, period });
  const options = useCoinReportOptions();
  const mayManage = can(me, "coins.manage");

  const header = <Header back title={tr("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;
  const courses = (options.data?.courses ?? []).filter((c) => !branchId || c.branchId === branchId);
  const groups = (options.data?.groups ?? []).filter(
    (g) => (!branchId || g.branchId === branchId) && (!courseId || g.courseId === courseId),
  );

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Kpis
        items={[
          { key: "totalGiven", label: tr("kpis.totalGiven"), value: String(k.totalGiven) },
          { key: "totalSpent", label: tr("kpis.totalSpent"), value: String(k.totalSpent) },
          { key: "purchases", label: tr("kpis.purchases"), value: String(k.purchases) },
          {
            key: "activeStudents",
            label: tr("kpis.activeStudents"),
            value: String(k.activeStudents),
          },
        ]}
      />
      <Tabs
        options={COINS_TABS.map((value) => ({ value, label: tr(`tabs.${value}`) }))}
        value={tab}
        onChange={setTab}
        testID="coins-tab"
      />

      {tab === "rating" ? (
        <>
          <Field
            label={t("reports.filters.search")}
            value={typed}
            onChangeText={setTyped}
            placeholder={t("reports.filters.searchStudent")}
            autoCorrect={false}
            testID="coins-search"
          />
          <Filters testID="coins-filters">
            {(options.data?.branches.length ?? 0) > 1 ? (
              <OptionFilter
                label={tr("filters.branch")}
                value={branchId}
                onChange={(value) => {
                  setBranch(value);
                  setGroup(null);
                }}
                allLabel={tr("filters.anyBranch")}
                options={(options.data?.branches ?? []).map((b) => ({
                  value: b.id,
                  label: b.name,
                }))}
                testID="coins-branch"
              />
            ) : null}
            <OptionFilter
              label={tr("filters.course")}
              value={courseId}
              onChange={(value) => {
                setCourse(value);
                setGroup(null);
              }}
              allLabel={tr("filters.anyCourse")}
              options={courses.map((c) => ({ value: c.id, label: c.name }))}
              testID="coins-course"
            />
            <OptionFilter
              label={tr("filters.group")}
              value={groupId}
              onChange={setGroup}
              allLabel={tr("filters.anyGroup")}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              testID="coins-group"
            />
          </Filters>
          <Segmented
            options={COIN_PERIODS.map((value) => ({ value, label: tr(`periods.${value}`) }))}
            value={period}
            onChange={setPeriod}
            testID="coins-period"
          />
          {options.error ? <Notice tone="destructive">{errorText(t, options.error)}</Notice> : null}
          {report.rating.length === 0 ? (
            <EmptyState title={t("common.nothingFound")} />
          ) : (
            <Rows testID="coins-rating">
              {report.rating.map((row) => (
                <RatingCard key={row.studentId} row={row} onPress={() => setViewing(row)} />
              ))}
            </Rows>
          )}
        </>
      ) : tab === "marketplace" ? (
        <Marketplace mayManage={mayManage} />
      ) : (
        <Requests mayManage={mayManage} />
      )}

      <CoinHistorySheet student={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}

function RatingCard({ row, onPress }: { row: CoinRatingRow; onPress: () => void }) {
  const tc = useTranslations("coins.report.columns");
  const date = useDate();
  return (
    <Card onPress={onPress} style={styles.card} testID={`coins-student-${row.studentId}`}>
      <View style={styles.between}>
        <Badge tone={row.rank <= 3 ? "accent" : "neutral"} label={`#${row.rank}`} />
        <View style={styles.fill}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {row.fullName}
          </Text>
          <Text variant="small" tone="mutedForeground">
            {[
              row.branchName,
              row.lastActivity
                ? `${tc("lastActivity")}: ${date(new Date(row.lastActivity), { dateStyle: "medium" })}`
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </View>
      </View>
      <Stats
        items={[
          { label: tc("balance"), value: String(row.balance) },
          { label: tc("earned"), value: String(row.earned) },
          { label: tc("spent"), value: String(row.spent) },
        ]}
      />
    </Card>
  );
}

/** The products coins buy. Someone who manages coins adds, changes and removes them. */
function Marketplace({ mayManage }: { mayManage: boolean }) {
  const t = useTranslations();
  const tm = useTranslations("coins.marketplace");
  const { colors } = useTheme();
  const products = useProducts(true);
  const categories = useProductCategories(true);
  const remove = useDeleteProduct();
  const [picked, setPicked] = useState<Product | null>(null);
  const [doing, setDoing] = useState<"menu" | "form" | "delete" | "categories" | null>(null);
  const problem = products.error ?? categories.error;
  if (problem) return <Notice tone="destructive">{errorText(t, problem)}</Notice>;
  if (!products.data || !categories.data) return <Loading />;
  return (
    <>
      {mayManage ? (
        <View style={styles.actions}>
          <Button
            compact
            variant="outline"
            label={tm("categories")}
            onPress={() => setDoing("categories")}
            testID="coins-categories"
          />
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={tm("addProduct")}
            onPress={() => {
              setPicked(null);
              setDoing("form");
            }}
            testID="coins-add-product"
          />
        </View>
      ) : null}
      {products.data.length === 0 ? (
        <EmptyState title={tm("empty")} />
      ) : (
        <Rows testID="coins-products">
          {products.data.map((product) => (
            <Card
              key={product.id}
              onPress={
                mayManage
                  ? () => {
                      setPicked(product);
                      setDoing("menu");
                    }
                  : undefined
              }
              style={styles.card}
              testID={`coins-product-${product.id}`}
            >
              <View style={styles.between}>
                <ProductPicture url={product.imageUrl} />
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {product.categoryName}
                  </Text>
                </View>
                <Badge
                  tone={product.isActive ? "success" : "neutral"}
                  label={t(product.isActive ? "common.active" : "common.inactive")}
                />
              </View>
              <Stats
                items={[
                  { label: tm("columns.price"), value: String(product.priceCoins) },
                  { label: tm("columns.purchased"), value: String(product.purchasedCount) },
                  {
                    label: tm("columns.stock"),
                    value: String(product.stock),
                    tone: product.stock === 0 ? "destructive" : "foreground",
                  },
                ]}
              />
            </Card>
          ))}
        </Rows>
      )}

      <Sheet
        open={doing === "menu"}
        onClose={() => setDoing(null)}
        title={picked?.name ?? ""}
        testID="product-menu"
      >
        <View>
          <ActionRow
            icon={Pencil}
            label={t("common.edit")}
            onPress={() => setDoing("form")}
            testID="product-do-edit"
          />
          <Divider />
          <ActionRow
            icon={Trash2}
            destructive
            label={t("common.delete")}
            onPress={() => {
              remove.reset();
              setDoing("delete");
            }}
            testID="product-do-delete"
          />
        </View>
      </Sheet>
      <ProductSheet
        open={doing === "form"}
        onClose={() => setDoing(null)}
        product={picked}
        categories={categories.data}
      />
      <CategoriesSheet
        open={doing === "categories"}
        onClose={() => setDoing(null)}
        categories={categories.data}
      />
      <Confirm
        open={doing === "delete"}
        onClose={() => setDoing(null)}
        title={tm("deleteTitle")}
        text={tm("deleteText", { name: picked?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (picked) remove.mutate(picked.id, { onSuccess: () => setDoing(null) });
        }}
        testID="product-delete"
      />
    </>
  );
}

/** What students asked to buy for their coins, newest first. */
function Requests({ mayManage }: { mayManage: boolean }) {
  const t = useTranslations();
  const tq = useTranslations("coins.requests");
  const date = useDate();
  const { colors } = useTheme();
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const requests = usePurchaseRequests(status, true);
  const products = useProducts(mayManage);
  const decide = useDecidePurchase();
  if (requests.error) return <Notice tone="destructive">{errorText(t, requests.error)}</Notice>;
  if (!requests.data) return <Loading />;
  // Approving can be refused for a reason of its own: no coins left, nothing in stock.
  const refused = fieldErrorOf(t, decide.error);
  const problem = decide.error
    ? (refused("studentId") ?? refused("productId") ?? errorText(t, decide.error))
    : null;
  return (
    <>
      <View style={styles.requestBar}>
        <View style={styles.fill}>
          <Select<PurchaseStatus>
            compact
            label={tq("filters.status")}
            value={status}
            onChange={setStatus}
            clearLabel={tq("filters.anyStatus")}
            emptyLabel={tq("filters.anyStatus")}
            options={PURCHASE_STATUSES.map((value) => ({ value, label: tq(`statuses.${value}`) }))}
            testID="coins-request-status"
          />
        </View>
        {mayManage ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={tq("add")}
            onPress={() => setAdding(true)}
            disabled={!products.data}
            testID="coins-add-request"
          />
        ) : null}
      </View>
      {problem ? (
        <Notice tone="destructive" testID="coins-request-problem">
          {problem}
        </Notice>
      ) : null}
      {requests.data.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <Rows testID="coins-requests">
          {requests.data.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              when={date(new Date(request.createdAt), { dateStyle: "medium" })}
              busy={decide.isPending && decide.variables?.id === request.id}
              onDecide={
                mayManage && request.status === "PENDING"
                  ? (answer) => decide.mutate({ id: request.id, status: answer })
                  : undefined
              }
            />
          ))}
        </Rows>
      )}
      <PurchaseRequestSheet
        open={adding}
        onClose={() => setAdding(false)}
        products={(products.data ?? []).filter((p) => p.isActive && p.stock > 0)}
      />
    </>
  );
}

function RequestCard({
  request,
  when,
  busy,
  onDecide,
}: {
  request: PurchaseRequest;
  when: string;
  busy: boolean;
  onDecide?: (answer: "APPROVED" | "REJECTED") => void;
}) {
  const tq = useTranslations("coins.requests");
  return (
    <Card style={styles.card} testID={`coins-request-${request.id}`}>
      <View style={styles.between}>
        <View style={styles.fill}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {request.studentName}
          </Text>
          <Text numberOfLines={2}>{request.productName}</Text>
        </View>
        <Badge
          tone={STATUS_TONE[request.status]}
          label={tq(`statuses.${request.status}`)}
          testID={`coins-request-${request.id}-status`}
        />
      </View>
      <Text variant="small" tone="mutedForeground">
        {[`${tq("columns.coins")}: ${request.coins}`, when, request.decidedByName]
          .filter(Boolean)
          .join(", ")}
      </Text>
      {onDecide ? (
        <View style={styles.decide}>
          <View style={styles.fill}>
            <Button
              compact
              label={tq("approve")}
              loading={busy}
              onPress={() => onDecide("APPROVED")}
              testID={`coins-request-${request.id}-approve`}
            />
          </View>
          <View style={styles.fill}>
            <Button
              compact
              variant="outline"
              label={tq("reject")}
              disabled={busy}
              onPress={() => onDecide("REJECTED")}
              testID={`coins-request-${request.id}-reject`}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  card: { flex: 1, gap: space[2] },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: space[2] },
  requestBar: { flexDirection: "row", alignItems: "center", gap: space[2] },
  decide: { flexDirection: "row", gap: space[2] },
});
