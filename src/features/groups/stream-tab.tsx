"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { StreamFeed } from "@/features/stream/stream-feed";
import { api } from "@/lib/api-client";
import type { StreamPostDto } from "@/server/services/stream/stream.service";

/** Group → Stream: the teacher posts, pins, locks and answers; students' comments show here (A-164). */
export function GroupStreamTab({
  groupId,
  initial,
  canPost,
}: {
  groupId: string;
  initial: StreamPostDto[];
  canPost: boolean;
}) {
  const t = useTranslations();
  const [posts, setPosts] = useState(initial);
  const [deleting, setDeleting] = useState<StreamPostDto | null>(null);

  async function reload() {
    setPosts(await api<StreamPostDto[]>(`/groups/${groupId}/stream`));
  }
  const replace = (post: StreamPostDto) =>
    setPosts((list) => list.map((p) => (p.id === post.id ? post : p)));

  return (
    <>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("stream.deleteTitle")}
        description={t("stream.deleteText")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/stream/${deleting.id}`, { method: "DELETE" });
          await reload();
        }}
      />
      <StreamFeed
        posts={posts}
        testId="group-stream"
        actions={{
          post: canPost
            ? async (input) => {
                await api(`/groups/${groupId}/stream`, { method: "POST", body: input });
                await reload();
              }
            : undefined,
          comment: async (postId, body) => {
            replace(
              await api<StreamPostDto>(`/stream/${postId}/comments`, {
                method: "POST",
                body: { body },
              }),
            );
          },
          canDeleteComment: () => canPost,
          deleteComment: async (id) => {
            await api(`/stream/comments/${id}`, { method: "DELETE" });
            await reload();
          },
          togglePin: canPost
            ? async (post) => {
                replace(
                  await api<StreamPostDto>(`/stream/${post.id}`, {
                    method: "PUT",
                    body: { body: post.body, pinned: !post.pinned },
                  }),
                );
                await reload();
              }
            : undefined,
          toggleLock: canPost
            ? async (post) => {
                replace(
                  await api<StreamPostDto>(`/stream/${post.id}`, {
                    method: "PUT",
                    body: { body: post.body, locked: !post.locked },
                  }),
                );
              }
            : undefined,
          deletePost: canPost
            ? async (post) => {
                setDeleting(post);
              }
            : undefined,
        }}
      />
    </>
  );
}
