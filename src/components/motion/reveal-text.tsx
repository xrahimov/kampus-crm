import { cn } from "@/lib/utils";

/**
 * A heading whose words settle into place one after the other (A-192). The
 * words stay ordinary text with ordinary spaces between them, so the line
 * wraps on a phone exactly as it did before.
 */
export function RevealText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={i}>
          <span
            className={cn("inline-block animate-rise")}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
