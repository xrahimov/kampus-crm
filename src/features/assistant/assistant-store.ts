"use client";

import { useCallback, useSyncExternalStore } from "react";

import { api } from "@/lib/api-client";
import type { AssistantAnswerDto } from "@/server/services/ai/assistant.service";

/*
 * One conversation with the assistant per browser tab, shared by the Assistant
 * page and the floating assistant (A-191), so a question asked in the bubble
 * can be continued on the page. It lives outside React because the two are
 * mounted in different places of the app frame; it is kept for the signed-in
 * person only and is gone on reload, like the page's conversation always was.
 */

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

interface State {
  owner: string | null;
  turns: AssistantTurn[];
  busy: boolean;
  error: string | null;
  /** How the last answer was made; "fake" is the test mode of a centre without a key. */
  mode: AssistantAnswerDto["mode"] | null;
}

const EMPTY: State = { owner: null, turns: [], busy: false, error: null, mode: null };
let state: State = EMPTY;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function ask(userId: string, text: string, locale: string, page?: string) {
  const question = text.trim();
  const mine = state.owner === userId ? state : { ...EMPTY, owner: userId };
  if (!question || mine.busy) return;
  const turns: AssistantTurn[] = [...mine.turns, { role: "user", content: question }];
  set({ owner: userId, turns, busy: true, error: null, mode: mine.mode });
  try {
    const dto = await api<AssistantAnswerDto>("/assistant", {
      method: "POST",
      body: {
        messages: turns.map(({ role, content }) => ({ role, content })),
        locale,
        ...(page ? { page } : {}),
      },
    });
    // Someone else signed in, or the conversation was cleared, while the answer was on its way.
    if (state.owner !== userId || state.turns !== turns) return;
    set({
      owner: userId,
      turns: [...turns, { role: "assistant", content: dto.answer, tools: dto.tools }],
      busy: false,
      error: null,
      mode: dto.mode,
    });
  } catch (e) {
    if (state.owner !== userId || state.turns !== turns) return;
    set({
      owner: userId,
      turns,
      busy: false,
      error: e instanceof Error ? e.message : "errors.internal",
      mode: mine.mode,
    });
  }
}

/** The conversation of the signed-in person, with the two things one can do to it. */
export function useAssistantChat(userId: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  const mine = snapshot.owner === userId ? snapshot : EMPTY;
  const send = useCallback(
    (text: string, locale: string, page?: string) => ask(userId, text, locale, page),
    [userId],
  );
  const clear = useCallback(() => set({ ...EMPTY, owner: userId }), [userId]);
  return {
    turns: mine.turns,
    busy: mine.busy,
    error: mine.error,
    mode: mine.mode,
    send,
    clear,
  };
}
