"use client";

import { useState } from "react";

import { StreamFeed } from "@/features/stream/stream-feed";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import type { StreamPostDto } from "@/server/services/stream/stream.service";

/** The group's stream on the student's page: read, comment, take a comment back (A-164). */
export function PortalStreamTab({ token, initial }: { token: string; initial: StreamPostDto[] }) {
  const [posts, setPosts] = useState(initial);
  const base = `/api/v1/public/class/${encodeURIComponent(token)}/stream`;
  const replace = (post: StreamPostDto) =>
    setPosts((list) => list.map((p) => (p.id === post.id ? post : p)));

  async function call(path: string, init: RequestInit): Promise<StreamPostDto> {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        response.status,
        payload?.error ?? { code: "INTERNAL", message: "errors.internal" },
      );
    }
    return (await response.json()) as StreamPostDto;
  }

  return (
    <StreamFeed
      posts={posts}
      testId="portal-stream"
      actions={{
        comment: async (postId, body) => {
          replace(
            await call(`${base}/${postId}/comments`, {
              method: "POST",
              body: JSON.stringify({ body }),
            }),
          );
        },
        canDeleteComment: (c) => c.mine,
        deleteComment: async (id) => {
          replace(await call(`${base}/comments/${id}`, { method: "DELETE" }));
        },
      }}
    />
  );
}
