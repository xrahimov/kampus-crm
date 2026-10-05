"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import type { JoinDto, PeerDto } from "@/server/services/video/video.service";

import { CallEngine } from "./call-engine";
import { CallRoom } from "./call-room";
import { Lobby } from "./lobby";

const idle = { subscribe: () => () => undefined, getVersion: () => 0 };

type Outcome = "left" | "ended" | "gone" | "error";

/** Lobby → call → "you left" screen, shared by the staff page and a student's link. */
export function CallFlow({
  role,
  name,
  ready,
  waitingText,
  join,
  endForAll,
  doneActions,
}: {
  role: PeerDto["role"];
  name: string;
  ready: boolean;
  waitingText?: string;
  join: () => Promise<JoinDto>;
  /** Present when this person may end the call for everyone. */
  endForAll?: (roomId: string) => Promise<void>;
  /** Extra buttons on the closing screen, e.g. back to the group. */
  doneActions?: React.ReactNode;
}) {
  const t = useTranslations("video");
  const te = useTranslations();
  const [engine, setEngine] = useState<CallEngine | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store = engine ?? idle;
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);

  async function start(stream: MediaStream) {
    setBusy(true);
    setError(null);
    try {
      const self = await join();
      const next = new CallEngine(self, stream);
      next.start();
      setOutcome(null);
      setEngine(next);
    } catch (e) {
      for (const tr of stream.getTracks()) tr.stop();
      const key = e instanceof ApiError ? e.message : "errors.internal";
      setError(te.has(key) ? te(key) : te("errors.internal"));
      // The lobby reopens the camera when it mounts again.
      setOutcome("error");
    } finally {
      setBusy(false);
    }
  }

  const engineDone =
    engine && ["ended", "gone", "error"].includes(engine.status)
      ? (engine.status as Outcome)
      : null;
  const finished = engineDone ?? outcome;

  if (engine && !finished) {
    return (
      <CallRoom
        engine={engine}
        onLeave={() => {
          engine.leave();
          setEngine(null);
          setOutcome("left");
        }}
        onEndForAll={
          endForAll && engine.self.canEnd
            ? async () => {
                await endForAll(engine.self.roomId);
                engine.leave();
                setEngine(null);
                setOutcome("ended");
              }
            : undefined
        }
      />
    );
  }

  if (finished && finished !== "error") {
    return (
      <div className="space-y-4 text-center" data-testid="call-done">
        <h2 className="text-lg font-semibold">{t(`done.${finished}`)}</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {finished !== "ended" && (
            <Button
              variant="outline"
              onClick={() => {
                setEngine(null);
                setOutcome(null);
              }}
            >
              {t("done.rejoin")}
            </Button>
          )}
          {doneActions}
        </div>
      </div>
    );
  }

  return (
    <Lobby
      key={outcome ?? "first"}
      role={role}
      name={name}
      ready={ready}
      busy={busy}
      error={error ?? (engineDone === "error" ? t("done.error") : null)}
      joinLabel={t("lobby.join")}
      waitingText={waitingText}
      onJoin={(stream) => void start(stream)}
    />
  );
}
