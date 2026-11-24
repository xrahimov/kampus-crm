import { useCallback, useSyncExternalStore } from "react";

import { askAssistant, type AssistantMode, type AssistantTurn } from "@/api/office-assistant";

/*
 * One conversation with the assistant while the app runs (A-253), as the site
 * keeps one per browser tab: it stays when the person leaves the Assistant
 * page and comes back, belongs to the signed-in person only, and is gone when
 * the app is closed. It lives outside React so that leaving the page does not
 * drop a question that is still being answered.
 */

interface State {
  owner: string | null;
  turns: AssistantTurn[];
  busy: boolean;
  /** Why the last question got no answer, as it was thrown. */
  error: unknown;
  /** How the last answer was made; "fake" is the test mode of a centre without a key. */
  mode: AssistantMode | null;
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
  return () => {
    listeners.delete(listener);
  };
}

async function ask(userId: string, text: string, locale: string) {
  const question = text.trim();
  const mine = state.owner === userId ? state : { ...EMPTY, owner: userId };
  if (!question || mine.busy) return;
  const turns: AssistantTurn[] = [...mine.turns, { role: "user", content: question }];
  set({ owner: userId, turns, busy: true, error: null, mode: mine.mode });
  try {
    const answer = await askAssistant(turns, locale);
    // Someone else signed in, or the conversation was cleared, while the answer was on its way.
    if (state.owner !== userId || state.turns !== turns) return;
    set({
      owner: userId,
      turns: [...turns, { role: "assistant", content: answer.answer, tools: answer.tools }],
      busy: false,
      error: null,
      mode: answer.mode,
    });
  } catch (error) {
    if (state.owner !== userId || state.turns !== turns) return;
    // The question stays in the conversation: sending again asks it anew with what follows.
    set({ owner: userId, turns, busy: false, error, mode: mine.mode });
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
  const send = useCallback((text: string, locale: string) => ask(userId, text, locale), [userId]);
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

/** Forgets every conversation (a test starts from nothing). */
export function forgetAssistantChat(): void {
  set(EMPTY);
}
