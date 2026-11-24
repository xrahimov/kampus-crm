import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * What the group's page does around its lessons (A-262): an extra lesson, what
 * the students thought of a lesson, each student's own link to the video
 * lessons, and offering free seats to the people waiting for the course.
 */

export const groupLessonKeys = {
  ratings: (lessonId: string) => ["lesson", lessonId, "ratings"] as const,
  links: (groupId: string) => ["group", groupId, "links"] as const,
  waitlist: (groupId: string) => ["group", groupId, "waitlist"] as const,
};

/* ----- An extra lesson ----- */

export interface ExtraLessonInput {
  date: string;
  startTime: string;
  endTime: string;
}

/** A lesson outside the group's days. The month it lands in is read again. */
export function useAddExtraLesson(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ExtraLessonInput) =>
      api<{ id: string }>(`/groups/${groupId}/lessons/extra`, { method: "POST", body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["group", groupId, "month"] }),
        client.invalidateQueries({ queryKey: ["today"] }),
        client.invalidateQueries({ queryKey: ["timetable"] }),
      ]),
  });
}

/* ----- What the students thought of a lesson (A-168) ----- */

export interface LessonRatingRow {
  membershipId: string;
  fullName: string;
  /** One to five stars. */
  rating: number;
  comment: string | null;
  at: string;
}

export interface LessonRatings {
  lessonId: string;
  average: number | null;
  rows: LessonRatingRow[];
}

export function useLessonRatings(lessonId: string, enabled: boolean) {
  return useQuery({
    queryKey: groupLessonKeys.ratings(lessonId),
    queryFn: ({ signal }) => api<LessonRatings>(`/lessons/${lessonId}/ratings`, { signal }),
    enabled,
  });
}

/* ----- Each student's own link to the group's video lessons ----- */

export interface StudentLink {
  membershipId: string;
  studentId: string;
  fullName: string;
  phone: string | null;
  token: string;
}

export function useStudentLinks(groupId: string) {
  return useQuery({
    queryKey: groupLessonKeys.links(groupId),
    queryFn: ({ signal }) => api<StudentLink[]>(`/groups/${groupId}/video/links`, { signal }),
  });
}

/** A new link for one student; the old one stops working at once. */
export function useNewStudentLink(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      api<StudentLink>(`/memberships/${membershipId}/video-link`, { method: "POST" }),
    onSuccess: (next) => {
      client.setQueryData<StudentLink[]>(groupLessonKeys.links(groupId), (rows) =>
        rows?.map((row) => (row.membershipId === next.membershipId ? next : row)),
      );
    },
  });
}

export interface LinksSmsResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** Texts each student their link; `{link}` and `{studentName}` are filled in by the server. */
export function useSmsStudentLinks(groupId: string) {
  return useMutation({
    mutationFn: (text: string) =>
      api<LinksSmsResult>(`/groups/${groupId}/video/sms`, { method: "POST", body: { text } }),
  });
}

/* ----- Free seats offered to the waiting list (A-138) ----- */

export interface GroupWaitlist {
  waiting: number;
  /** Null when no lesson of the group has a room, so nobody knows how many fit. */
  freeSeats: number | null;
  /** The centre's "Waiting list offer" SMS is on. */
  smsActive: boolean;
  /** Who an offer would reach, first in line first. */
  next: Array<{ id: string; fullName: string; phone: string }>;
}

export interface WaitlistOffer {
  offered: number;
  sms: number;
  telegram: number;
}

export function useGroupWaitlist(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: groupLessonKeys.waitlist(groupId),
    queryFn: ({ signal }) => api<GroupWaitlist>(`/groups/${groupId}/waitlist`, { signal }),
    enabled,
    // Who is next changes as the office works: never an old list in the sheet.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useOfferSeats(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<WaitlistOffer>(`/groups/${groupId}/waitlist`, { method: "POST", body: {} }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: groupLessonKeys.waitlist(groupId) }),
        client.invalidateQueries({ queryKey: ["leads", "waitlist"] }),
      ]),
  });
}
