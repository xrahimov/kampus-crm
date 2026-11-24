import { useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import {
  useGroupPackages,
  usePackageChange,
  useSellPackage,
  type LessonPackage,
} from "@/api/office-group-money";
import { useMembers } from "@/api/office-groups";
import { usePaymentOptions } from "@/api/office-students";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { Problem } from "./group-office";
import { Fact, Facts, typedWhole } from "./group-money-parts";

/** The whole of a group's page keeps a width a line of text is read at on a tablet. */
const COLUMN = { width: "100%", maxWidth: 720, alignSelf: "center" } as const;

/** How many lessons a student has left, as a colour: none, nearly none, enough (the site's rule). */
function leftTone(left: number): Tone {
  if (left <= 0) return "destructive";
  return left <= 2 ? "warning" : "success";
}

/**
 * A group's lesson packages (A-254; the site's Packages tab, A-178), for a
 * group that sells lessons by the package: the packages on offer, how many
 * lessons every student has bought, used and has left, and the packages sold.
 * Whoever may change the group adds, changes and removes offers; whoever
 * takes payments sells a package, which is a payment and the lessons at once.
 */
export function GroupPackagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tp = useTranslations("packages");
  const me = useMe();
  const { colors } = useTheme();
  const money = useMoney();
  const formatDate = useDate();
  const group = useGroup(id);
  const query = useGroupPackages(id);
  const change = usePackageChange(id);
  const archived = group.data?.status === "ARCHIVED";
  const canManage = can(me, "groups.update") && !archived;
  const canSell = can(me, "payments.create") && !archived;
  const [editing, setEditing] = useState<LessonPackage | "new" | null>(null);
  /** A member to sell to, or "any" for the form with nobody chosen. */
  const [selling, setSelling] = useState<string | "any" | null>(null);
  const [removing, setRemoving] = useState<LessonPackage | null>(null);
  const [sold, setSold] = useState(false);

  const header = (
    <Header back title={t("groups.detail.tabs.packages")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const data = query.data;
  const offers = data.packages.filter((p) => p.isActive);
  const date = (iso: string) => formatDate(dayAsDate(iso), { dateStyle: "medium" });
  const sell = (membershipId: string | "any") => {
    setSold(false);
    setSelling(membershipId);
  };

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={[COLUMN, styles.page]} testID="packages">
        {sold ? (
          <Notice tone="success" testID="package-sold">
            {t("common.saved")}
          </Notice>
        ) : null}

        <View style={styles.section}>
          <Text variant="heading">{tp("title")}</Text>
          {canManage || (canSell && offers.length > 0) ? (
            <View style={styles.buttons}>
              {canManage ? (
                <Button
                  compact
                  icon={<Plus size={16} color={colors.primaryForeground} />}
                  label={tp("add")}
                  onPress={() => {
                    change.reset();
                    setEditing("new");
                  }}
                  testID="package-add"
                />
              ) : null}
              {canSell && offers.length > 0 ? (
                <Button
                  compact
                  variant="outline"
                  label={tp("sell")}
                  onPress={() => sell("any")}
                  testID="package-sell"
                />
              ) : null}
            </View>
          ) : null}
          {data.packages.length === 0 ? (
            <EmptyState title={tp("empty")} text={tp("emptyHint")} />
          ) : (
            <Card style={styles.flush}>
              {data.packages.map((p, index) => (
                <View key={p.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`package-${p.id}`}>
                    <View style={styles.head}>
                      <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Badge
                        label={p.isActive ? tp("active") : tp("inactive")}
                        tone={p.isActive ? "success" : "neutral"}
                        testID="package-status"
                      />
                    </View>
                    <Facts>
                      <Fact label={tp("columns.lessons")} value={p.lessons} />
                      <Fact label={tp("columns.price")} value={money(p.price)} />
                      <Fact
                        label={tp("columns.perLesson")}
                        value={money(Math.round(p.price / p.lessons))}
                        testID="package-per-lesson"
                      />
                      <Fact label={tp("columns.sold")} value={p.sold} />
                    </Facts>
                    {canManage ? (
                      <View style={styles.buttons}>
                        <Button
                          compact
                          variant="outline"
                          label={t("common.edit")}
                          onPress={() => {
                            change.reset();
                            setEditing(p);
                          }}
                          testID={`package-edit-${p.id}`}
                        />
                        <Button
                          compact
                          variant="ghost"
                          label={p.sold > 0 ? tp("deactivate") : t("common.delete")}
                          onPress={() => {
                            change.reset();
                            setRemoving(p);
                          }}
                          testID={`package-remove-${p.id}`}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="heading">{tp("credits.title")}</Text>
          {data.credits.length === 0 ? (
            <EmptyState title={tp("credits.empty")} />
          ) : (
            <Card style={styles.flush}>
              {data.credits.map((c, index) => (
                <View key={c.membershipId}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`credits-${c.membershipId}`}>
                    <View style={styles.head}>
                      <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                        {c.studentName}
                      </Text>
                      <Badge
                        label={`${tp("credits.left")}: ${c.left}`}
                        tone={leftTone(c.left)}
                        testID="credits-left"
                      />
                    </View>
                    <Facts>
                      <Fact label={tp("credits.purchased")} value={c.purchased} />
                      <Fact label={tp("credits.used")} value={c.used} />
                      <Fact
                        label={tp("credits.lastPurchase")}
                        value={c.lastPurchaseAt ? date(c.lastPurchaseAt) : "—"}
                      />
                    </Facts>
                    {canSell &&
                    offers.length > 0 &&
                    c.status !== "ARCHIVED" &&
                    c.status !== "GRADUATED" ? (
                      <Button
                        compact
                        variant="outline"
                        label={tp("sell")}
                        onPress={() => sell(c.membershipId)}
                        style={styles.start}
                        testID={`credits-sell-${c.membershipId}`}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        {data.purchases.length > 0 ? (
          <View style={styles.section}>
            <Text variant="heading">{tp("purchases.title")}</Text>
            <Card style={styles.flush}>
              {data.purchases.map((p, index) => (
                <View key={p.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`purchase-${p.id}`}>
                    <View style={styles.head}>
                      <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                        {p.studentName}
                      </Text>
                      <Text variant="small" tone="mutedForeground">
                        {date(p.purchasedAt)}
                      </Text>
                    </View>
                    <Facts>
                      <Fact label={tp("purchases.package")} value={p.name} />
                      <Fact label={tp("purchases.used")} value={`${p.used} / ${p.lessons}`} />
                      <Fact label={tp("purchases.price")} value={money(p.price)} />
                      {p.createdByName ? (
                        <Fact label={tp("purchases.by")} value={p.createdByName} />
                      ) : null}
                    </Facts>
                    {p.note ? (
                      <Text variant="small" tone="mutedForeground">
                        {p.note}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </View>

      <PackageSheet
        pkg={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        change={change}
      />
      <SellSheet
        groupId={id}
        offers={offers}
        membershipId={selling && selling !== "any" ? selling : null}
        open={selling !== null}
        onClose={() => setSelling(null)}
        onSold={() => {
          setSelling(null);
          setSold(true);
        }}
      />
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing && removing.sold > 0 ? tp("deactivateTitle") : tp("deleteTitle")}
        text={
          removing && removing.sold > 0
            ? tp("deactivateText", { name: removing.name })
            : tp("deleteText", { name: removing?.name ?? "" })
        }
        label={removing && removing.sold > 0 ? tp("deactivate") : t("common.delete")}
        loading={change.isPending}
        problem={change.error ? errorText(t, change.error) : null}
        onConfirm={() => {
          if (removing) {
            change.mutate({ remove: removing.id }, { onSuccess: () => setRemoving(null) });
          }
        }}
        testID="package-remove"
      />
    </Screen>
  );
}

/** The site's package dialog: its name, how many lessons it holds, its price, whether it is on sale. */
function PackageSheet({
  pkg,
  open,
  onClose,
  change,
}: {
  /** The package being changed; null adds one. */
  pkg: LessonPackage | null;
  open: boolean;
  onClose: () => void;
  change: ReturnType<typeof usePackageChange>;
}) {
  const t = useTranslations();
  const tp = useTranslations("packages");
  const [name, setName] = useState("");
  const [lessons, setLessons] = useState("8");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(pkg?.name ?? "");
      setLessons(String(pkg?.lessons ?? 8));
      setPrice(pkg ? String(pkg.price) : "");
      setActive(pkg?.isActive ?? true);
      setMissing(false);
    }
  }
  const fieldError = fieldErrorOf(t, change.error);
  const typedLessons = typedWhole(lessons);
  const typedPrice = typedWhole(price);

  const submit = () => {
    if (!name.trim() || typedLessons === null || typedPrice === null) {
      setMissing(true);
      return;
    }
    const input = { name: name.trim(), lessons: typedLessons, price: typedPrice, isActive: active };
    change.mutate(pkg ? { change: pkg.id, input } : { add: input }, { onSuccess: onClose });
  };
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pkg ? tp("edit") : tp("add")}
      testID="package-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={change.isPending}
          onPress={submit}
          testID="package-save"
        />
      }
    >
      <View style={styles.form}>
        <Problem error={change.error} />
        <Field
          label={tp("form.name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? required(!name.trim())}
          testID="package-name"
        />
        <Field
          label={tp("form.lessons")}
          value={lessons}
          onChangeText={(text) => setLessons(text.replace(/\D/g, "").slice(0, 3))}
          keyboardType="number-pad"
          error={fieldError("lessons") ?? required(typedLessons === null)}
          testID="package-lessons"
        />
        <Field
          label={tp("form.price")}
          value={price}
          onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
          keyboardType="number-pad"
          error={fieldError("price") ?? required(typedPrice === null)}
          testID="package-price"
        />
        <Check
          label={tp("form.active")}
          value={active}
          onChange={setActive}
          testID="package-active"
        />
      </View>
    </Sheet>
  );
}

/** The site's "Sell a package" dialog: to whom, which package, how it was paid and on which day. */
function SellSheet({
  groupId,
  offers,
  membershipId: first,
  open,
  onClose,
  onSold,
}: {
  groupId: string;
  /** The packages on sale. */
  offers: LessonPackage[];
  /** The student the form opens on; null opens it with nobody chosen. */
  membershipId: string | null;
  open: boolean;
  onClose: () => void;
  onSold: () => void;
}) {
  const t = useTranslations();
  const tp = useTranslations("packages");
  const money = useMoney();
  const sale = useSellPackage(groupId);
  // The students and the ways to pay are asked for when the form is first opened.
  const [asked, setAsked] = useState(false);
  const members = useMembers(groupId, false, asked);
  const options = usePaymentOptions(asked);
  const methods = options.data?.methods ?? [];
  const [membershipId, setMembershipId] = useState<string | null>(first);
  const [packageId, setPackageId] = useState<string | null>(offers[0]?.id ?? null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState<string | null>(centreToday());
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAsked(true);
      setMembershipId(first);
      setPackageId(offers[0]?.id ?? null);
      setMethodId(null);
      setPaidAt(centreToday());
      setComment("");
      setMissing(false);
      sale.reset();
    }
  }
  const eligible = (members.data ?? []).filter(
    (m) => m.status !== "ARCHIVED" && m.status !== "GRADUATED",
  );
  const chosen = offers.find((p) => p.id === packageId);
  // The first way to pay stands chosen until another is, as on the site.
  const method = methodId ?? methods[0]?.id ?? null;
  const fieldError = fieldErrorOf(t, sale.error);
  const loadProblem = members.error ?? options.error;

  const submit = () => {
    if (!membershipId || !packageId || !method || !paidAt) {
      setMissing(true);
      return;
    }
    sale.mutate(
      {
        membershipId,
        packageId,
        paymentMethodId: method,
        paidAt,
        comment: comment.trim() || null,
      },
      { onSuccess: onSold },
    );
  };
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tp("sell")}
      testID="sell-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={sale.isPending}
          onPress={submit}
          testID="sell-save"
        />
      }
    >
      <View style={styles.form}>
        <Problem error={sale.error} />
        {loadProblem ? (
          <Notice tone="destructive" testID="sell-load-problem">
            {errorText(t, loadProblem)}
          </Notice>
        ) : null}
        <Select
          label={tp("sellForm.student")}
          options={eligible.map((m) => ({ value: m.id, label: m.fullName }))}
          value={membershipId}
          onChange={setMembershipId}
          error={
            fieldError("membershipId") ??
            (missing && !membershipId ? t("validation.studentRequired") : null)
          }
          testID="sell-student"
        />
        <View style={styles.tight}>
          <Select
            label={tp("sellForm.package")}
            options={offers.map((p) => ({
              value: p.id,
              label: tp("sellForm.packageOption", {
                name: p.name,
                lessons: p.lessons,
                price: money(p.price),
              }),
            }))}
            value={packageId}
            onChange={setPackageId}
            error={fieldError("packageId") ?? required(!packageId)}
            testID="sell-package"
          />
          {chosen ? (
            <Text variant="small" tone="mutedForeground" testID="sell-summary">
              {tp("sellForm.summary", { lessons: chosen.lessons, price: money(chosen.price) })}
            </Text>
          ) : null}
        </View>
        <Select
          label={tp("sellForm.method")}
          options={methods.map((m) => ({ value: m.id, label: m.name }))}
          value={method}
          onChange={setMethodId}
          error={fieldError("paymentMethodId") ?? required(!method)}
          testID="sell-method"
        />
        <DateField
          label={tp("sellForm.paidAt")}
          value={paidAt}
          onChange={setPaidAt}
          error={fieldError("paidAt") ?? required(!paidAt)}
          testID="sell-date"
        />
        <Field
          label={tp("sellForm.comment")}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          error={fieldError("comment")}
          testID="sell-comment"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space[6] },
  section: { gap: space[3] },
  start: { alignSelf: "flex-start" },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
  form: { gap: space[4] },
  tight: { gap: space[1] },
});
