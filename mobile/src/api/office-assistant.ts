import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * The assistant for the app (A-253): the site's Assistant page and the two
 * tabs of its floating assistant. `GET /assistant` says who is asking and how
 * the centre's assistant answers, `POST /assistant` answers a conversation
 * (the whole of it is sent each time), and `POST /assistant/briefing` gives a
 * person's summary of a period: figures counted by Kampus and a conclusion.
 */

/** Whose first questions are offered: the office's or a teacher's. */
export type AssistantAudience = "office" | "teacher";
/** "fake" is the test mode of a centre without a key. */
export type AssistantMode = "fake" | "anthropic";

export interface AssistantInfo {
  audience: AssistantAudience;
  mode: AssistantMode;
  model: string;
  /** Whether this person may enter the key in Settings → Integrations. */
  canConfigure: boolean;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
  /** Which lookups an answer rests on. */
  tools?: string[];
}

export interface AssistantAnswer {
  answer: string;
  tools: string[];
  mode: AssistantMode;
  model: string;
}

/** The questions offered while the conversation is empty (`SUGGESTIONS` on the site). */
export const ASSISTANT_SUGGESTIONS: Record<AssistantAudience, readonly string[]> = {
  office: ["debtors", "students", "payments", "today", "sms"],
  teacher: ["myDay", "checking", "absentees", "lessonPlan", "parentMessage"],
};

export const BRIEFING_PERIODS = ["yesterday", "today", "week"] as const;
export type BriefingPeriod = (typeof BRIEFING_PERIODS)[number];
export type BriefingViewKind = "management" | "teaching";
export type BriefingTone = "good" | "warn" | "bad" | "neutral";

export interface BriefingDetail {
  label: string;
  value?: number;
  unit?: "count" | "money";
  /** A second, quieter piece of text: a group beside a student, a time beside a lesson. */
  note?: string;
  /** The site's path of what the line is about. */
  href?: string;
}

export interface BriefingStat {
  /** Such as "payments"; the words are under assistant.briefing.stats. */
  key: string;
  value: number;
  unit: "count" | "money";
  tone: BriefingTone;
  /** The site's path of the page that shows what the figure counts. */
  href?: string;
  details: BriefingDetail[];
  /** How many more lines there are than `details` shows. */
  more?: number;
}

export interface BriefingBranchRow {
  name: string;
  /** Null when the person may not see money. */
  payments: number | null;
  lessons: number;
  absent: number;
  unmarked: number;
}

/** A line of the conclusion: the model's own words, or a plain line the app spells in its language. */
export type BriefingLine = { text: string } | { rule: string; values: Record<string, number> };

export interface Briefing {
  view: BriefingViewKind;
  /** The views this person has; two for someone who both runs a branch and teaches. */
  views: BriefingViewKind[];
  period: BriefingPeriod;
  from: string;
  to: string;
  scope: { kind: "centre" | "branch" | "groups"; name: string };
  stats: BriefingStat[];
  /** One row per branch, only for someone looking at several branches at once. */
  branches: BriefingBranchRow[];
  conclusion: BriefingLine[];
  mode: AssistantMode;
  model: string;
  /** The centre has a key, but the model could not be reached this time. */
  aiFailed: boolean;
  /** The figures are here, the model's conclusion is not written yet. */
  pending: boolean;
  generatedAt?: string;
}

export interface BriefingAsk {
  view?: BriefingViewKind;
  period: BriefingPeriod;
  locale: string;
  /** Write the conclusion again although one is kept. */
  refresh: boolean;
  /** False asks for the figures only, without waiting for the model. */
  write: boolean;
}

/** Who is asking and how the centre's assistant answers. It costs no answer. */
export function useAssistantInfo() {
  return useQuery({
    queryKey: ["assistant", "info"],
    queryFn: ({ signal }) => api<AssistantInfo>("/assistant", { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

/** One answer to a conversation; the whole conversation goes with the question. */
export function askAssistant(turns: AssistantTurn[], locale: string): Promise<AssistantAnswer> {
  return api<AssistantAnswer>("/assistant", {
    method: "POST",
    body: { messages: turns.map(({ role, content }) => ({ role, content })), locale },
  });
}

/** A person's summary of a period. */
export function fetchBriefing(ask: BriefingAsk): Promise<Briefing> {
  return api<Briefing>("/assistant/briefing", { method: "POST", body: ask });
}
