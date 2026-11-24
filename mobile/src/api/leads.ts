import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page } from "./types";

/*
 * Leads in the app (A-232): the board, a lead's card with its contacts and
 * trial lessons, the day's calls, the waiting list and the inbox of chats.
 * The same calls the site's Leads pages make; nothing is new on the server.
 */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "UNREACHABLE", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];
export const LEAD_DAYS = ["ODD", "EVEN", "OTHER"] as const;
export type LeadDays = (typeof LEAD_DAYS)[number];
export const CONTACT_CHANNELS = ["CALL", "TELEGRAM", "SMS", "VISIT", "NOTE"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const LEAD_OUTCOMES = [
  "NO_ANSWER",
  "WILL_COME",
  "THINKING",
  "NOT_INTERESTED",
  "WRONG_NUMBER",
  "OTHER",
] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];
export const CALL_RANGES = ["DUE", "OVERDUE", "TODAY", "UPCOMING", "NONE"] as const;
export type CallRange = (typeof CALL_RANGES)[number];
export type TrialStatus = "BOOKED" | "ATTENDED" | "NO_SHOW" | "CONVERTED" | "CANCELLED";
/** What a person may be in a group they are added to from a lead or the waiting list. */
export const JOIN_STATUSES = ["NEW", "TRIAL", "ACTIVE"] as const;
export type JoinStatus = (typeof JOIN_STATUSES)[number];

export interface Lead {
  id: string;
  branchId: string;
  boardId: string;
  columnId: string;
  fullName: string;
  phones: string[];
  birthDate: string | null;
  age: number | null;
  sourceId: string | null;
  sourceName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  referrerId: string | null;
  referrerName: string | null;
  days: LeadDays | null;
  lessonTime: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  comment: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextContactAt: string | null;
  lastContactAt: string | null;
  lastOutcome: LeadOutcome | null;
  trial: {
    id: string;
    date: string;
    groupName: string;
    status: TrialStatus;
    token: string | null;
  } | null;
  sortOrder: number;
  isArchived: boolean;
  studentId: string | null;
  convertedAt: string | null;
  formName: string | null;
  createdAt: string;
}

export interface LeadBoard {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  leadCount: number;
}

export interface BoardColumn {
  id: string;
  name: string;
  sortOrder: number;
  /** Leads in the column that are not archived, before the filters. */
  total: number;
  leads: Lead[];
}

export interface BoardView {
  boards: LeadBoard[];
  board: LeadBoard | null;
  columns: BoardColumn[];
  /** Leads whose next contact is today or overdue. */
  due: number;
  today: string;
}

export interface LeadOptions {
  teachers: Array<{ id: string; fullName: string }>;
  sources: Array<{ id: string; name: string }>;
  lessonTimes: string[];
  owners: Array<{ id: string; fullName: string }>;
  groups: Array<{ id: string; name: string; branchId: string }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  waiting: number;
  unreadConversations: number;
  boards: Array<{
    id: string;
    name: string;
    branchId: string;
    columns: Array<{ id: string; name: string }>;
  }>;
}

export interface BoardFilters {
  boardId: string | null;
  q: string;
  /** A staff member's id, or "none" for leads nobody owns. */
  ownerId: string | null;
  archived: boolean;
}

export interface LeadInput {
  columnId: string;
  fullName: string;
  phones: string[];
  birthDate: string | null;
  age: number | null;
  sourceId: string | null;
  teacherId: string | null;
  ownerId: string | null;
  nextContactAt: string | null;
  days: LeadDays | null;
  lessonTime: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  comment: string | null;
}

export interface LeadContact {
  id: string;
  channel: ContactChannel;
  outcome: LeadOutcome | null;
  note: string | null;
  nextContactAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LeadContactInput {
  channel: ContactChannel;
  outcome: LeadOutcome | null;
  note: string | null;
  nextContactAt: string | null;
  status: LeadStatus | null;
}

export interface TrialBooking {
  id: string;
  leadId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  lessonId: string | null;
  startTime: string | null;
  date: string;
  status: TrialStatus;
  note: string | null;
  token: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface LeadCall extends Lead {
  boardName: string;
  columnName: string;
  branchName: string;
  lastContactBy: string | null;
  /** Days past the planned date (0 = today); null without a date or when it is ahead. */
  overdueDays: number | null;
}

export interface CallsSummary {
  overdue: number;
  today: number;
  upcoming: number;
  none: number;
}

export type CallsPage = Page<LeadCall> & { summary: CallsSummary; today: string };

export interface CallsFilters {
  range: CallRange;
  /** "me", "none", a staff member's id, or null for everyone. */
  ownerId: string | null;
  q: string;
}

export const WAITLIST_STATUSES = ["WAITING", "OFFERED", "ENROLLED", "DECLINED", "REMOVED"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export interface WaitlistEntry {
  id: string;
  branchId: string;
  branchName: string;
  courseId: string;
  courseName: string;
  leadId: string | null;
  studentId: string | null;
  fullName: string;
  phone: string;
  days: LeadDays | null;
  lessonTime: string | null;
  note: string | null;
  status: WaitlistStatus;
  /** The place in line among those waiting for the same course; null once offered or closed. */
  position: number | null;
  offeredGroup: { id: string; name: string } | null;
  offeredAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type WaitlistPage = Page<WaitlistEntry> & {
  summary: {
    waiting: number;
    offered: number;
    byCourse: Array<{ courseId: string; courseName: string; waiting: number }>;
  };
};

export interface WaitlistFilters {
  courseId: string | null;
  /** Null lists the open entries: waiting and offered. */
  status: WaitlistStatus | null;
  q: string;
}

export interface WaitlistInput {
  branchId: string;
  courseId: string;
  leadId?: string | null;
  fullName: string;
  phone: string;
  days: LeadDays | null;
  lessonTime: string | null;
  note: string | null;
}

export interface Conversation {
  id: string;
  channel: string;
  displayName: string;
  username: string | null;
  locale: string;
  unreadCount: number;
  isClosed: boolean;
  lastMessageAt: string;
  lastMessage: { direction: "IN" | "OUT"; text: string } | null;
  lead: {
    id: string;
    fullName: string;
    boardId: string;
    branchId: string;
    columnName: string;
    phones: string[];
    isArchived: boolean;
  } | null;
}

export interface ConversationMessage {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  sentByName: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ConversationMessage[];
}

export type InboxStatus = "open" | "closed" | "all";

export const leadKeys = {
  board: (filters: BoardFilters) => ["leads", "board", filters] as const,
  options: ["leads", "options"] as const,
  sources: (from: string | null, to: string | null) => ["leads", "sources", from, to] as const,
  contacts: (id: string) => ["leads", "contacts", id] as const,
  trials: (id: string) => ["leads", "trials", id] as const,
  calls: (filters: CallsFilters) => ["leads", "calls", filters] as const,
  waitlist: (filters: WaitlistFilters) => ["leads", "waitlist", filters] as const,
  courseGroups: (courseId: string) => ["leads", "course-groups", courseId] as const,
  inbox: (status: InboxStatus, q: string) => ["leads", "inbox", status, q] as const,
  conversation: (id: string) => ["leads", "conversation", id] as const,
};

function query(pairs: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(pairs)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** The board with its columns and the leads the filters leave. */
export function useBoard(filters: BoardFilters) {
  return useQuery({
    queryKey: leadKeys.board(filters),
    queryFn: ({ signal }) =>
      api<BoardView>(
        `/leads${query({
          boardId: filters.boardId,
          q: filters.q,
          ownerId: filters.ownerId,
          archived: filters.archived,
        })}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}

/** What the lead forms choose from, and the numbers on the board's buttons. */
export function useLeadOptions(enabled = true) {
  return useQuery({
    queryKey: leadKeys.options,
    queryFn: ({ signal }) => api<LeadOptions>("/leads/options", { signal }),
    enabled,
  });
}

function useLeadsChanged() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["leads"] });
}

export function useSaveLead(id: string | null) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: LeadInput) =>
      id
        ? api<Lead>(`/leads/${id}`, { method: "PATCH", body: input })
        : api<Lead>("/leads", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export type BulkLeadAction =
  { action: "move"; columnId: string } | { action: "archive" } | { action: "restore" };

/** The ticked leads together (A-259): moved to a column, archived or brought back. */
export function useBulkLeads() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: BulkLeadAction & { leadIds: string[] }) =>
      api<{ done: number; skipped: number }>("/leads/bulk", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

/*
 * The board's own set-up (A-258): boards, their columns and the sources leads
 * come from, as the site's Leads page and its Sources report have them.
 */

/** Renames a board, or makes a new one in a branch (it starts with one column). */
export function useSaveBoard(id: string | null) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: { name: string; branchId?: string | null }) =>
      id
        ? api<LeadBoard>(`/lead-boards/${id}`, { method: "PATCH", body: { name: input.name } })
        : api<LeadBoard>("/lead-boards", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

/** Deletes a board; the server keeps one that still has leads or takes a form's leads. */
export function useDeleteBoard() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/lead-boards/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Renames a column, or adds one at the end of a board. */
export function useSaveColumn(target: { boardId: string } | { columnId: string } | null) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (name: string): Promise<unknown> => {
      if (!target) return Promise.resolve(null);
      return "columnId" in target
        ? api(`/lead-columns/${target.columnId}`, { method: "PATCH", body: { name } })
        : api(`/lead-boards/${target.boardId}/columns`, { method: "POST", body: { name } });
    },
    onSuccess: changed,
  });
}

/** Deletes a column; the server keeps a board's last one and one that still has leads. */
export function useDeleteColumn() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/lead-columns/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

export interface LeadSource {
  id: string;
  name: string;
  isActive: boolean;
  /** Leads, archived ones too, that came in the chosen days. */
  leadCount: number;
  /** Students who name this source. */
  studentCount: number;
}

/** The sources with how many leads each brought between two days (either may be open). */
export function useSources(from: string | null, to: string | null) {
  return useQuery({
    queryKey: leadKeys.sources(from, to),
    queryFn: ({ signal }) => api<LeadSource[]>(`/lead-sources${query({ from, to })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useSaveSource(id: string | null) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: { name: string; isActive: boolean }) =>
      id
        ? api<LeadSource>(`/lead-sources/${id}`, { method: "PATCH", body: input })
        : api<LeadSource>("/lead-sources", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useDeleteSource() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/lead-sources/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

export type LeadAction =
  | { kind: "move"; columnId: string }
  | { kind: "archive" }
  | { kind: "restore" }
  | { kind: "delete" };

/** Moves a lead to another column, archives it, brings it back or deletes it. */
export function useLeadAction(id: string) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (action: LeadAction): Promise<unknown> => {
      switch (action.kind) {
        case "move":
          return api<Lead>(`/leads/${id}/move`, {
            method: "POST",
            body: { columnId: action.columnId },
          });
        case "archive":
          return api<Lead>(`/leads/${id}/archive`, { method: "POST" });
        case "restore":
          return api<Lead>(`/leads/${id}/restore`, { method: "POST" });
        case "delete":
          return api<void>(`/leads/${id}`, { method: "DELETE" });
      }
    },
    onSuccess: changed,
  });
}

export function useLeadContacts(id: string | null) {
  return useQuery({
    queryKey: leadKeys.contacts(id ?? ""),
    queryFn: ({ signal }) => api<LeadContact[]>(`/leads/${id}/contacts`, { signal }),
    enabled: id !== null,
  });
}

export function useLeadTrials(id: string | null) {
  return useQuery({
    queryKey: leadKeys.trials(id ?? ""),
    queryFn: ({ signal }) => api<TrialBooking[]>(`/leads/${id}/trials`, { signal }),
    enabled: id !== null,
  });
}

/** "Log a contact": the outcome moves the status and sets the next date. */
export function useLogLeadContact(id: string) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: LeadContactInput) =>
      api<LeadContact>(`/leads/${id}/contacts`, { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useBookTrial(id: string) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: { groupId: string; date: string; note: string | null }) =>
      api<TrialBooking>(`/leads/${id}/trials`, { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useCancelTrial() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api<TrialBooking>(`/leads/trials/${bookingId}`, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      }),
    onSuccess: changed,
  });
}

/** The lead becomes a student of the group; the lead is archived with a link to the student. */
export function useLeadToGroup(id: string) {
  return useLeadsToGroup([id]);
}

/** The ticked leads become students of one group (A-259); those already in it are skipped. */
export function useLeadsToGroup(leadIds: string[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; joinedAt: string; status: JoinStatus }) =>
      api<{ added: number; skipped: number }>("/leads/add-to-group", {
        method: "POST",
        body: { leadIds, ...input },
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["leads"] }),
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
      ]),
  });
}

/** "Calls today": whose leads and which next-contact dates, a page at a time. */
export function useCalls(filters: CallsFilters) {
  return useInfiniteQuery({
    queryKey: leadKeys.calls(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<CallsPage>(
        `/leads/calls${query({
          range: filters.range,
          ownerId: filters.ownerId,
          q: filters.q,
          page: pageParam,
        })}`,
        { signal },
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useWaitlist(filters: WaitlistFilters) {
  return useInfiniteQuery({
    queryKey: leadKeys.waitlist(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<WaitlistPage>(
        `/waitlist${query({
          courseId: filters.courseId,
          status: filters.status,
          q: filters.q,
          page: pageParam,
        })}`,
        { signal },
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useSaveWaitlistEntry(id: string | null) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (input: WaitlistInput) => {
      if (!id) return api<WaitlistEntry>("/waitlist", { method: "POST", body: input });
      // The branch and the lead of an entry do not change.
      const { branchId: _branch, leadId: _lead, ...change } = input;
      return api<WaitlistEntry>(`/waitlist/${id}`, { method: "PATCH", body: change });
    },
    onSuccess: changed,
  });
}

/** Back to waiting, declined by the person, or taken off the list. */
export function useWaitlistStatus() {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (what: { id: string; status: "WAITING" | "DECLINED" | "REMOVED" }) =>
      api<WaitlistEntry>(`/waitlist/${what.id}`, {
        method: "PATCH",
        body: { status: what.status },
      }),
    onSuccess: changed,
  });
}

/** The groups of one course, for enrolling someone from the waiting list. */
export function useCourseGroups(courseId: string | null) {
  return useQuery({
    queryKey: leadKeys.courseGroups(courseId ?? ""),
    queryFn: ({ signal }) =>
      api<Page<{ id: string; name: string; branchId: string; status: string }>>(
        `/groups?courseId=${courseId}&status=ALL&pageSize=100`,
        { signal },
      ),
    enabled: courseId !== null,
  });
}

export function useEnrolFromWaitlist(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; joinedAt: string; status: JoinStatus }) =>
      api<WaitlistEntry>(`/waitlist/${id}/enrol`, { method: "POST", body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["leads"] }),
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
      ]),
  });
}

/** Leads → Inbox: the chats with the centre's bot, open ones by default. */
export function useInbox(status: InboxStatus, q: string) {
  return useQuery({
    queryKey: leadKeys.inbox(status, q),
    queryFn: ({ signal }) => api<Conversation[]>(`/leads/inbox${query({ status, q })}`, { signal }),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** One chat with its messages; reading it clears its unread mark. The open thread asks again by itself. */
export function useConversation(id: string) {
  return useQuery({
    queryKey: leadKeys.conversation(id),
    queryFn: ({ signal }) => api<ConversationDetail>(`/leads/inbox/${id}`, { signal }),
  });
}

export function useReply(id: string) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (text: string) =>
      api<ConversationMessage>(`/leads/inbox/${id}/messages`, { method: "POST", body: { text } }),
    onSuccess: changed,
  });
}

export function useCloseConversation(id: string) {
  const changed = useLeadsChanged();
  return useMutation({
    mutationFn: (closed: boolean) =>
      api<Conversation>(`/leads/inbox/${id}`, { method: "PATCH", body: { closed } }),
    onSuccess: changed,
  });
}
