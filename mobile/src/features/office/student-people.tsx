import { KeyRound, Phone, X } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import {
  useAccessStep,
  useAddField,
  useAddParent,
  useRemoveParent,
  useStudentAccess,
  type StudentAccess,
} from "@/api/office-student-page";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { SendSmsSheet } from "./sms-sheet";

/** A phone number with a button that starts the call, and room for one more thing to do. */
export function PhoneLine({
  name,
  phone,
  testID,
  after,
}: {
  name: string;
  phone: string;
  testID: string;
  after?: React.ReactNode;
}) {
  const tm = useTranslations("mobile.studentsPage");
  const { colors } = useTheme();
  return (
    <View style={styles.line}>
      <View style={styles.fill}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {phone}
        </Text>
      </View>
      <Button
        compact
        variant="outline"
        label={tm("call")}
        icon={<Phone size={16} color={colors.foreground} />}
        onPress={() => void Linking.openURL(`tel:${phone.replace(/[^+0-9]/g, "")}`)}
        testID={testID}
      />
      {after}
    </View>
  );
}

/**
 * The parents on a student's page. Everyone who sees the student may call
 * them; the office also adds and removes parents and texts them all at once
 * (A-240), as the site's Parents tab does.
 */
export function ParentsCard({ student, office }: { student: StudentDetail; office: boolean }) {
  const t = useTranslations();
  const tp = useTranslations("students.parents");
  const me = useMe();
  const { colors } = useTheme();
  const remove = useRemoveParent(student.id);
  const [adding, setAdding] = useState(false);
  const [texting, setTexting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; fullName: string } | null>(null);
  const mayEdit = office && can(me, "students.update");
  const mayAdd = mayEdit && !student.isArchived;
  const maySms = office && can(me, "sms.send");
  return (
    <Card testID="student-parents">
      <Text variant="heading">{tp("title")}</Text>
      {student.parents.length === 0 ? (
        <Text tone="mutedForeground">{tp("empty")}</Text>
      ) : (
        student.parents.map((parent) => (
          <PhoneLine
            key={parent.id}
            name={parent.fullName}
            phone={parent.phone}
            testID={`parent-call-${parent.id}`}
            after={
              mayEdit ? (
                <Pressable
                  onPress={() => {
                    remove.reset();
                    setRemoving(parent);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("common.remove")}: ${parent.fullName}`}
                  hitSlop={8}
                  style={styles.icon}
                  testID={`parent-remove-${parent.id}`}
                >
                  <X size={18} color={colors.mutedForeground} />
                </Pressable>
              ) : null
            }
          />
        ))
      )}
      {mayAdd || maySms ? (
        <View style={styles.actions}>
          {mayAdd ? (
            <Button
              compact
              variant="outline"
              label={tp("add")}
              onPress={() => setAdding(true)}
              testID="parent-add"
            />
          ) : null}
          {maySms ? (
            <Button
              compact
              variant="outline"
              label={tp("sms")}
              disabled={student.parents.length === 0}
              onPress={() => setTexting(true)}
              testID="parents-sms"
            />
          ) : null}
        </View>
      ) : null}
      <ParentSheet open={adding} onClose={() => setAdding(false)} studentId={student.id} />
      <SendSmsSheet
        open={texting}
        onClose={() => setTexting(false)}
        target={{ kind: "parents", studentId: student.id }}
        title={tp("smsTitle", { name: student.fullName })}
        testID="parents-sms-sheet"
      />
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tp("deleteTitle")}
        text={tp("deleteText", { name: removing?.fullName ?? "" })}
        label={t("common.delete")}
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id, { onSuccess: () => setRemoving(null) });
        }}
        testID="parent-delete"
      />
    </Card>
  );
}

function ParentSheet({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
}) {
  const t = useTranslations();
  const tp = useTranslations("students.parents");
  const add = useAddParent(studentId);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFullName("");
      setPhone("+998");
      add.reset();
    }
  }
  const fieldError = fieldErrorOf(t, add.error);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tp("add")}
      testID="parent-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={add.isPending}
          disabled={!fullName.trim()}
          onPress={() =>
            add.mutate({ fullName: fullName.trim(), phone: phone.trim() }, { onSuccess: onClose })
          }
          testID="parent-save"
        />
      }
    >
      <View style={styles.form}>
        <Field
          label={tp("fullName")}
          value={fullName}
          onChangeText={setFullName}
          maxLength={120}
          error={fieldError("fullName")}
          testID="parent-name"
        />
        <Field
          label={tp("phone")}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={17}
          error={fieldError("phone")}
          testID="parent-phone"
        />
        {add.error && !hasFieldErrors(add.error) ? (
          <Notice tone="destructive" testID="parent-problem">
            {errorText(t, add.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

/** "Add extra information": a named line on the student's card, such as a T-shirt size. */
export function FieldSheet({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
}) {
  const t = useTranslations();
  const td = useTranslations("students.detail");
  const add = useAddField(studentId);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setValue("");
      add.reset();
    }
  }
  const fieldError = fieldErrorOf(t, add.error);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("fieldDialog")}
      testID="field-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={add.isPending}
          disabled={!name.trim()}
          onPress={() =>
            add.mutate({ name: name.trim(), value: value.trim() || null }, { onSuccess: onClose })
          }
          testID="field-save"
        />
      }
    >
      <View style={styles.form}>
        <Field
          label={td("fieldName")}
          value={name}
          onChangeText={setName}
          maxLength={60}
          error={fieldError("name")}
          testID="field-name"
        />
        <Field
          label={td("fieldValue")}
          value={value}
          onChangeText={setValue}
          multiline
          maxLength={500}
          error={fieldError("value")}
          testID="field-value"
        />
        {add.error && !hasFieldErrors(add.error) ? (
          <Notice tone="destructive" testID="field-problem">
            {errorText(t, add.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * "Kampus app sign-in" (A-240): the Telegram accounts that open this student,
 * their own or a parent's, how each was linked and when it was last seen,
 * with the two ways to take that away.
 */
export function AccessCard({ student }: { student: StudentDetail }) {
  const t = useTranslations("students.access");
  const tr = useTranslations();
  const me = useMe();
  const { colors } = useTheme();
  const formatDate = useDate();
  const query = useStudentAccess(student.id, true);
  const step = useAccessStep(student.id);
  const [asking, setAsking] = useState<null | { do: "signOut" | "unlink"; link: StudentAccess }>(
    null,
  );
  const mayEdit = can(me, "students.update");
  const ask = (what: "signOut" | "unlink", link: StudentAccess) => {
    step.reset();
    setAsking({ do: what, link });
  };
  return (
    <Card testID="access-card">
      <View style={styles.line}>
        <KeyRound size={18} color={colors.foreground} />
        <Text variant="heading" style={styles.fill}>
          {t("title")}
        </Text>
      </View>
      {query.error ? <Notice tone="destructive">{errorText(tr, query.error)}</Notice> : null}
      {query.isLoading ? <Loading /> : null}
      {query.data?.length === 0 ? (
        <Text tone="mutedForeground" testID="access-none">
          {t("none")}
        </Text>
      ) : null}
      {query.data?.map((link) => (
        <View key={link.linkId} style={styles.tight} testID={`access-${link.linkId}`}>
          <View style={styles.line}>
            <Text variant="bodyStrong" style={styles.fill} numberOfLines={1}>
              {link.telegramName}
              {link.telegramUsername ? ` @${link.telegramUsername}` : ""}
            </Text>
            <Badge
              label={
                link.who.kind === "PARENT" ? t("parent", { name: link.who.name }) : t("student")
              }
            />
          </View>
          <Text variant="small" tone="mutedForeground">
            {[
              t(`via.${link.via}`),
              formatDate(new Date(link.linkedAt), { dateStyle: "medium" }),
              link.lastSeenAt
                ? t("lastSeen", {
                    date: formatDate(new Date(link.lastSeenAt), { day: "numeric", month: "short" }),
                  })
                : null,
              t("devices", { count: link.devices }),
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
          {mayEdit ? (
            <View style={styles.actions}>
              {link.devices > 0 ? (
                <Button
                  compact
                  variant="outline"
                  label={t("signOut")}
                  onPress={() => ask("signOut", link)}
                  testID={`access-sign-out-${link.linkId}`}
                />
              ) : null}
              <Button
                compact
                variant="ghost"
                label={t("unlink")}
                onPress={() => ask("unlink", link)}
                testID={`access-unlink-${link.linkId}`}
              />
            </View>
          ) : null}
        </View>
      ))}
      <Text variant="small" tone="mutedForeground">
        {t("hint")}
      </Text>
      <Confirm
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={
          asking?.do === "signOut"
            ? t("signOutTitle", { name: asking.link.telegramName })
            : t("unlinkTitle", { name: asking?.link.telegramName ?? "" })
        }
        text={asking?.do === "signOut" ? t("signOutText") : t("unlinkText")}
        label={asking?.do === "signOut" ? t("signOut") : t("unlink")}
        destructive={asking?.do !== "signOut"}
        loading={step.isPending}
        problem={step.error ? errorText(tr, step.error) : null}
        onConfirm={() => {
          if (!asking) return;
          step.mutate(
            { do: asking.do, linkId: asking.link.linkId },
            { onSuccess: () => setAsking(null) },
          );
        }}
        testID="access-confirm"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  fill: { flex: 1 },
  icon: { padding: space[1] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  form: { gap: space[4] },
  tight: { gap: space[2] },
});
