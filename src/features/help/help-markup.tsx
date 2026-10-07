import { Fragment } from "react";

/** Renders manual text: `**label**` becomes a highlighted UI label, the rest is plain. */
export function HelpMarkup({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="rounded-sm bg-accent/70 px-1 py-px font-medium text-accent-foreground"
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
