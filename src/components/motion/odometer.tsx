import { cn } from "@/lib/utils";

/**
 * A figure shown as a counter (A-192): every digit is a column that rolls one
 * full round and lands on its number, the columns one after the other. The
 * text in the page is the real figure from the first frame (the rolling strip
 * is drawn by the stylesheet, see `.odo` in globals.css), so it reads, copies
 * and tests as plain text. `play={false}` shows the text plainly.
 */
export function Odometer({
  text,
  play = true,
  delay = 0,
  className,
}: {
  text: string;
  play?: boolean;
  /** Milliseconds before the first column moves, to stagger a row of counters. */
  delay?: number;
  className?: string;
}) {
  if (!play) return <span className={className}>{text}</span>;
  let column = 0;
  return (
    // Keyed by the text, so a new figure rolls in again.
    <span
      key={text}
      className={cn("odo", className)}
      style={{ "--odo-delay": `${delay}ms` } as React.CSSProperties}
    >
      {Array.from(text).map((char, i) =>
        char >= "0" && char <= "9" ? (
          <span
            key={i}
            className="odo-digit"
            style={{ "--d": char, "--i": column++ } as React.CSSProperties}
          >
            <span>{char}</span>
          </span>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </span>
  );
}
