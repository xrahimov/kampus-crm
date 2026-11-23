import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { keys } from "@/api/hooks";
import type { VideoRoom } from "@/api/types";
import { api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import type { JoinDto } from "@kampus/lib/video/dto";

import { RoomFlow } from "./room-flow";

/**
 * A teacher's (or another staff member's) way into a group's lesson room
 * (A-207). The room was started from the lesson's card; this screen checks
 * camera and microphone and goes in.
 */
export function StaffRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const me = useMe();
  const client = useQueryClient();
  const roomQuery = useQuery({
    queryKey: ["video-room", id],
    queryFn: ({ signal }) => api<VideoRoom>(`/video/rooms/${id}`, { signal }),
  });
  const group = roomQuery.data;

  return (
    <RoomFlow
      // The server decides between the lesson's teacher and a guest when the person joins;
      // both send the sharper picture.
      role="HOST"
      name={me.user.fullName}
      title={group?.groupName ?? t("video.title")}
      ready
      join={() => api<JoinDto>(`/video/rooms/${id}/join`, { method: "POST" })}
      groupId={group?.groupId}
      endForAll={async (roomId) => {
        await api(`/video/rooms/${roomId}/end`, { method: "POST" });
        if (group) await client.invalidateQueries({ queryKey: keys.video(group.groupId) });
      }}
    />
  );
}
