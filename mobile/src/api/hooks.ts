import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, apiForm, type PickedFile } from "@/lib/api";

import type {
  AttendanceStatus,
  CheckingQueue,
  Group,
  GroupVideo,
  MonthGrid,
  Portal,
  PortalHomework,
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

/** The lesson as the cache holds it this instant, ahead of the screen's next draw. */
function cachedLesson(client: QueryClient, lessonId: string): TodayLesson | undefined {
  for (const [, day] of client.getQueriesData<Today>({ queryKey: ["today"] })) {
    const found = day?.lessons.find((l) => l.id === lessonId);
    if (found) return found;
  }
  return undefined;
}

/**
 * One tap on a name, or "All present". The mark is written to the cache in the
 * same instant as the tap, before anything is sent, so two quick taps never
 * work from a stale list: "All present" right after "Excused" leaves the
 * excused student alone. A refusal puts back what the server last said.
 */
export function useMarkAttendance(lesson: { id: string; groupId: string; date: string }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (marks: AttendanceMark[]) =>
      api<void>(`/lessons/${lesson.id}/attendance`, { method: "PUT", body: { marks } }),
    onSettled: () => {
      void client.invalidateQueries({
        queryKey: keys.month(lesson.groupId, lesson.date.slice(0, 7)),
      });
    },
  });

  const send = (marks: AttendanceMark[], onError: (error: unknown) => void) => {
    if (marks.length === 0) return;
    // A reload already on its way would overwrite the mark with the old state.
    void client.cancelQueries({ queryKey: ["today"] });
    const byMember = new Map(marks.map((m) => [m.membershipId, m.status]));
    patchLesson(client, lesson.id, (l) =>
      recount({
        ...l,
        members: l.members.map((m) => {
          const status = byMember.get(m.membershipId);
          return status ? { ...m, attendance: status } : m;
        }),
      }),
    );
    mutation.mutate(marks, {
      onError: (error) => {
        // Other marks may have been made since; the server's list is the truth.
        void client.invalidateQueries({ queryKey: ["today"] });
        onError(error);
      },
    });
  };

  return {
    /** One student's mark; the chosen mark again clears it, as on the site. */
    toggle(membershipId: string, status: AttendanceStatus, onError: (error: unknown) => void) {
      const now = cachedLesson(client, lesson.id)?.members.find(
        (m) => m.membershipId === membershipId,
      );
      send([{ membershipId, status: now?.attendance === status ? "NOT_MARKED" : status }], onError);
    },
    /** Everyone still unmarked becomes present; marks already made stay. */
    allPresent(onError: (error: unknown) => void) {
      const members = cachedLesson(client, lesson.id)?.members ?? [];
      send(
        members
          .filter((m) => m.attendance === "NOT_MARKED")
          .map((m) => ({ membershipId: m.membershipId, status: "PRESENT" as const })),
        onError,
      );
    },
  };
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

/** The homework of one membership, newest first, each with the student's own answer. */
export function usePortalHomework(token: string) {
  return useQuery({
    queryKey: ["student", "homework", token],
    queryFn: ({ signal }) =>
      api<PortalHomework[]>(`/public/class/${encodeURIComponent(token)}/homework`, {
        signal,
        anonymous: true,
      }),
  });
}

/** Hands in an answer: a note, a file, or both. The lists that show homework are read again. */
export function useSubmitHomework(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answer: { homeworkId: string; note: string; file: PickedFile | null }) =>
      apiForm<void>(
        `/public/class/${encodeURIComponent(token)}/homework/${answer.homeworkId}`,
        { note: answer.note },
        answer.file,
        { anonymous: true },
      ),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["student", "homework", token] }),
        client.invalidateQueries({ queryKey: ["student", "home"] }),
      ]),
  });
}
