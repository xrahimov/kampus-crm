/** How many small pictures the mini window shows beside the big one. */
export const PIP_STRIP = 3;

/**
 * Who the mini window shows (A-201), most important first: the person this
 * viewer pinned, whoever shares a screen, the teacher's spotlight, the teacher,
 * then everyone else in the order given (the order they joined).
 */
export function pipOrder(
  peers: ReadonlyArray<{ id: string; role: string; screen: boolean }>,
  lead: { pinned: string | null; spotlight: string | null },
): string[] {
  const rank = (p: { id: string; role: string; screen: boolean }) =>
    p.id === lead.pinned
      ? 0
      : p.screen
        ? 1
        : p.id === lead.spotlight
          ? 2
          : p.role === "HOST"
            ? 3
            : 4;
  return peers
    .map((p, at) => ({ id: p.id, rank: rank(p), at }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((p) => p.id);
}
