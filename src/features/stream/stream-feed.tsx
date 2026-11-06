"use client";

import { Lock, Paperclip, Pin, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { StreamPostDto } from "@/server/services/stream/stream.service";

export interface StreamActions {
  /** Staff only: a new post. */
  post?: (input: { body: string; pinned: boolean }) => Promise<void>;
  comment: (postId: string, body: string) => Promise<void>;
  /** Which comments the reader may remove: staff all of them, a student their own. */
  canDeleteComment: (comment: StreamPostDto["comments"][number]) => boolean;
  deleteComment: (commentId: string) => Promise<void>;
  /** Staff only. */
  togglePin?: (post: StreamPostDto) => Promise<void>;
  toggleLock?: (post: StreamPostDto) => Promise<void>;
  deletePost?: (post: StreamPostDto) => Promise<void>;
}

/**
 * The class stream (A-164): posts newest first with pinned ones on top, each
 * with its comments and a reply box. The same feed serves the group's tab and
 * the student's page; `actions` says what the reader may do.
 */
export function StreamFeed({
  posts,
  actions,
  testId = "stream",
}: {
  posts: StreamPostDto[];
  actions: StreamActions;
  testId?: string;
}) {
  const t = useTranslations("stream");
  return (
    <div className="space-y-4" data-testid={testId}>
      {actions.post && <Composer onPost={actions.post} />}
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
          {t("empty")}
        </p>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} actions={actions} />)
      )}
    </div>
  );
}

function Composer({ onPost }: { onPost: NonNullable<StreamActions["post"]> }) {
  const t = useTranslations("stream");
  const te = useTranslations();
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onPost({ body: body.trim(), pinned });
      setBody("");
      setPinned(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-lg border p-3"
      data-testid="stream-compose"
    >
      <Label htmlFor="stream-body">{t("newPost")}</Label>
      <Textarea
        id="stream-body"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("placeholder")}
        data-testid="stream-body"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={pinned}
            onCheckedChange={(v) => setPinned(v === true)}
            data-testid="stream-pinned"
          />
          {t("pinIt")}
        </label>
        <Button type="submit" size="sm" disabled={busy || !body.trim()} data-testid="stream-send">
          <Send /> {t("post")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {te.has(error) ? te(error) : te("errors.internal")}
        </p>
      )}
    </form>
  );
}

function PostCard({ post, actions }: { post: StreamPostDto; actions: StreamActions }) {
  const t = useTranslations("stream");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = (iso: string) => fmt(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await actions.comment(post.id, reply.trim());
      setReply("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="rounded-lg border"
      data-testid="stream-post"
      data-pinned={post.pinned}
      data-locked={post.locked}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{post.author ?? t("staff")}</span>
          <span className="text-xs text-muted-foreground">{when(post.createdAt)}</span>
          {post.pinned && (
            <Badge variant="secondary" data-testid="stream-pinned-badge">
              <Pin className="size-3" /> {t("pinned")}
            </Badge>
          )}
          {post.locked && (
            <Badge variant="outline" data-testid="stream-locked-badge">
              <Lock className="size-3" /> {t("locked")}
            </Badge>
          )}
        </div>
        {(actions.togglePin || actions.toggleLock || actions.deletePost) && (
          <div className="flex items-center gap-1">
            {actions.togglePin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void actions.togglePin!(post)}
                data-testid="stream-pin"
              >
                <Pin /> {post.pinned ? t("unpin") : t("pin")}
              </Button>
            )}
            {actions.toggleLock && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void actions.toggleLock!(post)}
                data-testid="stream-lock"
              >
                <Lock /> {post.locked ? t("unlock") : t("lock")}
              </Button>
            )}
            {actions.deletePost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void actions.deletePost!(post)}
                data-testid="stream-delete"
              >
                <Trash2 /> {te("common.delete")}
              </Button>
            )}
          </div>
        )}
      </header>
      <div className="space-y-3 px-3 py-3 text-sm">
        <p className="whitespace-pre-wrap" data-testid="stream-post-body">
          {post.body}
        </p>
        {post.attachmentUrl && (
          <a
            href={post.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs underline"
          >
            <Paperclip className="size-3" /> {t("file")}
          </a>
        )}
        {post.comments.length > 0 && (
          <ul className="space-y-2 border-l-2 pl-3" data-testid="stream-comments">
            {post.comments.map((c) => (
              <li key={c.id} className="text-sm" data-testid="stream-comment" data-mine={c.mine}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={c.byStaff ? "font-medium text-foreground" : "font-medium"}>
                    {c.author}
                  </span>
                  {c.byStaff && <Badge variant="outline">{t("staff")}</Badge>}
                  <span>{when(c.createdAt)}</span>
                  {actions.canDeleteComment(c) && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void actions.deleteComment(c.id)}
                      data-testid="stream-comment-delete"
                    >
                      {te("common.delete")}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {post.locked ? (
          <p className="text-xs text-muted-foreground" data-testid="stream-locked-note">
            {t("lockedNote")}
          </p>
        ) : (
          <form onSubmit={send} className="flex items-start gap-2">
            <Textarea
              rows={1}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t("replyPlaceholder")}
              aria-label={t("reply")}
              className="min-h-9"
              data-testid="stream-comment-input"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || !reply.trim()}
              data-testid="stream-comment-send"
            >
              <Send /> {t("reply")}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {te.has(error) ? te(error) : te("errors.internal")}
          </p>
        )}
      </div>
    </article>
  );
}
