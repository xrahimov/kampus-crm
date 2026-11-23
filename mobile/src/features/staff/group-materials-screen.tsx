import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, Image as ImageIcon, Link2, Paperclip } from "lucide-react-native";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import {
  addGroupFile,
  addGroupMaterial,
  deleteMaterial,
  groupPageKeys,
  useGroupMaterials,
} from "@/api/group-pages";
import { useGroup } from "@/api/hooks";
import type { GroupMaterial, GroupMaterials } from "@/api/types";
import { Button } from "@/components/button";
import { ChoiceList } from "@/components/choice-list";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { fileRoute } from "@/features/files/file-screen";
import { chooseFile, choosePhoto, takePhoto, type Picked } from "@/features/files/pick";
import { MaterialList } from "@/features/shared/material-list";
import type { PickedFile } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

/** "Whole group" in the lesson choice. */
const GENERAL = "general";
/** How many lessons the choice offers: the ones nearest to today. */
const LESSONS_OFFERED = 5;

/** Tashkent's day now, as "2026-11-23". */
function today(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** The lessons nearest to `day`, newest first, with today's (or the nearest) leading the choice. */
export function nearestLessons<L extends { id: string; date: string }>(
  lessons: readonly L[],
  day: string,
  count = LESSONS_OFFERED,
): L[] {
  const distance = (l: L) => Math.abs(Date.parse(l.date) - Date.parse(day));
  return [...lessons]
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, count)
    .sort((a, b) => b.date.localeCompare(a.date));
}

type Draft = { kind: "FILE"; file: PickedFile } | { kind: "LINK" };

/**
 * A group's materials on the teacher's side, in the app (A-214): everything
 * the students see, opened inside the app, and a way to add to it from the
 * phone: a photo of the board, a file, a link.
 */
export function GroupMaterialsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const router = useRouter();
  const client = useQueryClient();
  const { wide } = useLayout();
  const group = useGroup(id);
  const query = useGroupMaterials(id);
  const [removing, setRemoving] = useState<GroupMaterial | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = (
    <Header back title={t("groups.detail.tabs.materials")} subtitle={group.data?.name} />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }

  const open = (material: GroupMaterial) => {
    if (material.kind === "LINK") {
      void Linking.openURL(material.url).catch(() => undefined);
      return;
    }
    router.push(
      material.kind === "RECORDING"
        ? fileRoute(material.url, material.title, { stream: material.hlsUrl })
        : fileRoute(material.url, material.title),
    );
  };

  const remove = (material: GroupMaterial) => {
    setBusy(true);
    setProblem(null);
    deleteMaterial(material.id)
      .then(() => {
        client.setQueryData<GroupMaterials>(groupPageKeys.materials(id), (old) =>
          old ? { ...old, items: old.items.filter((m) => m.id !== material.id) } : old,
        );
        setRemoving(null);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  const list = (
    <View style={styles.list}>
      {removing ? (
        <Card testID="material-delete-confirm">
          <Text variant="bodyStrong">{t("groups.materials.deleteTitle")}</Text>
          <Text numberOfLines={2}>{removing.title}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("groups.materials.deleteText")}
          </Text>
          <View style={styles.row}>
            <Button
              compact
              variant="destructive"
              label={t("groups.materials.delete")}
              loading={busy}
              onPress={() => remove(removing)}
              testID="material-delete-yes"
            />
            <Button
              compact
              variant="ghost"
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setRemoving(null)}
              testID="material-delete-no"
            />
          </View>
        </Card>
      ) : null}
      {problem ? <Notice tone="destructive">{problem}</Notice> : null}
      <MaterialList
        items={query.data.items}
        emptyText={t("groups.materials.empty")}
        onOpen={open}
        details={(material) => [
          material.watched
            ? t("groups.materials.watched", {
                started: material.watched.started,
                finished: material.watched.finished,
              })
            : null,
          material.createdByName
            ? t("groups.materials.addedBy", { name: material.createdByName })
            : null,
        ]}
        onDelete={(material) => {
          setProblem(null);
          setRemoving(material);
        }}
      />
    </View>
  );
  const add = (
    <AddMaterial
      groupId={id}
      lessons={query.data.lessons}
      onAdded={(material) => {
        client.setQueryData<GroupMaterials>(groupPageKeys.materials(id), (old) =>
          old ? { ...old, items: [material, ...old.items] } : old,
        );
        void query.refetch();
      }}
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? (
        <>
          <View style={styles.wideList}>{list}</View>
          <View style={styles.wideAdd}>{add}</View>
        </>
      ) : (
        <>
          {add}
          {list}
        </>
      )}
    </Screen>
  );
}

/** Adding to the group's materials from this device: a photo, a file or a link. */
function AddMaterial({
  groupId,
  lessons,
  onAdded,
}: {
  groupId: string;
  lessons: GroupMaterials["lessons"];
  onAdded: (material: GroupMaterial) => void;
}) {
  const t = useTranslations();
  const tm = useTranslations("mobile.homework");
  const formatDate = useDate();
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [lesson, setLesson] = useState(GENERAL);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const day = today();
  const offered = nearestLessons(lessons, day);
  const options = [
    { value: GENERAL, label: t("groups.materials.general") },
    ...offered.map((l) => ({
      value: l.id,
      label: [
        t("groups.materials.lessonOf", {
          date: formatDate(dayAsDate(l.date), { day: "numeric", month: "short" }),
        }),
        l.topic,
      ]
        .filter(Boolean)
        .join(", "),
    })),
  ];

  const begin = (next: Draft, name: string) => {
    setDraft(next);
    setTitle(name);
    setUrl("");
    setProblem(null);
    // A photo taken in class is most likely for today's lesson.
    setLesson(lessons.find((l) => l.date === day)?.id ?? GENERAL);
  };

  const pick = async (from: () => Promise<Picked>) => {
    setProblem(null);
    const picked = await from().catch((): Picked => ({ kind: "none" }));
    if (picked.kind === "refused") {
      setProblem(tm(picked.reason));
      return;
    }
    if (picked.kind === "file") begin({ kind: "FILE", file: picked.file }, nameOf(picked.file));
  };

  const save = () => {
    if (!draft || busy) return;
    const name = title.trim();
    if (!name) {
      setProblem(t("validation.required"));
      return;
    }
    setBusy(true);
    setProblem(null);
    const lessonId = lesson === GENERAL ? null : lesson;
    const sending =
      draft.kind === "FILE"
        ? addGroupFile(groupId, lessonId, name, draft.file)
        : addGroupMaterial(groupId, { lessonId, kind: "LINK", title: name, url: url.trim() });
    sending
      .then((material) => {
        setDraft(null);
        onAdded(material);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="material-add">
      <Text variant="heading">{t("groups.materials.add")}</Text>
      {draft ? (
        <View style={styles.form} testID="material-form">
          {draft.kind === "FILE" ? (
            <View style={[styles.attached, { borderColor: colors.border }]}>
              <Paperclip size={16} color={colors.mutedForeground} />
              <Text variant="small" style={styles.fill} numberOfLines={1}>
                {tm("attached", { name: draft.file.name })}
              </Text>
            </View>
          ) : (
            <Field
              label={t("groups.materials.url")}
              value={url}
              onChangeText={setUrl}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="material-url"
            />
          )}
          <Field
            label={t("groups.materials.title")}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            testID="material-title"
          />
          <ChoiceList
            label={t("groups.materials.lesson")}
            options={options}
            value={lesson}
            onChange={setLesson}
            testID="material-lesson"
          />
          {problem ? (
            <Notice tone="destructive" testID="material-problem">
              {problem}
            </Notice>
          ) : null}
          <View style={styles.row}>
            <Button
              label={busy ? t("groups.homework.uploading") : t("groups.materials.add")}
              loading={busy}
              onPress={save}
              testID="material-save"
            />
            <Button
              variant="ghost"
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setDraft(null)}
              testID="material-cancel"
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <Button
              compact
              variant="outline"
              label={tm("takePhoto")}
              icon={<Camera size={16} color={colors.foreground} />}
              onPress={() => void pick(takePhoto)}
              testID="material-take-photo"
            />
            <Button
              compact
              variant="outline"
              label={tm("choosePhoto")}
              icon={<ImageIcon size={16} color={colors.foreground} />}
              onPress={() => void pick(choosePhoto)}
              testID="material-choose-photo"
            />
            <Button
              compact
              variant="outline"
              label={tm("chooseFile")}
              icon={<Paperclip size={16} color={colors.foreground} />}
              onPress={() => void pick(chooseFile)}
              testID="material-choose-file"
            />
            <Button
              compact
              variant="outline"
              label={t("mobile.materials.addLink")}
              icon={<Link2 size={16} color={colors.foreground} />}
              onPress={() => begin({ kind: "LINK" }, "")}
              testID="material-add-link"
            />
          </View>
          {problem ? (
            <Notice tone="destructive" testID="material-problem">
              {problem}
            </Notice>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** A file's name without its ending, as a first title: "unit-3" for "unit-3.pdf". */
export function nameOf(file: { name: string }): string {
  const dot = file.name.lastIndexOf(".");
  return (dot > 0 ? file.name.slice(0, dot) : file.name).slice(0, 200);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideList: { flex: 3, gap: space[6] },
  wideAdd: { flex: 2 },
  list: { gap: space[6] },
  form: { gap: space[4] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  attached: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
