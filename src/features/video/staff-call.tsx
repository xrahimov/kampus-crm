"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { JoinDto, VideoRoomDto } from "@/server/services/video/video.service";

import { CallFlow, type CallPhase } from "./call-flow";

export function StaffCall({ room, name }: { room: VideoRoomDto; name: string }) {
  const t = useTranslations("video");
  const [phase, setPhase] = useState<CallPhase>("lobby");
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
          {room.status !== "LIVE" || phase === "ended"
            ? t("done.ended")
            : phase === "lobby"
              ? t("staff.startedBy", { name: room.startedByName })
              : t("staff.live", { name: room.startedByName })}
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
            onPhase={setPhase}
          />
        ) : (
          back
        )}
      </CardContent>
    </Card>
  );
}
