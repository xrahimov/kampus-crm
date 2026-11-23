import type { Reaction } from "../validation/video";
import { canAnnotate } from "../video-material";

import type { PeerDto, StageDto, VideoPeerRole } from "./dto";

/*
 * Who is shown where in a lesson room, worked out from what the engine knows.
 * The site's room and the phone app's room (A-207) both ask here, so the two
 * cannot disagree about who is on the stage.
 */

/** The id this participant's own tile goes by. */
export const SELF = "self";
/** The stage keys of the whiteboard and of a shown material. */
export const BOARD = "board";
export const MATERIAL = "material";

/** How each reaction looks on a picture. */
export const REACTION_EMOJI: Record<Reaction, string> = {
  like: "👍",
  clap: "👏",
  heart: "❤️",
  laugh: "😂",
  wow: "😮",
  slower: "🐢",
  faster: "🐇",
};

export interface RoomViewPeer {
  id: string;
  displayName: string;
  role: VideoPeerRole;
  joinedAt: string;
  media: PeerDto["media"];
  handRaisedAt: string | null;
}

export interface RoomViewInput {
  self: { participantId: string; displayName: string; role: VideoPeerRole };
  peers: readonly RoomViewPeer[];
  /** This participant's own switches. */
  media: { screen: boolean; hand: boolean };
  stage: StageDto;
  /** The tile this viewer chose to see large, if any. */
  pinned: string | null;
  /** When this participant's hand went up, as the server reported it. */
  handRaisedAt: string | null;
}

export interface RoomView {
  /** Who shares a screen right now: a peer's id, SELF, or null. */
  sharer: string | null;
  /** The teacher's id among the peers, or null (the teacher may be this participant). */
  host: string | null;
  /** The teacher's spotlight as a tile id, or null. */
  spotlightId: string | null;
  /** Peers a student does not see in focus mode. */
  hidden: ReadonlySet<string>;
  /** The viewer's own pin, when that tile is still there to show. */
  pinnedId: string | null;
  /** The tile shown large, or null when everyone is shown the same size. */
  stageId: string | null;
  /** What takes the stage: MATERIAL, BOARD, a tile id, or null. */
  stageKey: string | null;
  /** Raised hands in the order they went up. */
  handQueue: Array<{ id: string; name: string; at: string }>;
}

export function roomView(input: RoomViewInput): RoomView {
  const { self, peers, media, stage } = input;
  const isStudent = self.role === "STUDENT";

  const sharer = peers.find((p) => p.media?.screen)?.id ?? (media.screen ? SELF : null);
  const host = peers.find((p) => p.role === "HOST")?.id ?? null;
  // The teacher may spotlight themselves or this participant.
  const spotlightId =
    stage.spotlight === self.participantId
      ? SELF
      : peers.some((p) => p.id === stage.spotlight)
        ? stage.spotlight
        : null;
  // Focus mode: students see only the teacher, the spotlight, a shared screen and themselves.
  const hidden = new Set(
    peers
      .filter(
        (p) =>
          isStudent &&
          stage.focus &&
          p.role === "STUDENT" &&
          p.id !== spotlightId &&
          p.id !== sharer,
      )
      .map((p) => p.id),
  );
  const pinnedId =
    input.pinned &&
    (input.pinned === SELF || peers.some((p) => p.id === input.pinned && !hidden.has(p.id)))
      ? input.pinned
      : null;
  // Students watch the teacher; teachers and guests see everyone unless someone leads.
  // A shared screen goes before the teacher's spotlight: it is what the lesson is about.
  const stageId = pinnedId ?? sharer ?? spotlightId ?? (isStudent ? host : null) ?? null;
  // The whiteboard takes the stage from everyone (A-155), and so does a material the teacher
  // shows (A-183). With both on, the pen draws over the material's page; where a material
  // cannot be drawn on (a video, a link), the whiteboard covers it until it is closed.
  const shown = stage.material;
  const penOverMaterial = shown !== null && canAnnotate(shown.view);
  const stageKey =
    shown && (!stage.board || penOverMaterial) ? MATERIAL : stage.board ? BOARD : stageId;

  const handQueue = [
    ...peers
      .filter((p) => p.media?.hand)
      .map((p) => ({ id: p.id, name: p.displayName, at: p.handRaisedAt ?? p.joinedAt })),
    ...(media.hand
      ? [
          {
            id: SELF,
            name: self.displayName,
            at: input.handRaisedAt ?? new Date().toISOString(),
          },
        ]
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return { sharer, host, spotlightId, hidden, pinnedId, stageId, stageKey, handQueue };
}
