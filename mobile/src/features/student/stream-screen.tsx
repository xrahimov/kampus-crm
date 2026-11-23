import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, Paperclip, Pin, Send } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { addStreamComment, deleteStreamComment, portalKeys, usePortalStream } from "@/api/portal";
import type { StreamComment, StreamPost } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { fileRoute } from "@/features/files/file-screen";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";

const COMMENT_MAX = 1000;

/**
 * The group's stream on the student's side, in the app (A-215): the teacher's
 * posts, pinned ones first, each with everyone's comments. A student writes a
 * comment and may take their own back; a post the teacher closed takes none.
 */
export function StreamScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const portal = usePortal(token);
  const query = usePortalStream(token);

  const header = (
    <Header back title={t("portal.tabs.stream")} subtitle={portal.data?.portal.group.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;

  // Every change answers with the whole post as it now stands.
  const replace = (post: StreamPost) =>
    client.setQueryData<StreamPost[]>(portalKeys.stream(token), (old) =>
      old?.map((p) => (p.id === post.id ? post : p)),
    );
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      {query.data.length === 0 ? <EmptyState title={t("stream.empty")} /> : null}
      {query.data.map((post) => (
        <Post key={post.id} token={token} post={post} onChange={replace} />
      ))}
    </Screen>
  );
}

function Post({
  token,
  post,
  onChange,
}: {
  token: string;
  post: StreamPost;
  onChange: (post: StreamPost) => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const router = useRouter();
  const formatDate = useDate();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const when = (iso: string) =>
    formatDate(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  const run = (work: Promise<StreamPost>, after?: () => void) => {
    setBusy(true);
    setProblem(null);
    work
      .then((next) => {
        onChange(next);
        after?.();
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };
  const send = () => {
    const body = draft.trim();
    if (!body || busy) return;
    run(addStreamComment(token, post.id, body), () => setDraft(""));
  };
  const ready = draft.trim().length > 0 && !busy;

  return (
    <Card testID={`post-${post.id}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="bodyStrong">{post.author ?? t("stream.staff")}</Text>
          <Text variant="small" tone="mutedForeground">
            {when(post.createdAt)}
          </Text>
        </View>
        {post.pinned ? (
          <View style={styles.mark} testID="post-pinned">
            <Pin size={14} color={colors.mutedForeground} />
            <Text variant="small" tone="mutedForeground">
              {t("stream.pinned")}
            </Text>
          </View>
        ) : null}
      </View>
      <Text testID="post-body">{post.body}</Text>
      {post.attachmentUrl ? (
        <Button
          compact
          variant="outline"
          label={t("stream.file")}
          icon={<Paperclip size={16} color={colors.foreground} />}
          onPress={() => router.push(fileRoute(post.attachmentUrl!, t("stream.file")))}
          style={styles.start}
          testID="post-file"
        />
      ) : null}
      {post.comments.length > 0 ? (
        <View style={[styles.comments, { borderLeftColor: colors.border }]}>
          {post.comments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              when={when(comment.createdAt)}
              busy={busy}
              onDelete={() => run(deleteStreamComment(token, comment.id))}
            />
          ))}
        </View>
      ) : null}
      {post.locked ? (
        <View style={styles.mark} testID="post-locked">
          <Lock size={14} color={colors.mutedForeground} />
          <Text variant="small" tone="mutedForeground" style={styles.fill}>
            {t("stream.lockedNote")}
          </Text>
        </View>
      ) : (
        <View style={styles.reply}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("stream.replyPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t("stream.reply")}
            multiline
            maxLength={COMMENT_MAX}
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.background,
                borderColor: colors.input,
              },
            ]}
            testID="post-comment-input"
          />
          <Pressable
            onPress={send}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel={t("stream.reply")}
            accessibilityState={{ disabled: !ready, busy }}
            style={[styles.send, { backgroundColor: ready ? colors.primary : colors.secondary }]}
            testID="post-comment-send"
          >
            <Send size={18} color={ready ? colors.primaryForeground : colors.mutedForeground} />
          </Pressable>
        </View>
      )}
      {problem ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

function Comment({
  comment,
  when,
  busy,
  onDelete,
}: {
  comment: StreamComment;
  when: string;
  busy: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations();
  return (
    <View style={styles.comment} testID={comment.mine ? "post-comment-mine" : "post-comment"}>
      <View style={styles.commentHead}>
        <Text variant="smallStrong">{comment.author}</Text>
        {comment.byStaff ? <Badge label={t("stream.staff")} /> : null}
        <Text variant="small" tone="mutedForeground">
          {when}
        </Text>
        {comment.mine ? (
          <Pressable
            onPress={onDelete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${t("common.delete")}: ${comment.body}`}
            hitSlop={10}
            testID="post-comment-delete"
          >
            <Text variant="small" tone="primary">
              {t("common.delete")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text>{comment.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[4] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  mark: { flexDirection: "row", alignItems: "center", gap: space[1] },
  start: { alignSelf: "flex-start" },
  comments: { gap: space[3], paddingLeft: space[3], borderLeftWidth: 2 },
  comment: { gap: 2 },
  commentHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  reply: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: font.regular,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
});
