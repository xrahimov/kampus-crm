import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import {
  addStaffComment,
  createStreamPost,
  deleteStaffComment,
  deleteStreamPost,
  staffGroupKeys,
  updateStreamPost,
  useGroupStream,
} from "@/api/staff-group";
import type { StreamPost } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Attach } from "@/features/files/attach";
import { PendingScreen } from "@/features/shared/pending-screen";
import { StreamPostCard } from "@/features/shared/stream-post";
import type { PickedFile } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * A group's stream on the teacher's side, in the app (A-217): write to the
 * group with a file from this phone, pin a post, close its comments, answer
 * under it, and take a post or a comment away.
 */
export function GroupStreamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const { wide } = useLayout();
  const me = useMe();
  const group = useGroup(id);
  const query = useGroupStream(id);
  const [removing, setRemoving] = useState<StreamPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = <Header back title={t("groups.detail.tabs.stream")} subtitle={group.data?.name} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const canPost = can(me, "groups.attendance.mark") && group.data?.status !== "ARCHIVED";

  const key = staffGroupKeys.stream(id);
  const replace = (post: StreamPost) =>
    client.setQueryData<StreamPost[]>(key, (old) => old?.map((p) => (p.id === post.id ? post : p)));
  /** A pin moves a post, so the list is read again in the server's order. */
  const change = (post: StreamPost, what: { pinned?: boolean; locked?: boolean }) => {
    setBusy(true);
    setProblem(null);
    updateStreamPost(post, what)
      .then((next) => {
        replace(next);
        if (what.pinned !== undefined) void query.refetch();
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };
  const remove = (post: StreamPost) => {
    setBusy(true);
    setProblem(null);
    deleteStreamPost(post.id)
      .then(() => {
        client.setQueryData<StreamPost[]>(key, (old) => old?.filter((p) => p.id !== post.id));
        setRemoving(null);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  const list = (
    <View style={styles.list}>
      {removing ? (
        <Card testID="post-delete-confirm">
          <Text variant="bodyStrong">{t("stream.deleteTitle")}</Text>
          <Text numberOfLines={2}>{removing.body}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("stream.deleteText")}
          </Text>
          <View style={styles.row}>
            <Button
              compact
              variant="destructive"
              label={t("common.delete")}
              loading={busy}
              onPress={() => remove(removing)}
              testID="post-delete-yes"
            />
            <Button
              compact
              variant="ghost"
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setRemoving(null)}
              testID="post-delete-no"
            />
          </View>
        </Card>
      ) : null}
      {problem ? <Notice tone="destructive">{problem}</Notice> : null}
      {query.data.length === 0 ? <EmptyState title={t("stream.empty")} /> : null}
      {query.data.map((post) => (
        <StreamPostCard
          key={post.id}
          post={post}
          onChange={replace}
          sendComment={(body) => addStaffComment(post.id, body)}
          deleteComment={(comment) =>
            deleteStaffComment(comment.id).then(() => ({
              ...post,
              comments: post.comments.filter((c) => c.id !== comment.id),
            }))
          }
          canDelete={() => canPost}
          tools={
            canPost ? (
              <View style={styles.tools}>
                <Button
                  compact
                  variant="ghost"
                  label={post.pinned ? t("stream.unpin") : t("stream.pin")}
                  disabled={busy}
                  onPress={() => change(post, { pinned: !post.pinned })}
                  testID={`post-pin-${post.id}`}
                />
                <Button
                  compact
                  variant="ghost"
                  label={post.locked ? t("stream.unlock") : t("stream.lock")}
                  disabled={busy}
                  onPress={() => change(post, { locked: !post.locked })}
                  testID={`post-lock-${post.id}`}
                />
                <Button
                  compact
                  variant="ghost"
                  label={t("common.delete")}
                  disabled={busy}
                  onPress={() => {
                    setProblem(null);
                    setRemoving(post);
                  }}
                  testID={`post-delete-${post.id}`}
                />
              </View>
            ) : undefined
          }
        />
      ))}
    </View>
  );

  const write = canPost ? (
    <NewPost
      groupId={id}
      onPosted={(post) => {
        client.setQueryData<StreamPost[]>(key, (old) => [post, ...(old ?? [])]);
        void query.refetch();
      }}
    />
  ) : null;

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
          {write ? <View style={styles.wideWrite}>{write}</View> : null}
        </>
      ) : (
        <>
          {write}
          {list}
        </>
      )}
    </Screen>
  );
}

function NewPost({ groupId, onPosted }: { groupId: string; onPosted: (post: StreamPost) => void }) {
  const t = useTranslations();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    createStreamPost(groupId, { body: text, file, pinned })
      .then((post) => {
        setBody("");
        setFile(null);
        setPinned(false);
        onPosted(post);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="post-new">
      <Field
        label={t("stream.newPost")}
        placeholder={t("stream.placeholder")}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
        style={styles.body}
        testID="post-new-body"
      />
      <Attach file={file} onFile={setFile} disabled={busy} testID="post-new-file" />
      <Check
        label={t("stream.pinIt")}
        value={pinned}
        onChange={setPinned}
        disabled={busy}
        testID="post-new-pin"
      />
      {problem ? (
        <Notice tone="destructive" testID="post-new-problem">
          {problem}
        </Notice>
      ) : null}
      <Button
        label={busy && file ? t("groups.homework.uploading") : t("stream.post")}
        loading={busy}
        disabled={body.trim().length === 0}
        onPress={send}
        style={styles.start}
        testID="post-new-send"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideList: { flex: 3, gap: space[4] },
  wideWrite: { flex: 2 },
  list: { gap: space[4] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  tools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1] },
  body: { minHeight: 96, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
});
