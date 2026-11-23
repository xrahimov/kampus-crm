import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  AttendanceStatus,
  CheckingQueue,
  Group,
  GroupVideo,
  MonthGrid,
  Portal,
  StudentHome,
  Page,
  Today,
  TodayLesson,
  VideoRoom,
} from "./types";

/*
 * Every call the staff screens make, as hooks over one cache. A change is
 * shown at once and sent in the background; if the server refuses it, the
 * screen goes back to what the server last said and the caller shows why.
 */

export const keys = {
  today: (date: string | null) => ["today", date ?? "today"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["group", id] as const,
  month: (groupId: string, month: string) => ["group", groupId, "month", month] as const,
  video: (groupId: string) => ["group", groupId, "video"] as const,
  checking: ["checking"] as const,
};

/** One day of lessons; null asks the server for its own today. */
export function useToday(date: string | null) {
  return useQuery({
    queryKey: keys.today(date),
    queryFn: ({ signal }) => api<Today>(`/today${date ? `?date=${date}` : ""}`, { signal }),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: keys.groups,
    queryFn: ({ signal }) => api<Page<Group>>("/groups?pageSize=100&status=ACTIVE", { signal }),
  });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: keys.group(id),
    queryFn: ({ signal }) => api<Group>(`/groups/${id}`, { signal }),
  });
}

export function useMonthGrid(groupId: string, month: string, enabled = true) {
  return useQuery({
    queryKey: keys.month(groupId, month),
    queryFn: ({ signal }) =>
      api<MonthGrid>(`/groups/${groupId}/lessons?month=${month}`, { signal }),
    enabled,
  });
}

export function useGroupVideo(groupId: string, enabled = true) {
  return useQuery({
    queryKey: keys.video(groupId),
    queryFn: ({ signal }) => api<GroupVideo>(`/groups/${groupId}/video`, { signal }),
    enabled,
    // Whether the lesson is on changes without this phone doing anything.
    refetchInterval: 30_000,
  });
}

export function useCheckingQueue(enabled = true) {
  return useQuery({
    queryKey: keys.checking,
    queryFn: ({ signal }) => api<CheckingQueue>("/homework/queue", { signal }),
    enabled,
  });
}

/** Every cached day that holds this lesson, rewritten in place. */
function patchLesson(
  client: QueryClient,
  lessonId: string,
  change: (lesson: TodayLesson) => TodayLesson,
): Array<[readonly unknown[], Today | undefined]> {
  const before = client.getQueriesData<Today>({ queryKey: ["today"] });
  for (const [key, day] of before) {
    if (!day?.lessons.some((l) => l.id === lessonId)) continue;
    client.setQueryData<Today>(key, {
      ...day,
      lessons: day.lessons.map((l) => (l.id === lessonId ? change(l) : l)),
    });
  }
  return before;
}

function recount(lesson: TodayLesson): TodayLesson {
  return {
    ...lesson,
    marked: lesson.members.filter((m) => m.attendance !== "NOT_MARKED").length,
    present: lesson.members.filter((m) => m.attendance === "PRESENT").length,
  };
}

export interface AttendanceMark {
  membershipId: string;
  status: AttendanceStatus;
}

/** One tap on a name, or "All present": shown at once, sent behind it. */
export function useMarkAttendance(lesson: { id: string; groupId: string; date: string }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (marks: AttendanceMark[]) =>
      api<void>(`/lessons/${lesson.id}/attendance`, { method: "PUT", body: { marks } }),
    onMutate: async (marks) => {
      await client.cancelQueries({ queryKey: ["today"] });
      const byMember = new Map(marks.map((m) => [m.membershipId, m.status]));
      const before = patchLesson(client, lesson.id, (l) =>
        recount({
          ...l,
          members: l.members.map((m) => {
            const status = byMember.get(m.membershipId);
            return status ? { ...m, attendance: status } : m;
          }),
        }),
      );
      return { before };
    },
    onError: (_error, _marks, context) => {
      for (const [key, day] of context?.before ?? []) client.setQueryData(key, day);
    },
    onSettled: () => {
      void client.invalidateQueries({
        queryKey: keys.month(lesson.groupId, lesson.date.slice(0, 7)),
      });
    },
  });
}

/** The lesson's topic: typed, or the next one from the syllabus. */
export function useSetTopic(lesson: { id: string; groupId: string; date: string }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { topic?: string | null; courseTopicId?: string | null }) =>
      api<void>(`/lessons/${lesson.id}`, { method: "PATCH", body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["today"] }),
        client.invalidateQueries({ queryKey: keys.month(lesson.groupId, lesson.date.slice(0, 7)) }),
      ]),
  });
}

export function useSetHomework(lessonId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string }) =>
      api<void>(`/lessons/${lessonId}/homework`, { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["today"] }),
  });
}

/** One student's grade for one lesson; null clears it. */
export function useSetGrade(lesson: { id: string; groupId: string; date: string }) {
  const client = useQueryClient();
  const key = keys.month(lesson.groupId, lesson.date.slice(0, 7));
  return useMutation({
    mutationFn: (grade: { membershipId: string; score: number | null }) =>
      api<void>(`/lessons/${lesson.id}/grades`, { method: "PUT", body: { grades: [grade] } }),
    onMutate: async (grade) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<MonthGrid>(key);
      if (before) {
        client.setQueryData<MonthGrid>(key, {
          ...before,
          lessons: before.lessons.map((l) => {
            if (l.id !== lesson.id) return l;
            const grades = { ...l.grades };
            if (grade.score === null) delete grades[grade.membershipId];
            else grades[grade.membershipId] = { score: grade.score, comment: null };
            return { ...l, grades };
          }),
        });
      }
      return { before };
    },
    onError: (_error, _grade, context) => {
      if (context?.before) client.setQueryData(key, context.before);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

/** Accept or return one answer; it leaves the queue at once. */
export function useReviewAnswer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      homeworkId: string;
      membershipId: string;
      status: "ACCEPTED" | "RETURNED";
      teacherComment?: string | null;
    }) =>
      api<void>(`/homework/${input.homeworkId}/submissions/${input.membershipId}`, {
        method: "PATCH",
        body: { status: input.status, teacherComment: input.teacherComment ?? null },
      }),
    onSuccess: (_data, input) => {
      client.setQueryData<CheckingQueue>(keys.checking, (queue) =>
        queue
          ? {
              total: Math.max(0, queue.total - 1),
              items: queue.items.filter(
                (i) =>
                  !(i.homeworkId === input.homeworkId && i.membershipId === input.membershipId),
              ),
            }
          : queue,
      );
      void client.invalidateQueries({ queryKey: ["today"] });
    },
  });
}

/** Starts the group's lesson room, or answers with the one already on. */
export function useStartVideo(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string | null) =>
      api<VideoRoom>(`/groups/${groupId}/video`, { method: "POST", body: { lessonId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.video(groupId) }),
  });
}

/* ----- Students and parents ----- */

export function useStudentHome() {
  return useQuery({
    queryKey: ["student", "home"],
    queryFn: ({ signal }) => api<StudentHome>("/student-auth/home", { signal }),
    // "Lesson is on now" should appear without pulling the page down.
    refetchInterval: 60_000,
  });
}

/** One membership's page: the link's token is the key, as on the site. */
export function usePortal(token: string) {
  return useQuery({
    queryKey: ["student", "portal", token],
    queryFn: ({ signal }) =>
      api<{ portal: Portal }>(`/public/class/${encodeURIComponent(token)}/portal`, {
        signal,
        anonymous: true,
      }),
  });
}
