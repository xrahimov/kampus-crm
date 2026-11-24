import { useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useDiscountChange, useGroupDiscounts, type Discount } from "@/api/office-group-money";
import { useMembers } from "@/api/office-groups";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { Problem } from "./group-office";
import { Fact, Facts, typedWhole } from "./group-money-parts";

/** The whole of a group's page keeps a width a line of text is read at on a tablet. */
const COLUMN = { width: "100%", maxWidth: 720, alignSelf: "center" } as const;

/**
 * A group's discounts (A-254), the site's Discounts tab: who pays a lower
 * monthly price, how much lower, for how many months and how many of them are
 * left. Whoever may give discounts gives one here and ends one early; a
 * family's discount is shown and is managed on the student's page.
 */
export function GroupDiscountsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const td = useTranslations("discounts");
  const me = useMe();
  const { colors } = useTheme();
  const money = useMoney();
  const date = useDate();
  const group = useGroup(id);
  const query = useGroupDiscounts(id);
  const change = useDiscountChange(id);
  const canGive = can(me, "discounts.give") && group.data?.status !== "ARCHIVED";
  const [giving, setGiving] = useState(false);
  const [ending, setEnding] = useState<Discount | null>(null);

  const header = (
    <Header back title={t("groups.detail.tabs.discounts")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={[COLUMN, styles.page]} testID="discounts">
        {canGive ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={td("give")}
            onPress={() => {
              change.reset();
              setGiving(true);
            }}
            style={styles.start}
            testID="discount-give"
          />
        ) : null}
        {rows.length === 0 ? (
          <EmptyState title={td("empty")} />
        ) : (
          <Card style={styles.flush}>
            {rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`discount-${row.id}`}>
                  <View style={styles.head}>
                    <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                      {row.studentName}
                    </Text>
                    {row.familyId ? <Badge label={td("family")} testID="discount-family" /> : null}
                  </View>
                  <Facts>
                    <Fact
                      label={td("columns.price")}
                      value={money(row.discountedPrice)}
                      testID="discount-price"
                    />
                    <Fact
                      label={td("columns.amount")}
                      value={`${money(row.amount)} (${row.percent}%)`}
                    />
                    <Fact label={td("columns.months")} value={row.months} />
                    <Fact
                      label={td("columns.remaining")}
                      value={row.remainingMonths}
                      tone={row.remainingMonths > 0 ? "foreground" : "mutedForeground"}
                      testID="discount-left"
                    />
                    <Fact
                      label={td("columns.givenAt")}
                      value={date(dayAsDate(row.givenAt), { dateStyle: "medium" })}
                    />
                    {row.createdByName ? (
                      <Fact label={td("columns.givenBy")} value={row.createdByName} />
                    ) : null}
                  </Facts>
                  {row.comment ? (
                    <Text variant="small" tone="mutedForeground" testID="discount-comment">
                      {row.comment}
                    </Text>
                  ) : null}
                  {canGive && row.remainingMonths > 0 && !row.familyId ? (
                    <Button
                      compact
                      variant="outline"
                      label={t("common.delete")}
                      onPress={() => {
                        change.reset();
                        setEnding(row);
                      }}
                      style={styles.start}
                      testID={`discount-remove-${row.id}`}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>

      <GiveDiscountSheet
        groupId={id}
        coursePrice={group.data?.coursePrice ?? 0}
        open={giving}
        onClose={() => setGiving(false)}
        change={change}
      />
      <Confirm
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={td("deleteTitle")}
        text={td("deleteText", { name: ending?.studentName ?? "" })}
        label={t("common.delete")}
        loading={change.isPending}
        problem={change.error ? errorText(t, change.error) : null}
        onConfirm={() => {
          if (ending) change.mutate({ remove: ending.id }, { onSuccess: () => setEnding(null) });
        }}
        testID="discount-remove"
      />
    </Screen>
  );
}

/** The site's "Give a discount" dialog: who, the lower monthly price, for how many months. */
function GiveDiscountSheet({
  groupId,
  coursePrice,
  open,
  onClose,
  change,
}: {
  groupId: string;
  coursePrice: number;
  open: boolean;
  onClose: () => void;
  change: ReturnType<typeof useDiscountChange>;
}) {
  const t = useTranslations();
  const td = useTranslations("discounts");
  const money = useMoney();
  // The students are asked for when the form is first opened, not with the page.
  const [asked, setAsked] = useState(false);
  const members = useMembers(groupId, false, asked);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [months, setMonths] = useState("1");
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAsked(true);
      setMembershipId(null);
      setPrice("");
      setMonths("1");
      setComment("");
      setMissing(false);
    }
  }
  const eligible = (members.data ?? []).filter(
    (m) => m.status !== "ARCHIVED" && m.status !== "GRADUATED",
  );
  const chosen = eligible.find((m) => m.id === membershipId);
  // A student with a price of their own is discounted from that price, as on the site.
  const base = chosen?.customPrice ?? coursePrice;
  const fieldError = fieldErrorOf(t, change.error);
  const typedPrice = typedWhole(price);
  const typedMonths = typedWhole(months);

  const submit = () => {
    if (!membershipId || typedPrice === null || typedMonths === null) {
      setMissing(true);
      return;
    }
    change.mutate(
      {
        give: {
          membershipId,
          discountedPrice: typedPrice,
          months: typedMonths,
          comment: comment.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("give")}
      testID="discount-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={change.isPending}
          onPress={submit}
          testID="discount-save"
        />
      }
    >
      <View style={styles.form}>
        <Problem error={change.error} />
        {members.error ? (
          <Notice tone="destructive" testID="discount-members-problem">
            {errorText(t, members.error)}
          </Notice>
        ) : null}
        <Select
          label={td("form.student")}
          options={eligible.map((m) => ({ value: m.id, label: m.fullName }))}
          value={membershipId}
          onChange={setMembershipId}
          error={
            fieldError("membershipId") ??
            (missing && !membershipId ? t("validation.studentRequired") : null)
          }
          testID="discount-student"
        />
        <Field
          label={td("form.price")}
          value={price}
          onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
          keyboardType="number-pad"
          hint={td("form.basePrice", { price: money(base) })}
          error={
            fieldError("discountedPrice") ??
            (missing && typedPrice === null ? t("validation.required") : null)
          }
          testID="discount-price-field"
        />
        <Field
          label={td("form.months")}
          value={months}
          onChangeText={(text) => setMonths(text.replace(/\D/g, "").slice(0, 2))}
          keyboardType="number-pad"
          error={
            fieldError("months") ??
            (missing && typedMonths === null ? t("validation.required") : null)
          }
          testID="discount-months"
        />
        <Field
          label={td("form.comment")}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          error={fieldError("comment")}
          testID="discount-comment-field"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space[4] },
  start: { alignSelf: "flex-start" },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
  form: { gap: space[4] },
});
