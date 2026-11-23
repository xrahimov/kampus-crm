import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";

import { usePortal } from "@/api/hooks";
import { addStreamComment, deleteStreamComment, portalKeys, usePortalStream } from "@/api/portal";
import type { StreamPost } from "@/api/types";
import { Header } from "@/components/header";
import { EmptyState, Screen } from "@/components/surface";
import { PendingScreen } from "@/features/shared/pending-screen";
import { StreamPostCard } from "@/features/shared/stream-post";
import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

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
        <StreamPostCard
          key={post.id}
          post={post}
          onChange={replace}
          sendComment={(body) => addStreamComment(token, post.id, body)}
          deleteComment={(comment) => deleteStreamComment(token, comment.id)}
          canDelete={(comment) => comment.mine}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[4] },
});
