import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  CATEGORY_ENTRY_TYPES,
  STAFF_ENTRY_TYPES,
  useDeleteEntry,
  useFinanceEntries,
  useFinanceOptions,
  type FinanceEntry,
  type FinanceEntryType,
} from "@/api/office-finance";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Header } from "@/components/header";
import { ActionRow } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { EntrySheet } from "./entry-sheet";
import { centreMonth, PeriodSelects } from "./period";

/**
 * The entries of one kind (A-237): the site's pages under Finance for
 * advances, marketing, bonuses, fines and investments, and for one expense or
 * income category. The period's sum on top, the site's filters, a card per
 * entry, and the entry sheet to add or change one.
 */
export function EntriesScreen({
  type,
  category,
}: {
  type: FinanceEntryType;
  /** The category whose entries these are; null for the kinds that have none. */
  category: { id: string; name: string } | null;
}) {
  const t = useTranslations();
  const tf = useTranslations("finance");
  const me = useMe();
  const money = useMoney();
  const date = useDate();
  const { wide } = useLayout();
  const now = centreMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState<number | null>(null);
  const [paymentMethodId, setMethod] = useState<string | null>(null);
  const [staffId, setStaff] = useState<string | null>(null);
  const [picked, setPicked] = useState<FinanceEntry | null>(null);
  const [doing, setDoing] = useState<"menu" | "form" | "delete" | null>(null);
  const staffOnly = STAFF_ENTRY_TYPES.includes(type);
  const inCategory = CATEGORY_ENTRY_TYPES.includes(type);
  const showMethod = type !== "INVESTMENT";
  const showStaff = staffOnly || inCategory;
  const list = useFinanceEntries({
    type,
    categoryId: category?.id ?? null,
    year,
    month,
    branchId: null,
    paymentMethodId: showMethod ? paymentMethodId : null,
    staffId: showStaff ? staffId : null,
  });
  const options = useFinanceOptions();
  const remove = useDeleteEntry();
  const mayAdd = can(me, "finance.create");
  const mayChange = can(me, "finance.update");
  const mayDelete = can(me, "finance.delete");
  const title =
    category?.name ?? tf(`sections.${type === "EXPENSE" ? "expense" : type.toLowerCase()}`);

  const header = (
    <Header
      back
      title={title}
      right={
        mayAdd && options.data ? (
          <Button
            compact
            label={tf(`add.${type}`)}
            onPress={() => {
              setPicked(null);
              setDoing("form");
            }}
            testID="entries-add"
          />
        ) : undefined
      }
    />
  );
  if (!list.data) return <PendingScreen header={header} query={list} />;
  const cell = wide ? styles.quarter : styles.half;

  return (
    <Screen header={header} onRefresh={() => void list.refetch()} refreshing={list.isRefetching}>
      <View style={styles.between}>
        <Text tone="mutedForeground">{tf("payroll.total")}</Text>
        <Badge tone="accent" label={money(list.data.total)} testID="entries-total" />
      </View>
      <View style={styles.filters}>
        <PeriodSelects
          year={year}
          month={month}
          onYear={setYear}
          onMonth={setMonth}
          cell={cell}
          testID="entries"
        />
        {showMethod ? (
          <View style={cell}>
            <Select
              compact
              label={tf("filters.method")}
              value={paymentMethodId}
              onChange={setMethod}
              clearLabel={tf("filters.anyMethod")}
              placeholder={tf("filters.anyMethod")}
              options={(options.data?.paymentMethods ?? []).map((m) => ({
                value: m.id,
                label: m.name,
              }))}
              testID="entries-method"
            />
          </View>
        ) : null}
        {showStaff ? (
          <View style={cell}>
            <Select
              compact
              label={tf("form.staff")}
              value={staffId}
              onChange={setStaff}
              clearLabel={tf("filters.anyStaff")}
              placeholder={tf("filters.anyStaff")}
              options={(options.data?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
              testID="entries-staff"
            />
          </View>
        ) : null}
      </View>
      {options.error ? <Notice tone="destructive">{errorText(t, options.error)}</Notice> : null}
      {list.data.items.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View style={styles.cards} testID="entries-list">
          {list.data.items.map((entry) => {
            const who =
              type === "INVESTMENT" ? entry.counterparty : (entry.staffName ?? entry.studentName);
            return (
              <View key={entry.id} style={wide ? styles.cell : styles.full}>
                <Card
                  onPress={
                    mayChange || mayDelete
                      ? () => {
                          setPicked(entry);
                          setDoing("menu");
                        }
                      : undefined
                  }
                  style={styles.card}
                  testID={`entry-${entry.id}`}
                >
                  <View style={styles.between}>
                    <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
                      {who ?? "—"}
                    </Text>
                    <Text variant="figure" testID={`entry-${entry.id}-amount`}>
                      {money(entry.amount)}
                    </Text>
                  </View>
                  <Text variant="small" tone="mutedForeground">
                    {[
                      date(dayAsDate(entry.date), { dateStyle: "medium" }),
                      showMethod ? entry.paymentMethodName : null,
                      me.branches.length > 1 ? entry.branchName : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                  {entry.comment ? <Text>{entry.comment}</Text> : null}
                  {inCategory && entry.createdByName ? (
                    <Text variant="small" tone="mutedForeground">
                      {tf("columns.createdBy")}: {entry.createdByName}
                    </Text>
                  ) : null}
                </Card>
              </View>
            );
          })}
        </View>
      )}

      <Sheet
        open={doing === "menu"}
        onClose={() => setDoing(null)}
        title={picked ? money(picked.amount) : ""}
        testID="entry-menu"
      >
        <View>
          {mayChange && options.data ? (
            <ActionRow
              icon={Pencil}
              label={t("common.edit")}
              onPress={() => setDoing("form")}
              testID="entry-do-edit"
            />
          ) : null}
          {mayChange && options.data && mayDelete ? <Divider /> : null}
          {mayDelete ? (
            <ActionRow
              icon={Trash2}
              destructive
              label={t("common.delete")}
              onPress={() => {
                remove.reset();
                setDoing("delete");
              }}
              testID="entry-do-delete"
            />
          ) : null}
        </View>
      </Sheet>
      {options.data ? (
        <EntrySheet
          open={doing === "form"}
          onClose={() => setDoing(null)}
          type={type}
          categoryId={category?.id ?? null}
          entry={picked}
          options={options.data}
        />
      ) : null}
      <Confirm
        open={doing === "delete"}
        onClose={() => setDoing(null)}
        title={tf("deleteTitle")}
        text={tf("deleteText", { amount: picked ? money(picked.amount) : "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (picked) remove.mutate(picked.id, { onSuccess: () => setDoing(null) });
        }}
        testID="entry-delete"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "center", gap: space[2] },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  cards: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[1] },
});
