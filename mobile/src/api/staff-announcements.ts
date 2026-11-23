import { useInfiniteQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Announcement, Page } from "./types";

/*
 * Announcements on the staff side, in the app (A-221): the notices the person
 * may see, newest first, and a new one to one group. The same calls the
 * site's Announcements page makes.
 */

export const announcementKeys = { list: ["announcements"] as const };

const PAGE_SIZE = 20;

export function useAnnouncements(enabled = true) {
  return useInfiniteQuery({
    queryKey: announcementKeys.list,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<Announcement>>(`/announcements?pageSize=${PAGE_SIZE}&page=${pageParam}`, { signal }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled,
  });
}

/** A notice to one group: on the students' pages, in Telegram and, if asked, by SMS. */
export function postAnnouncement(input: {
  groupId: string;
  title: string;
  body: string;
  sendSms: boolean;
}): Promise<Announcement> {
  return api<Announcement>("/announcements", {
    method: "POST",
    body: { audience: "GROUP", ...input },
  });
}

export function deleteAnnouncement(id: string): Promise<void> {
  return api<void>(`/announcements/${id}`, { method: "DELETE" });
}
