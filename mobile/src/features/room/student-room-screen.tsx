import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { JoinDto } from "@kampus/lib/video/dto";

import { RoomFlow } from "./room-flow";

/** What the student's link says about the lesson (video.service.ts, ClassPageDto). */
interface ClassPage {
  organizationName: string;
  groupName: string;
  studentName: string;
  enabled: boolean;
  /** The group's room while a lesson is on. */
  roomId: string | null;
}

/**
 * A student's way into the lesson (A-207). Their personal link is the key, as
 * on the site: the app asks every few seconds whether the teacher has started,
 * and lets the student in as soon as they have.
 */
export function StudentRoomScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const path = `/public/class/${encodeURIComponent(token)}`;
  const page = useQuery({
    queryKey: ["student", "class-page", token],
    queryFn: ({ signal }) => api<ClassPage>(path, { signal, anonymous: true }),
    // Waiting for the teacher: look again soon.
    refetchInterval: (query) => (query.state.data?.roomId ? 20_000 : 4_000),
  });
  const data = page.data;

  return (
    <RoomFlow
      role="STUDENT"
      name={data?.studentName ?? ""}
      title={data?.groupName ?? t("video.title")}
      ready={Boolean(data?.enabled && data.roomId)}
      waitingText={
        data && !data.enabled ? t("video.class.disabled") : data ? t("video.class.waiting") : ""
      }
      join={() => api<JoinDto>(path, { method: "POST", anonymous: true })}
    />
  );
}
