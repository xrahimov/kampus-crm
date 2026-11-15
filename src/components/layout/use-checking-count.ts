"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";

// The sidebar and the phone's bottom bar both show the count: one request serves both.
let shared: { key: string; request: Promise<number> } | null = null;

function load(key: string): Promise<number> {
  if (shared?.key !== key) {
    shared = {
      key,
      request: api<{ count: number }>("/homework/queue?count=1")
        .then((r) => r.count)
        .catch(() => 0),
    };
  }
  return shared.request;
}

/** How many homework answers wait for the teacher; re-read on each page change. */
export function useCheckingCount(enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void load(pathname).then((n) => {
      if (live) setCount(n);
    });
    return () => {
      live = false;
    };
  }, [enabled, pathname]);
  return count;
}
