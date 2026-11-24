import { Plus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  ROUNDING_TYPES,
  useBranchRows,
  useBranchStep,
  useGradingSystems,
  useGradingSystemStep,
  usePaymentMethodRows,
  usePaymentMethodStep,
  type BranchRow,
  type GradingSystem,
  type PaymentMethodRow,
  type Rounding,
} from "@/api/office-general-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Loading, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { Bin, RowPress } from "./parts";

/** A card of General settings that is a list: its title, what it is for, "New …" and the rows. */
function ListCard({
  title,
  description,
  addLabel,
  onAdd,
  query,
  empty,
  children,
  testID,
}: {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  query: { data: unknown[] | undefined; error: unknown };
  empty: string;
  children: ReactNode;
  testID: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  return (
    <Card testID={testID}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading">{title}</Text>
          <Text variant="small" tone="mutedForeground">
            {description}
          </Text>
        </View>
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={addLabel}
          onPress={onAdd}
          testID={`${testID}-add`}
        />
      </View>
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {query.data && query.data.length === 0 ? <Text tone="mutedForeground">{empty}</Text> : null}
      {query.data && query.data.length > 0 ? <View style={styles.list}>{children}</View> : null}
    </Card>
  );
}

/** The form of one row of a list card: Save, and for an existing row the way to remove it. */
function FormSheet({
  open,
  onClose,
  title,
  saving,
  problem,
  onSave,
  remove,
  children,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  saving: boolean;
  problem: string | null;
  onSave: () => void;
  remove?: { label: string; onPress: () => void };
  children: ReactNode;
  testID: string;
}) {
  const t = useTranslations();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID={`${testID}-form`}
      footer={
        <View style={styles.footer}>
          <Button
            label={t("common.save")}
            loading={saving}
            onPress={onSave}
            testID={`${testID}-save`}
          />
          {remove ? (
            <Button
              variant="ghost"
              label={remove.label}
              onPress={remove.onPress}
              testID={`${testID}-delete`}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.form}>
        {problem ? (
          <Notice tone="destructive" testID={`${testID}-problem`}>
            {problem}
          </Notice>
        ) : null}
        {children}
      </View>
    </Sheet>
  );
}

/** Which row a list card's form shows: one to change, a new one, or none. */
function useRowForm<T>() {
  const [form, setForm] = useState<T | "new" | null>(null);
  const [shown, setShown] = useState<T | "new">("new");
  return {
    open: form !== null,
    row: shown === "new" ? undefined : shown,
    show: (next: T | "new") => {
      setShown(next);
      setForm(next);
    },
    close: () => setForm(null),
  };
}

/**
 * Branches (A-243). Every course, room and group belongs to one; a branch is
 * never deleted, only switched off, and then leaves every list of choices.
 */
export function BranchesCard() {
  const t = useTranslations();
  const tr = useTranslations("settings.branches");
  const query = useBranchRows();
  const form = useRowForm<BranchRow>();
  return (
    <ListCard
      title={tr("title")}
      description={tr("description")}
      addLabel={tr("add")}
      onAdd={() => form.show("new")}
      query={query}
      empty={t("common.nothingFound")}
      testID="branches"
    >
      {(query.data ?? []).map((branch, index) => (
        <View key={branch.id}>
          {index > 0 ? <Divider /> : null}
          <RowPress onPress={() => form.show(branch)} testID={`branch-${branch.id}`}>
            <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
              {branch.name}
            </Text>
            <Badge
              tone={branch.isActive ? "success" : "neutral"}
              label={t(branch.isActive ? "common.active" : "common.inactive")}
            />
          </RowPress>
        </View>
      ))}
      <BranchSheet
        key={form.row?.id ?? "new"}
        open={form.open}
        onClose={form.close}
        branch={form.row}
      />
    </ListCard>
  );
}

function BranchSheet({
  open,
  onClose,
  branch,
}: {
  open: boolean;
  onClose: () => void;
  branch?: BranchRow;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.branches");
  const save = useBranchStep();
  const remove = useBranchStep();
  const [name, setName] = useState(branch?.name ?? "");
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [missing, setMissing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(branch?.name ?? "");
      setIsActive(branch?.isActive ?? true);
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const submit = () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    save.mutate(
      { id: branch?.id ?? null, input: { name: name.trim(), isActive } },
      { onSuccess: onClose },
    );
  };
  return (
    <>
      <FormSheet
        open={open && !asking}
        onClose={onClose}
        title={branch ? tr("edit") : tr("add")}
        saving={save.isPending}
        problem={
          save.error && !(hasFieldErrors(save.error) && fieldError("name"))
            ? errorText(t, save.error)
            : null
        }
        onSave={submit}
        remove={
          branch?.isActive ? { label: tr("deactivate"), onPress: () => setAsking(true) } : undefined
        }
        testID="branch"
      >
        <Field
          label={tr("name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)}
          testID="branch-name"
        />
        <Check
          label={t("common.active")}
          value={isActive}
          onChange={setIsActive}
          testID="branch-active"
        />
      </FormSheet>
      <Confirm
        open={open && asking}
        onClose={() => setAsking(false)}
        title={tr("deactivateTitle")}
        text={tr("deactivateText", { name: branch?.name ?? "" })}
        label={tr("deactivate")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!branch) return;
          remove.mutate(
            { id: branch.id, input: null },
            {
              onSuccess: () => {
                setAsking(false);
                onClose();
              },
            },
          );
        }}
        testID="branch-deactivate"
      />
    </>
  );
}

/** Payment methods (A-243): what a payment can be recorded as, in the centre's order. */
export function PaymentMethodsCard() {
  const t = useTranslations();
  const tr = useTranslations("settings.paymentMethods");
  const query = usePaymentMethodRows();
  const form = useRowForm<PaymentMethodRow>();
  return (
    <ListCard
      title={tr("title")}
      description={tr("description")}
      addLabel={tr("add")}
      onAdd={() => form.show("new")}
      query={query}
      empty={t("common.nothingFound")}
      testID="methods"
    >
      {(query.data ?? []).map((method, index) => (
        <View key={method.id}>
          {index > 0 ? <Divider /> : null}
          <RowPress onPress={() => form.show(method)} testID={`method-${method.id}`}>
            <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
              {method.name}
            </Text>
            {method.isCash ? (
              <Badge label={tr("cash")} testID={`method-cash-${method.id}`} />
            ) : null}
            <Badge
              tone={method.isActive ? "success" : "neutral"}
              label={t(method.isActive ? "common.active" : "common.inactive")}
            />
          </RowPress>
        </View>
      ))}
      <MethodSheet
        key={form.row?.id ?? "new"}
        open={form.open}
        onClose={form.close}
        method={form.row}
      />
    </ListCard>
  );
}

function MethodSheet({
  open,
  onClose,
  method,
}: {
  open: boolean;
  onClose: () => void;
  method?: PaymentMethodRow;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.paymentMethods");
  const save = usePaymentMethodStep();
  const remove = usePaymentMethodStep();
  const [name, setName] = useState(method?.name ?? "");
  const [order, setOrder] = useState(String(method?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [isCash, setIsCash] = useState(method?.isCash ?? false);
  const [missing, setMissing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(method?.name ?? "");
      setOrder(String(method?.sortOrder ?? 0));
      setIsActive(method?.isActive ?? true);
      setIsCash(method?.isCash ?? false);
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  // An empty field is the first place, as on the site.
  const place = order.trim() === "" ? 0 : /^\d{1,4}$/.test(order.trim()) ? Number(order) : null;
  const placeWrong = place === null || place > 1000;
  const submit = () => {
    if (!name.trim() || placeWrong) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        id: method?.id ?? null,
        input: { name: name.trim(), isActive, isCash, sortOrder: place ?? 0 },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <>
      <FormSheet
        open={open && !asking}
        onClose={onClose}
        title={method ? tr("edit") : tr("add")}
        saving={save.isPending}
        problem={
          save.error &&
          !(hasFieldErrors(save.error) && (fieldError("name") || fieldError("sortOrder")))
            ? errorText(t, save.error)
            : null
        }
        onSave={submit}
        remove={method ? { label: t("common.delete"), onPress: () => setAsking(true) } : undefined}
        testID="method"
      >
        <Field
          label={tr("name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)}
          testID="method-name"
        />
        <Field
          label={tr("sortOrder")}
          value={order}
          onChangeText={setOrder}
          keyboardType="number-pad"
          maxLength={4}
          error={fieldError("sortOrder") ?? (missing && placeWrong ? t("validation.max") : null)}
          testID="method-order"
        />
        <Check
          label={t("common.active")}
          value={isActive}
          onChange={setIsActive}
          testID="method-active"
        />
        <Check label={tr("isCash")} value={isCash} onChange={setIsCash} testID="method-cash" />
      </FormSheet>
      <Confirm
        open={open && asking}
        onClose={() => setAsking(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", { name: method?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!method) return;
          remove.mutate(
            { id: method.id, input: null },
            {
              onSuccess: () => {
                setAsking(false);
                onClose();
              },
            },
          );
        }}
        testID="method-delete-confirm"
      />
    </>
  );
}

/** Grading systems (A-243): the scales courses and groups grade against, each a list of levels. */
export function GradingSystemsCard() {
  const t = useTranslations();
  const tr = useTranslations("settings.gradingSystems");
  const query = useGradingSystems();
  const form = useRowForm<GradingSystem>();
  return (
    <ListCard
      title={tr("title")}
      description={tr("description")}
      addLabel={tr("add")}
      onAdd={() => form.show("new")}
      query={query}
      empty={t("common.nothingFound")}
      testID="grading"
    >
      {(query.data ?? []).map((system, index) => (
        <View key={system.id}>
          {index > 0 ? <Divider /> : null}
          <RowPress onPress={() => form.show(system)} testID={`grading-${system.id}`}>
            <View style={styles.fill}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {system.name}
              </Text>
              <Text variant="small" tone="mutedForeground">
                {tr("levelsCount")}: {system.levels.length}, {tr("coursesCount")}:{" "}
                {system.coursesCount}
              </Text>
            </View>
            <Badge label={tr(`roundingTypes.${system.rounding}`)} />
          </RowPress>
        </View>
      ))}
      <GradingSheet
        key={form.row?.id ?? "new"}
        open={form.open}
        onClose={form.close}
        system={form.row}
      />
    </ListCard>
  );
}

interface LevelDraft {
  /** Stays with the row while rows above it come and go. */
  key: number;
  name: string;
  minScore: string;
  maxScore: string;
}

/** A score from 0 to 1000 as typed, a comma or a point for the fraction; null for anything else. */
export function typedScore(typed: string): number | null {
  const value = typed.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) return null;
  const score = Number(value);
  return score <= 1000 ? score : null;
}

let nextLevelKey = 1;
const levelDraft = (name: string, minScore: number, maxScore: number): LevelDraft => ({
  key: nextLevelKey++,
  name,
  minScore: String(minScore),
  maxScore: String(maxScore),
});
const levelsOf = (system?: GradingSystem): LevelDraft[] =>
  system
    ? system.levels.map((level) => levelDraft(level.name, level.minScore, level.maxScore))
    : [levelDraft("", 0, 100)];

function GradingSheet({
  open,
  onClose,
  system,
}: {
  open: boolean;
  onClose: () => void;
  system?: GradingSystem;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.gradingSystems");
  const save = useGradingSystemStep();
  const remove = useGradingSystemStep();
  const [name, setName] = useState(system?.name ?? "");
  const [rounding, setRounding] = useState<Rounding>(system?.rounding ?? "STANDARD");
  const [levels, setLevels] = useState<LevelDraft[]>(() => levelsOf(system));
  const [missing, setMissing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(system?.name ?? "");
      setRounding(system?.rounding ?? "STANDARD");
      setLevels(levelsOf(system));
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const change = (key: number, patch: Partial<LevelDraft>) =>
    setLevels((now) => now.map((level) => (level.key === key ? { ...level, ...patch } : level)));
  /** What is wrong with a level, or null. */
  const wrong = (level: LevelDraft): string | null => {
    const from = typedScore(level.minScore);
    const to = typedScore(level.maxScore);
    if (!level.name.trim() || level.minScore.trim() === "" || level.maxScore.trim() === "") {
      return t("validation.required");
    }
    if (from === null || to === null) return t("validation.max");
    return from > to ? t("validation.levelRange") : null;
  };

  /** What the server said about a level, by its place in the list. */
  const refused = (index: number): string | null =>
    fieldError(`levels.${index}.name`) ??
    fieldError(`levels.${index}.minScore`) ??
    fieldError(`levels.${index}.maxScore`);
  const shownRefusal =
    fieldError("name") !== null ||
    fieldError("levels") !== null ||
    levels.some((_, index) => refused(index) !== null);

  const submit = () => {
    if (!name.trim() || levels.some((level) => wrong(level) !== null)) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        id: system?.id ?? null,
        input: {
          name: name.trim(),
          rounding,
          levels: levels.map((level) => ({
            name: level.name.trim(),
            minScore: typedScore(level.minScore) ?? 0,
            maxScore: typedScore(level.maxScore) ?? 0,
          })),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <FormSheet
        open={open && !asking}
        onClose={onClose}
        title={system ? tr("edit") : tr("add")}
        saving={save.isPending}
        problem={
          save.error && !(hasFieldErrors(save.error) && shownRefusal)
            ? errorText(t, save.error)
            : null
        }
        onSave={submit}
        remove={system ? { label: t("common.delete"), onPress: () => setAsking(true) } : undefined}
        testID="grading"
      >
        <Field
          label={tr("name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)}
          testID="grading-name"
        />
        <View style={styles.tight}>
          <Text variant="smallStrong">{tr("rounding")}</Text>
          <Segmented
            options={ROUNDING_TYPES.map((type) => ({
              value: type,
              label: tr(`roundingTypes.${type}`),
            }))}
            value={rounding}
            onChange={setRounding}
            testID="grading-rounding"
          />
        </View>
        <View style={styles.tight}>
          <Text variant="smallStrong">{tr("levels")}</Text>
          <Text variant="small" tone="mutedForeground">
            {tr("formHint")}
          </Text>
          {fieldError("levels") ? (
            <Text variant="small" tone="destructive" testID="grading-levels-problem">
              {fieldError("levels")}
            </Text>
          ) : null}
        </View>
        {levels.map((level, index) => {
          const problem = (missing ? wrong(level) : null) ?? refused(index);
          return (
            <View key={level.key} style={styles.tight} testID={`grading-level-${index}`}>
              <View style={styles.level}>
                <View style={styles.levelName}>
                  <Field
                    label={tr("levelName")}
                    value={level.name}
                    onChangeText={(text) => change(level.key, { name: text })}
                    maxLength={60}
                    testID={`grading-level-name-${index}`}
                  />
                </View>
                <View style={styles.score}>
                  <Field
                    label={tr("minScore")}
                    value={level.minScore}
                    onChangeText={(text) => change(level.key, { minScore: text })}
                    keyboardType="decimal-pad"
                    maxLength={7}
                    testID={`grading-level-min-${index}`}
                  />
                </View>
                <View style={styles.score}>
                  <Field
                    label={tr("maxScore")}
                    value={level.maxScore}
                    onChangeText={(text) => change(level.key, { maxScore: text })}
                    keyboardType="decimal-pad"
                    maxLength={7}
                    testID={`grading-level-max-${index}`}
                  />
                </View>
                {levels.length > 1 ? (
                  <View style={styles.bin}>
                    <Bin
                      label={`${t("common.remove")}: ${level.name || index + 1}`}
                      onPress={() => setLevels((now) => now.filter((l) => l.key !== level.key))}
                      testID={`grading-level-remove-${index}`}
                    />
                  </View>
                ) : null}
              </View>
              {problem ? (
                <Text variant="small" tone="destructive" testID={`grading-level-problem-${index}`}>
                  {problem}
                </Text>
              ) : null}
            </View>
          );
        })}
        <Button
          compact
          variant="outline"
          label={tr("addLevel")}
          disabled={levels.length >= 50}
          onPress={() => {
            // The next level starts one above where the last one ends, as on the site.
            const last = levels[levels.length - 1];
            const from = Math.min(1000, (typedScore(last?.maxScore ?? "") ?? 0) + 1);
            setLevels((now) => [...now, levelDraft("", from, from)]);
          }}
          testID="grading-level-add"
        />
      </FormSheet>
      <Confirm
        open={open && asking}
        onClose={() => setAsking(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", { name: system?.name ?? "", count: system?.coursesCount ?? 0 })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!system) return;
          remove.mutate(
            { id: system.id, input: null },
            {
              onSuccess: () => {
                setAsking(false);
                onClose();
              },
            },
          );
        }}
        testID="grading-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  list: { marginHorizontal: -space[4] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
  tight: { gap: space[2] },
  level: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  levelName: { flex: 1 },
  score: { width: 76 },
  // Level with the fields, under their labels.
  bin: { paddingTop: 34 },
});
