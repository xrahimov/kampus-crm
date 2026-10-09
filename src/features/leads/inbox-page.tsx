"use client";

import { Check, Copy, ExternalLink, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import { INBOX_STATUSES, type InboxFilters } from "@/lib/validation/leads";
import type {
  ConversationDetailDto,
  ConversationDto,
  ConversationMessageDto,
} from "@/server/services/leads/inbox.service";

/** How often the inbox asks for new messages while it is open. */
const POLL_MS = 10_000;

/**
 * Leads → Inbox (A-146): chats with prospective students who wrote to the
 * centre's bot. The list on the left, the chat and the answer box on the right.
 */
export function InboxPage({
  initial,
  filters,
  chatLink,
  initialId,
  canUpdate,
}: {
  initial: ConversationDto[];
  filters: InboxFilters;
  chatLink: string | null;
  /** `?c=`: the chat a notification pointed at. */
  initialId: string | null;
  canUpdate: boolean;
}) {
  const t = useTranslations("leads.inbox");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [status, setStatus] = useState(filters.status);
  const [items, setItems] = useState(initial);
  // Nothing is opened by itself: opening marks a chat read, and that is the reader's act.
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<ConversationDetailDto | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const reloadList = useCallback(
    async (nextStatus = status) => {
      try {
        const list = await api<ConversationDto[]>(`/leads/inbox?status=${nextStatus}`);
        setItems(list);
      } catch {
        /* the next poll tries again */
      }
    },
    [status],
  );

  const loadDetail = useCallback(
    (id: string) =>
      api<ConversationDetailDto>(`/leads/inbox/${id}`)
        .then((next) => {
          setDetail(next);
          setItems((list) => list.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
        })
        .catch(() => setDetail(null)),
    [],
  );

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const timer = setInterval(() => {
      void reloadList();
      if (selectedId) void loadDetail(selectedId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reloadList, loadDetail, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  async function send() {
    if (!selectedId || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const message = await api<ConversationMessageDto>(`/leads/inbox/${selectedId}/messages`, {
        method: "POST",
        body: { text: draft.trim() },
      });
      setDraft("");
      setDetail((d) => (d ? { ...d, messages: [...d.messages, message] } : d));
      await reloadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  async function setClosed(closed: boolean) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api<ConversationDto>(`/leads/inbox/${selectedId}`, {
        method: "PATCH",
        body: { closed },
      });
      await reloadList();
      await loadDetail(selectedId);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!chatLink) return;
    try {
      await navigator.clipboard.writeText(chatLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is visible to copy by hand */
    }
  }

  const when = (iso: string) => fmt(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const shown = detail && detail.conversation.id === selectedId ? detail : null;
  const conversation = shown?.conversation ?? items.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4" data-testid="lead-inbox">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/leads">{te("leads.title")}</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <MessageCircle className="size-4 text-muted-foreground" />
          {chatLink ? (
            <>
              <span className="text-muted-foreground">{t("linkLabel")}</span>
              <a
                href={chatLink}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs break-all underline"
                data-testid="inbox-link"
              >
                {chatLink}
              </a>
              <Button variant="ghost" size="sm" onClick={copyLink} aria-label={t("copy")}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground" data-testid="inbox-no-bot">
              {t("noBot")}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardContent className="p-0">
            <div className="flex gap-1 border-b p-2" role="tablist">
              {INBOX_STATUSES.map((s) => (
                <Button
                  key={s}
                  variant={status === s ? "secondary" : "ghost"}
                  size="sm"
                  role="tab"
                  aria-selected={status === s}
                  onClick={() => {
                    setStatus(s);
                    void reloadList(s);
                  }}
                  data-testid={`inbox-status-${s}`}
                >
                  {t(`status.${s}`)}
                </Button>
              ))}
            </div>
            {items.length === 0 ? (
              <EmptyState title={t("empty")} hint={t("emptyHint")} />
            ) : (
              <ul className="max-h-[70vh] divide-y overflow-y-auto">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted/60",
                        selectedId === c.id && "bg-muted",
                      )}
                      data-testid="inbox-conversation"
                      data-unread={c.unreadCount > 0}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate", c.unreadCount > 0 && "font-semibold")}>
                          {c.lead?.fullName ?? c.displayName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {when(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {c.lastMessage
                            ? `${c.lastMessage.direction === "OUT" ? t("you") + ": " : ""}${c.lastMessage.text}`
                            : t("noMessages")}
                        </span>
                        {c.unreadCount > 0 && (
                          <Badge variant="default" data-testid="inbox-unread">
                            {c.unreadCount}
                          </Badge>
                        )}
                        {c.isClosed && <Badge variant="muted">{t("closed")}</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex min-h-[50vh] flex-col p-0">
            {!conversation ? (
              <EmptyState title={t("pick")} />
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                  <div className="min-w-0">
                    <p className="font-medium" data-testid="inbox-title">
                      {conversation.lead?.fullName ?? conversation.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conversation.channel === "TELEGRAM" ? "Telegram" : "Instagram"}
                      {conversation.username ? ` · @${conversation.username}` : ""}
                      {conversation.lead?.phones[0] ? ` · ${conversation.lead.phones[0]}` : ""}
                      {conversation.lead ? ` · ${conversation.lead.columnName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversation.lead && (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/leads?board=${conversation.lead.boardId}&q=${encodeURIComponent(conversation.lead.fullName)}${conversation.lead.isArchived ? "&archived=true" : ""}`}
                          data-testid="inbox-open-lead"
                        >
                          <ExternalLink /> {t("openLead")}
                        </Link>
                      </Button>
                    )}
                    {canUpdate && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setClosed(!conversation.isClosed)}
                        data-testid="inbox-close"
                      >
                        {conversation.isClosed ? t("reopen") : t("close")}
                      </Button>
                    )}
                  </div>
                </header>
                <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="inbox-messages">
                  {shown?.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.direction === "OUT" ? "justify-end" : "justify-start",
                      )}
                      data-testid="inbox-message"
                      data-direction={m.direction}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          m.direction === "OUT" ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            m.direction === "OUT"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground",
                          )}
                        >
                          {m.sentByName ? `${m.sentByName} · ` : ""}
                          {when(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                {canUpdate && (
                  <form
                    className="flex items-end gap-2 border-t p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={t("replyPlaceholder")}
                      rows={2}
                      className="min-h-0 flex-1"
                      data-testid="inbox-reply"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <Button type="submit" disabled={busy || !draft.trim()} data-testid="inbox-send">
                      <Send /> {t("send")}
                    </Button>
                  </form>
                )}
                {error && (
                  <p className="px-3 pb-3 text-sm text-destructive" role="alert">
                    {error.startsWith("errors.") ? te(error) : error}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
