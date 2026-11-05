"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BREAKOUT_MAX_ROOMS, NOTICE_MAX_LENGTH } from "@/lib/validation/video";
import { cn } from "@/lib/utils";

import type { CallEngine } from "./call-engine";

const ROOM_CHOICES = [2, 3, 4, 5, 6].filter((n) => n <= BREAKOUT_MAX_ROOMS);
const MINUTE_CHOICES = [5, 10, 15, 20, 30] as const;

/**
 * The teacher's breakout rooms panel (A-156): split the class into sub-rooms
 * for a while, move people, drop in on a room, send a line to everyone and
 * bring everyone back.
 */
export function BreakoutPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.breakout");
  const tr = useTranslations("video.roles");
  const [rooms, setRooms] = useState(2);
  const [minutes, setMinutes] = useState<number | null>(10);
  const [notice, setNotice] = useState("");
  const breakout = engine.breakout;
  const everyone = breakout.everyone ?? [];
  const open = breakout.rooms > 0;

  const start = () => {
    // Students round-robin into the rooms; staff stay in the main room with the teacher.
    const students = everyone.filter((p) => p.role === "STUDENT");
    const assign = students.map((p, i) => ({ id: p.id, room: (i % rooms) + 1 }));
    engine.startBreakout(rooms, minutes, assign);
  };

  const field =
    "rounded-md border border-sidebar bg-sidebar px-2 py-1 text-sm text-white focus-visible:outline-2 focus-visible:outline-sidebar-active";

  return (
    <div className="space-y-4 text-sm" data-testid="breakout-body">
      {!open ? (
        <div className="space-y-3">
          <p className="text-xs opacity-70">{t("intro")}</p>
          <label className="flex items-center justify-between gap-2">
            <span>{t("rooms")}</span>
            <select
              value={rooms}
              onChange={(e) => setRooms(Number(e.target.value))}
              className={field}
              data-testid="breakout-rooms"
            >
              {ROOM_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t("minutes")}</span>
            <select
              value={minutes ?? ""}
              onChange={(e) => setMinutes(e.target.value === "" ? null : Number(e.target.value))}
              className={field}
              data-testid="breakout-minutes"
            >
              {MINUTE_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {t("min", { count: n })}
                </option>
              ))}
              <option value="">{t("untilClosed")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={start}
            disabled={everyone.filter((p) => p.role === "STUDENT").length === 0}
            className="w-full rounded-md bg-sidebar-active px-3 py-2 text-sm font-medium text-white hover:bg-sidebar-active/80 disabled:opacity-40"
            data-testid="breakout-start"
          >
            {t("start", { rooms })}
          </button>
          {everyone.filter((p) => p.role === "STUDENT").length === 0 && (
            <p className="text-xs opacity-60">{t("noStudents")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <RoomList engine={engine} />
          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              engine.sendNotice(notice);
              setNotice("");
            }}
          >
            <input
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              maxLength={NOTICE_MAX_LENGTH}
              placeholder={t("noticePlaceholder")}
              aria-label={t("notice")}
              className={cn(field, "w-full")}
              data-testid="breakout-notice"
            />
            <button
              type="submit"
              disabled={!notice.trim()}
              aria-label={t("sendNotice")}
              title={t("sendNotice")}
              className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-active text-white hover:bg-sidebar-active/80 disabled:opacity-40"
              data-testid="breakout-notice-send"
            >
              <Megaphone className="size-4" />
            </button>
          </form>
          <button
            type="button"
            onClick={() => engine.endBreakout()}
            className="w-full rounded-md border border-sidebar px-3 py-2 text-sm hover:bg-sidebar"
            data-testid="breakout-end"
          >
            {t("end")}
          </button>
        </div>
      )}
      <p className="text-xs opacity-60">{t("hint", { role: tr("STAFF") })}</p>
    </div>
  );
}

function RoomList({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.breakout");
  const breakout = engine.breakout;
  const everyone = breakout.everyone ?? [];
  const self = engine.self.participantId;
  const roomNumbers = [null, ...Array.from({ length: breakout.rooms }, (_, i) => i + 1)];
  return (
    <ul className="space-y-2" data-testid="breakout-list">
      {roomNumbers.map((room) => {
        const members = everyone.filter((p) => p.room === room);
        const here = breakout.mine === room;
        return (
          <li key={room ?? 0} className="rounded-md border border-sidebar p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">
                {room === null ? t("mainRoom") : t("room", { number: room })}
                <span className="ml-1.5 text-xs font-normal opacity-60">{members.length}</span>
              </span>
              {here ? (
                <span className="text-xs text-sidebar-active">{t("youAreHere")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => engine.moveToRoom(self, room)}
                  className="rounded-md px-2 py-1 text-xs hover:bg-sidebar"
                  data-testid="breakout-visit"
                >
                  {t("visit")}
                </button>
              )}
            </div>
            {members.filter((m) => m.id !== self).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {members
                  .filter((m) => m.id !== self)
                  .map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{m.displayName}</span>
                      <select
                        value={m.room ?? ""}
                        onChange={(e) =>
                          engine.moveToRoom(
                            m.id,
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                        aria-label={t("moveTo", { name: m.displayName })}
                        className="rounded-md border border-sidebar bg-sidebar px-1 py-0.5 text-xs text-white"
                      >
                        <option value="">{t("mainRoom")}</option>
                        {Array.from({ length: breakout.rooms }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {t("room", { number: n })}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Minutes and seconds until a breakout closes, re-rendered by the caller. */
export function breakoutCountdown(endsAt: string | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
