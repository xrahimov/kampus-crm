import type { MaterialView } from "../video-material";

/*
 * What the server tells a participant of a video lesson (join and sync). These
 * types live here, away from the services, because the phone app's lesson room
 * uses them too and may import nothing that pulls the server in (A-207).
 */

/** Who someone is in a call: the lesson's teacher, other staff sitting in, or a student. */
export type VideoPeerRole = "HOST" | "STAFF" | "STUDENT";

export interface IceServerDto {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface JoinDto {
  roomId: string;
  groupId: string;
  /** The lesson the call belongs to, for the lesson panel (A-154). */
  lessonId: string | null;
  participantId: string;
  secret: string;
  displayName: string;
  role: VideoPeerRole;
  groupName: string;
  canEnd: boolean;
  iceServers: IceServerDto[];
  maxParticipants: number;
}

export interface PeerDto {
  id: string;
  displayName: string;
  role: VideoPeerRole;
  joinedAt: string;
  media: { audio: boolean; video: boolean; screen: boolean; hand?: boolean } | null;
  /** When the raised hand went up (server time), for the hand queue; null when down. */
  handRaisedAt: string | null;
}

/** What the teacher set for everyone's screen (A-152). */
export interface StageDto {
  /** A participant shown large on every screen, or null. */
  spotlight: string | null;
  /** Students see only the teacher, the spotlight and whoever shares a screen. */
  focus: boolean;
  /** The shared whiteboard is on everyone's stage (A-155). */
  board: boolean;
  /** The lesson material on everyone's stage (A-183), or null. */
  material: ShownMaterialDto | null;
}

/** A material the teacher shows to everyone, as this browser should open it. */
export interface ShownMaterialDto {
  id: string;
  title: string;
  kind: "FILE" | "LINK" | "RECORDING";
  view: MaterialView;
  /** This participant's own address of the file (students: through their personal link). */
  url: string;
  /** The page everyone is on (PDF). */
  page: number;
  /** Video and audio: whether it plays, and the second it was at when `at` was stamped. */
  playing: boolean;
  position: number;
  at: string;
}

/** Breakout rooms as this browser sees them (A-156). */
export interface BreakoutDto {
  /** Sub-rooms open right now; 0 = everyone is in the main room. */
  rooms: number;
  endsAt: string | null;
  /** The sub-room this browser is in; null = main room. */
  mine: number | null;
  /** Teacher only: everyone online and where they are, to manage the rooms. */
  everyone: Array<{
    id: string;
    displayName: string;
    role: VideoPeerRole;
    room: number | null;
  }> | null;
}

export interface SyncDto {
  /** GONE: this browser left, or the same person joined again from another tab. */
  status: "LIVE" | "ENDED" | "GONE";
  /** The people in this browser's room (main or its breakout sub-room). */
  peers: PeerDto[];
  signals: Array<{ id: number; from: string; kind: string; payload: unknown }>;
  stage: StageDto;
  /** This browser's own raised-hand time, for its place in the queue. */
  handRaisedAt: string | null;
  /** The open poll, else the last closed one (A-153). */
  poll: PollDto | null;
  breakout: BreakoutDto;
  /** Set for the teacher once the 1:1 student was marked absent for not joining (A-167). */
  noShow: string | null;
  /** The server's clock, so browsers can keep a shown video in step (A-183). */
  now: string;
}

/** A poll in a call as one participant sees it (A-153). */
export interface PollDto {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  /** This browser's answer (students), or null. */
  myVote: number | null;
  /** Answers per option; null for a student while the poll is open. */
  counts: number[] | null;
  total: number;
  /** Who answered what, for the teacher and staff only. */
  voters: Array<{ name: string; option: number }> | null;
}
