import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroups } from "@/api/hooks";
import {
  announcementKeys,
  deleteAnnouncement,
  postAnnouncement,
  useAnnouncements,
} from "@/api/staff-announcements";
import type { Announcement } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { WordChip } from "@/features/student/answer-parts";
import { ApiError } from "@/lib/api";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * Announcements on the staff side, in the app (A-221): the notices the person
 * may see, and a new one to one of their groups. A notice shows on the
 * students' pages, goes to their Telegram chats and, if asked, out as SMS.
 */
export function AnnouncementsScreen() {
  const t = useTranslations();
  const ta = useTranslations("announcements");
  const client = useQueryClient();
  const me = useMe();
  const query = useAnnouncements();
  const mayPost = can(me, "announcements.create");
  const [writing, setWriting] = useState(false);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [posted, setPosted] = useState<Announcement | null>(null);

  const header = <Header back title={ta("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.pages.flatMap((page) => page.items);
  const refresh = () => void client.invalidateQueries({ queryKey: announcementKeys.list });

  const remove = (row: Announcement) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    deleteAnnouncement(row.id)
      .then(() => {
        setRemoving(null);
        refresh();
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      {posted ? (
        <Notice tone="success" testID="announcement-posted">
          {t("mobile.announcements.posted", { count: posted.recipients })}
        </Notice>
      ) : null}
      {mayPost && !writing ? (
        <Button
          label={ta("new")}
          onPress={() => {
            setPosted(null);
            setWriting(true);
          }}
          style={styles.start}
          testID="announcement-new"
        />
      ) : null}
      {writing ? (
        <NewAnnouncement
          onCancel={() => setWriting(false)}
          onPosted={(saved) => {
            setWriting(false);
            setPosted(saved);
            refresh();
          }}
        />
      ) : null}
      {removing ? (
        <Card testID="announcement-delete-confirm">
          <Text variant="bodyStrong">{ta("deleteTitle")}</Text>
          <Text numberOfLines={2}>{removing.title}</Text>
          <Text variant="small" tone="mutedForeground">
            {ta("deleteDescription")}
          </Text>
          <View style={styles.row}>
            <Button
              compact
              variant="destructive"
              label={t("common.delete")}
              loading={busy}
              onPress={() => remove(removing)}
              testID="announcement-delete-yes"
            />
            <Button
              compact
              variant="ghost"
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setRemoving(null)}
              testID="announcement-delete-no"
            />
          </View>
        </Card>
      ) : null}
      {problem ? <Notice tone="destructive">{problem}</Notice> : null}
      {rows.length === 0 ? <EmptyState title={ta("empty")} text={ta("emptyHint")} /> : null}
      {rows.map((row) => (
        <Row
          key={row.id}
          row={row}
          onDelete={
            mayPost
              ? () => {
                  setProblem(null);
                  setRemoving(row);
                }
              : undefined
          }
        />
      ))}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="announcements-more"
        />
      ) : null}
    </Screen>
  );
}

function Row({ row, onDelete }: { row: Announcement; onDelete?: () => void }) {
  const t = useTranslations();
  const ta = useTranslations("announcements");
  const formatDate = useDate();
  const where =
    row.audience === "GROUP"
      ? (row.groupName ?? ta("audience.GROUP"))
      : row.audience === "BRANCH"
        ? (row.branchName ?? ta("audience.BRANCH"))
        : ta("audience.CENTRE");
  return (
    <Card testID={`announcement-${row.id}`}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.fill}>
          {row.title}
        </Text>
        <Badge label={where} testID="announcement-where" />
      </View>
      <Text>{row.body}</Text>
      <Text variant="small" tone="mutedForeground" testID="announcement-facts">
        {[
          row.createdByName,
          formatDate(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" }),
          ta("stats.reads", { reads: row.reads, total: row.recipients }),
          ta("stats.telegram", { count: row.telegramQueued }),
          row.sendSms ? ta("stats.sms", { count: row.smsQueued }) : null,
        ]
          .filter(Boolean)
          .join(", ")}
      </Text>
      {onDelete ? (
        <Button
          compact
          variant="ghost"
          label={t("common.delete")}
          onPress={onDelete}
          style={styles.start}
          testID={`announcement-delete-${row.id}`}
        />
      ) : null}
    </Card>
  );
}

function NewAnnouncement({
  onCancel,
  onPosted,
}: {
  onCancel: () => void;
  onPosted: (saved: Announcement) => void;
}) {
  const t = useTranslations();
  const td = useTranslations("announcements.dialog");
  const groups = useGroups();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const list = groups.data?.items ?? [];
  const ready = groupId !== null && title.trim().length > 0 && body.trim().length > 0;

  const post = () => {
    if (!groupId || !ready || busy) return;
    setBusy(true);
    setProblem(null);
    setErrors({});
    postAnnouncement({ groupId, title: title.trim(), body: body.trim(), sendSms })
      .then(onPosted)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.fields) setErrors(error.fields);
        setProblem(errorText(t, error));
      })
      .finally(() => setBusy(false));
  };
  const fieldError = (name: string) => {
    const key = errors[name]?.[0];
    return key ? (t.has(key) ? t(key) : key) : undefined;
  };

  return (
    <Card testID="announcement-form">
      <View>
        <Text variant="heading">{td("title")}</Text>
        <Text variant="small" tone="mutedForeground">
          {td("recipientsHint")}
        </Text>
      </View>
      <View style={styles.block}>
        <Text variant="smallStrong">{td("group")}</Text>
        {groups.isLoading ? (
          <Text tone="mutedForeground">{t("common.loading")}</Text>
        ) : list.length === 0 ? (
          <Text tone="mutedForeground" testID="announcement-no-groups">
            {t("mobile.noGroupsTitle")}
          </Text>
        ) : (
          <View style={styles.wrap}>
            {list.map((group) => (
              <WordChip
                key={group.id}
                label={group.name}
                chosen={groupId === group.id}
                onPress={() => setGroupId(group.id)}
                testID={`announcement-group-${group.id}`}
              />
            ))}
          </View>
        )}
      </View>
      <Field
        label={td("titleField")}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        error={fieldError("title")}
        testID="announcement-title"
      />
      <Field
        label={td("body")}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        error={fieldError("body")}
        style={styles.text}
        testID="announcement-body"
      />
      <Check
        label={td("sendSms")}
        hint={td("sendSmsHint")}
        value={sendSms}
        onChange={setSendSms}
        testID="announcement-sms"
      />
      {problem ? (
        <Notice tone="destructive" testID="announcement-problem">
          {problem}
        </Notice>
      ) : null}
      <View style={styles.row}>
        <Button
          label={td("submit")}
          loading={busy}
          disabled={!ready}
          onPress={post}
          testID="announcement-post"
        />
        <Button
          variant="ghost"
          label={t("common.cancel")}
          disabled={busy}
          onPress={onCancel}
          testID="announcement-cancel"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4], maxWidth: 720 },
  block: { gap: space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  text: { minHeight: 96, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
});
