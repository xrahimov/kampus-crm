"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { JoinDto, VideoRoomDto } from "@/server/services/video/video.service";

import { CallFlow } from "./call-flow";

export function StaffCall({ room, name }: { room: VideoRoomDto; name: string }) {
  const t = useTranslations("video");
  const back = (
    <Button asChild variant="outline">
      <Link href={`/groups/${room.groupId}`}>
        <ArrowLeft /> {t("backToGroup")}
      </Link>
    </Button>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{room.groupName}</CardTitle>
        <CardDescription>
          {room.status === "LIVE"
            ? t("staff.startedBy", { name: room.startedByName })
            : t("done.ended")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {room.status === "LIVE" ? (
          <CallFlow
            role="HOST"
            name={name}
            ready
            join={() => api<JoinDto>(`/video/rooms/${room.id}/join`, { method: "POST" })}
            endForAll={(id) => api(`/video/rooms/${id}/end`, { method: "POST" })}
            doneActions={back}
          />
        ) : (
          back
        )}
      </CardContent>
    </Card>
  );
}
