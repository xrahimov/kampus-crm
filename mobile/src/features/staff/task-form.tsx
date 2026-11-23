import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { TaskInput } from "@/api/staff-group";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { Attach } from "@/features/files/attach";
import { WordChip } from "@/features/student/answer-parts";
import type { PickedFile } from "@/lib/api";
import { addDays, dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** How many days ahead the due day can be chosen with one tap. */
const DUE_DAYS = 14;

/** What the form starts from: an existing task, or nothing. */
export interface TaskStart {
  title?: string | null;
  text?: string;
  linkUrl?: string | null;
  attachmentUrl?: string | null;
  dueDate?: string | null;
  speaking?: boolean;
}

export type TaskDraft = TaskInput & { title: string };

/**
 * The fields of a homework task (A-217): what to do, a link, a file from this
 * phone, the day it is due and whether it is answered by voice. With `named`
 * it also asks for the name an assignment carries. Whoever shows the form
 * decides where the task is saved.
 */
export function TaskForm({
  start,
  named = false,
  today,
  busy,
  problem,
  onSave,
  onCancel,
  children,
}: {
  start: TaskStart;
  named?: boolean;
  /** The centre's day: the due days are counted from it. */
  today: string;
  busy: boolean;
  problem: string | null;
  onSave: (draft: TaskDraft) => void;
  onCancel: () => void;
  /** Shown above the fields: where the task goes. */
  children?: ReactNode;
}) {
  const t = useTranslations();
  const formatDate = useDate();
  const [title, setTitle] = useState(start.title ?? "");
  const [text, setText] = useState(start.text ?? "");
  const [link, setLink] = useState(start.linkUrl ?? "");
  const [saved, setSaved] = useState(start.attachmentUrl ?? null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [due, setDue] = useState(start.dueDate ?? null);
  const [speaking, setSpeaking] = useState(start.speaking ?? false);
  const [missing, setMissing] = useState(false);

  const days = Array.from({ length: DUE_DAYS }, (_, index) => addDays(today, index));
  // A day set earlier that the row does not offer (passed, or further out) stays choosable.
  if (due && !days.includes(due)) days.unshift(due);
  const day = (iso: string) => {
    const date = dayAsDate(iso);
    return `${formatDate(date, { weekday: "short" })}, ${formatDate(date, { day: "numeric", month: "short" })}`;
  };

  const save = () => {
    if (!text.trim() || (named && !title.trim())) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onSave({
      title: title.trim(),
      text: text.trim(),
      linkUrl: link.trim() || null,
      attachmentUrl: saved,
      file,
      dueDate: due,
      speaking,
    });
  };

  return (
    <View style={styles.form} testID="task-form">
      {children}
      {named ? (
        <Field
          label={t("groups.homework.assignment.title")}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          error={missing && !title.trim() ? t("validation.required") : null}
          testID="task-title"
        />
      ) : null}
      <Field
        label={t("groups.homework.text")}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={4000}
        error={missing && !text.trim() ? t("validation.required") : null}
        style={styles.text}
        testID="task-text"
      />
      <Field
        label={t("groups.homework.linkUrl")}
        value={link}
        onChangeText={setLink}
        placeholder="https://"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={500}
        testID="task-link"
      />
      <View style={styles.part}>
        <Text variant="smallStrong">{t("groups.homework.attachment")}</Text>
        <Attach
          file={file}
          onFile={setFile}
          saved={saved}
          onRemoveSaved={() => setSaved(null)}
          disabled={busy}
          testID="task-file"
        />
      </View>
      <View style={styles.part}>
        <Text variant="smallStrong">{t("groups.homework.dueDate")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.days}
          keyboardShouldPersistTaps="handled"
        >
          <WordChip
            label={t("mobile.task.noDate")}
            chosen={due === null}
            onPress={() => setDue(null)}
            testID="task-due-none"
          />
          {days.map((iso) => (
            <WordChip
              key={iso}
              label={day(iso)}
              chosen={due === iso}
              onPress={() => setDue(iso)}
              testID={`task-due-${iso}`}
            />
          ))}
        </ScrollView>
      </View>
      <Check
        label={t("groups.homework.speaking")}
        hint={t("groups.homework.speakingHint")}
        value={speaking}
        onChange={setSpeaking}
        disabled={busy}
        testID="task-speaking"
      />
      {problem ? (
        <Notice tone="destructive" testID="task-problem">
          {problem}
        </Notice>
      ) : null}
      <View style={styles.row}>
        <Button
          label={busy && file ? t("groups.homework.uploading") : t("common.save")}
          loading={busy}
          onPress={save}
          testID="task-save"
        />
        <Button
          variant="ghost"
          label={t("common.cancel")}
          disabled={busy}
          onPress={onCancel}
          testID="task-cancel"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  part: { gap: space[2] },
  text: { minHeight: 96, textAlignVertical: "top" },
  days: { gap: space[2], paddingRight: space[2] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
});
