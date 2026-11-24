import { useRouter } from "expo-router";
import { Link2, Share2, Users } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";

import { useStudentSearch } from "@/api/office-follow-up";
import {
  useFamilyPage,
  useFamilyStep,
  useRenewFamilyPage,
  useSendSms,
  useStudentFamily,
  type Family,
} from "@/api/office-student-page";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/** A whole percent from 0 to 100 out of what was typed; null when it is not one. */
export function typedPercent(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{1,3}$/.test(clean)) return null;
  const value = Number(clean);
  return value <= 100 ? value : null;
}

/**
 * "Family" on a student's page (A-240): the brothers and sisters linked to
 * the student, the discount they share and the one page their parents open.
 * Linking, the discount and leaving the family follow the site's rights.
 */
export function FamilyCard({ student }: { student: StudentDetail }) {
  const t = useTranslations("students.family");
  const tr = useTranslations();
  const me = useMe();
  const router = useRouter();
  const { colors } = useTheme();
  const query = useStudentFamily(student.id, true);
  const step = useFamilyStep(student.id);
  const [sheet, setSheet] = useState<null | "link" | "edit" | "leave" | "page">(null);
  const close = () => setSheet(null);
  const mayEdit = can(me, "students.update") && !student.isArchived;
  const mayDiscount = can(me, "discounts.give");
  const family = query.data ?? null;

  return (
    <Card testID="family-card">
      <View style={styles.line}>
        <Users size={18} color={colors.foreground} />
        <Text variant="heading" style={styles.fill}>
          {t("title")}
        </Text>
        {family ? (
          <Badge
            tone={family.discountPercent > 0 ? "success" : "neutral"}
            label={
              family.discountPercent > 0
                ? t("discount", { percent: family.discountPercent })
                : t("noDiscount")
            }
            testID="family-discount"
          />
        ) : null}
      </View>
      {query.error ? <Notice tone="destructive">{errorText(tr, query.error)}</Notice> : null}
      {query.isLoading ? <Loading /> : null}
      {query.data === null ? <Text tone="mutedForeground">{t("none")}</Text> : null}
      {family ? (
        <>
          <Text testID="family-name">
            <Text variant="bodyStrong">{family.name}</Text>
            {`, ${t("members", { count: family.members.length })}`}
          </Text>
          {family.members.map((member) => {
            const groups = member.groups.length > 0 ? member.groups.join(", ") : t("noGroups");
            return member.id === student.id ? (
              <View key={member.id} style={styles.member} testID={`family-member-${member.id}`}>
                <Text variant="bodyStrong">{member.fullName}</Text>
                <Text variant="small" tone="mutedForeground">
                  {groups}
                </Text>
              </View>
            ) : (
              <Pressable
                key={member.id}
                onPress={() =>
                  router.push({ pathname: "/staff/student/[id]", params: { id: member.id } })
                }
                accessibilityRole="link"
                accessibilityLabel={member.fullName}
                style={({ pressed }) => [
                  styles.member,
                  pressed ? { backgroundColor: colors.muted } : null,
                ]}
                testID={`family-member-${member.id}`}
              >
                <Text variant="bodyStrong" tone="primary">
                  {member.fullName}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {groups}
                </Text>
              </Pressable>
            );
          })}
          {family.note ? (
            <Text variant="small" tone="mutedForeground">
              {family.note}
            </Text>
          ) : null}
        </>
      ) : null}
      {query.data !== undefined ? (
        <View style={styles.actions}>
          {family ? (
            <Button
              compact
              variant="outline"
              label={t("page.button")}
              icon={<Link2 size={16} color={colors.foreground} />}
              onPress={() => setSheet("page")}
              testID="family-page"
            />
          ) : null}
          {mayEdit ? (
            <Button
              compact
              variant="outline"
              label={t("link")}
              onPress={() => setSheet("link")}
              testID="family-link"
            />
          ) : null}
          {mayEdit && family ? (
            <>
              <Button
                compact
                variant="outline"
                label={t("edit")}
                onPress={() => setSheet("edit")}
                testID="family-edit"
              />
              <Button
                compact
                variant="ghost"
                label={t("unlink")}
                onPress={() => {
                  step.reset();
                  setSheet("leave");
                }}
                testID="family-leave"
              />
            </>
          ) : null}
        </View>
      ) : null}
      <LinkSiblingSheet
        open={sheet === "link"}
        onClose={close}
        student={student}
        hasFamily={family !== null}
        mayDiscount={mayDiscount}
      />
      <EditFamilySheet
        open={sheet === "edit"}
        onClose={close}
        studentId={student.id}
        family={family}
        mayDiscount={mayDiscount}
      />
      <FamilyPageSheet
        open={sheet === "page"}
        onClose={close}
        studentId={student.id}
        mayRenew={mayEdit}
        maySms={can(me, "sms.send") && !student.isArchived}
      />
      <Confirm
        open={sheet === "leave"}
        onClose={close}
        title={t("unlinkTitle", { name: student.fullName })}
        text={t("unlinkText")}
        label={t("unlink")}
        loading={step.isPending}
        problem={step.error ? errorText(tr, step.error) : null}
        onConfirm={() => step.mutate({ do: "leave" }, { onSuccess: close })}
        testID="family-leave-sheet"
      />
    </Card>
  );
}

/** "Link a sibling": pick the brother or sister; the first link also names the family. */
function LinkSiblingSheet({
  open,
  onClose,
  student,
  hasFamily,
  mayDiscount,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentDetail;
  hasFamily: boolean;
  mayDiscount: boolean;
}) {
  const t = useTranslations("students.family");
  const tr = useTranslations();
  const { colors } = useTheme();
  const step = useFamilyStep(student.id);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; fullName: string } | null>(null);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("0");
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setPicked(null);
      setName("");
      setPercent("0");
      setTried(false);
      step.reset();
    }
  }
  const rested = useRested(search.trim());
  const found = useStudentSearch(rested, open && !picked);
  const others = (found.data?.items ?? []).filter((s) => s.id !== student.id);
  const fieldError = fieldErrorOf(tr, step.error);
  const asksDiscount = !hasFamily && mayDiscount;
  const discount = typedPercent(percent);

  const save = () => {
    setTried(true);
    if (!picked || (asksDiscount && discount === null)) return;
    step.mutate(
      {
        do: "link",
        input: {
          studentId: picked.id,
          ...(!hasFamily && name.trim() ? { name: name.trim() } : {}),
          ...(asksDiscount && discount !== null ? { discountPercent: discount } : {}),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("link")}
      testID="family-link-sheet"
      footer={
        <Button
          label={tr("common.save")}
          loading={step.isPending}
          onPress={save}
          testID="family-link-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {t("form.linkHint")}
        </Text>
        {picked ? (
          <View style={[styles.picked, { borderColor: colors.border }]} testID="family-sibling">
            <Text variant="bodyStrong" style={styles.fill}>
              {picked.fullName}
            </Text>
            <Button
              variant="ghost"
              compact
              label={tr("common.edit")}
              onPress={() => setPicked(null)}
              testID="family-sibling-change"
            />
          </View>
        ) : (
          <View style={styles.tight}>
            <Field
              label={t("form.sibling")}
              value={search}
              onChangeText={setSearch}
              hint={tr("groups.members.searchHint")}
              autoCorrect={false}
              error={fieldError("studentId") ?? (tried ? tr("validation.studentRequired") : null)}
              testID="family-sibling-search"
            />
            {others.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setPicked({ id: s.id, fullName: s.fullName })}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.found,
                  { borderColor: colors.border },
                  pressed ? { backgroundColor: colors.muted } : null,
                ]}
                testID={`family-found-${s.id}`}
              >
                <Text variant="bodyStrong">{s.fullName}</Text>
                {s.phone ? (
                  <Text variant="small" tone="mutedForeground">
                    {s.phone}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
        {!hasFamily ? (
          <Field
            label={t("form.name")}
            value={name}
            onChangeText={setName}
            placeholder={student.fullName}
            maxLength={120}
            error={fieldError("name")}
            testID="family-link-name"
          />
        ) : null}
        {asksDiscount ? (
          <Field
            label={t("form.discountPercent")}
            value={percent}
            onChangeText={setPercent}
            keyboardType="number-pad"
            maxLength={3}
            hint={t("form.hint")}
            error={
              fieldError("discountPercent") ??
              (tried && discount === null ? tr("validation.percent") : null)
            }
            testID="family-link-percent"
          />
        ) : null}
        {step.error && !hasFieldErrors(step.error) ? (
          <Notice tone="destructive" testID="family-link-problem">
            {errorText(tr, step.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

/** "Edit family": its name, the percent that comes off every member's fee, a note. */
function EditFamilySheet({
  open,
  onClose,
  studentId,
  family,
  mayDiscount,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  family: Family | null;
  mayDiscount: boolean;
}) {
  const t = useTranslations("students.family");
  const tr = useTranslations();
  const step = useFamilyStep(studentId);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("0");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && family) {
      setName(family.name);
      setPercent(String(family.discountPercent));
      setNote(family.note ?? "");
      setTried(false);
      step.reset();
    }
  }
  const fieldError = fieldErrorOf(tr, step.error);
  const discount = typedPercent(percent);

  const save = () => {
    setTried(true);
    if (!family || !name.trim() || discount === null) return;
    step.mutate(
      {
        do: "edit",
        familyId: family.id,
        input: {
          name: name.trim(),
          // Without the right to give discounts the percent goes back as it was.
          discountPercent: mayDiscount ? discount : family.discountPercent,
          note: note.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("edit")}
      testID="family-edit-sheet"
      footer={
        <Button
          label={tr("common.save")}
          loading={step.isPending}
          onPress={save}
          testID="family-edit-save"
        />
      }
    >
      <View style={styles.form}>
        <Field
          label={t("form.name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? (tried && !name.trim() ? tr("validation.required") : null)}
          testID="family-edit-name"
        />
        <Field
          label={t("form.discountPercent")}
          value={percent}
          onChangeText={setPercent}
          keyboardType="number-pad"
          maxLength={3}
          editable={mayDiscount}
          hint={t("form.hint")}
          error={
            fieldError("discountPercent") ??
            (tried && discount === null ? tr("validation.percent") : null)
          }
          testID="family-edit-percent"
        />
        <Field
          label={t("form.note")}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          error={fieldError("note")}
          testID="family-edit-note"
        />
        {step.error && !hasFieldErrors(step.error) ? (
          <Notice tone="destructive" testID="family-edit-problem">
            {errorText(tr, step.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * "Parents' page": the family's one link. It is handed to the phone's share
 * sheet (which also copies), texted to the parents, or replaced by a new one.
 */
function FamilyPageSheet({
  open,
  onClose,
  studentId,
  mayRenew,
  maySms,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  mayRenew: boolean;
  maySms: boolean;
}) {
  const t = useTranslations("students.family.page");
  const tr = useTranslations();
  const { colors } = useTheme();
  const page = useFamilyPage(studentId, open);
  const renew = useRenewFamilyPage(studentId);
  const sms = useSendSms();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      renew.reset();
      sms.reset();
    }
  }
  const url = page.data?.url ?? null;
  const problem = page.error ?? renew.error ?? sms.error;

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} testID="family-page-sheet">
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {t("hint")}
        </Text>
        {problem ? (
          <Notice tone="destructive" testID="family-page-problem">
            {errorText(tr, problem)}
          </Notice>
        ) : null}
        {page.isLoading ? <Loading /> : null}
        {page.data === null ? <Text tone="mutedForeground">{t("none")}</Text> : null}
        {url ? (
          <>
            <Text selectable testID="family-page-url">
              {url}
            </Text>
            <View style={styles.actions}>
              <Button
                compact
                variant="outline"
                label={tr("mobile.studentsPage.shareLink")}
                icon={<Share2 size={16} color={colors.foreground} />}
                onPress={() => void Share.share({ message: url }).catch(() => undefined)}
                testID="family-page-share"
              />
              {maySms ? (
                <Button
                  compact
                  variant="outline"
                  label={t("sms")}
                  loading={sms.isPending}
                  onPress={() =>
                    sms.mutate({
                      target: { kind: "parents", studentId },
                      text: t("smsText", { url }),
                    })
                  }
                  testID="family-page-sms"
                />
              ) : null}
            </View>
            {sms.data ? (
              <Notice tone={sms.data.total === 0 ? "warning" : "success"} testID="family-page-sent">
                {sms.data.total === 0 ? t("smsNone") : t("smsSent", { count: sms.data.total })}
              </Notice>
            ) : null}
            {mayRenew ? (
              <View style={styles.tight}>
                <Button
                  compact
                  variant="ghost"
                  label={t("reset")}
                  loading={renew.isPending}
                  onPress={() => {
                    sms.reset();
                    renew.mutate();
                  }}
                  style={styles.start}
                  testID="family-page-renew"
                />
                <Text variant="small" tone="mutedForeground">
                  {t("resetHint")}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  fill: { flex: 1 },
  member: { gap: 2, borderRadius: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  form: { gap: space[4] },
  tight: { gap: space[2] },
  start: { alignSelf: "flex-start" },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: space[3],
    paddingVertical: space[1],
  },
  found: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
