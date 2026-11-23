import { useEffect, useState } from "react";

/** How long typing has to rest before a list asks the server again. */
export const SEARCH_REST_MS = 300;

/** What was typed, once the typing has rested: lists search with this, not with every key. */
export function useRested(typed: string, ms: number = SEARCH_REST_MS): string {
  const [rested, setRested] = useState(typed.trim());
  useEffect(() => {
    const timer = setTimeout(() => setRested(typed.trim()), ms);
    return () => clearTimeout(timer);
  }, [typed, ms]);
  return rested;
}
