import { Inbox } from "lucide-react";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex animate-rise flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <Inbox className="size-8 animate-pop opacity-50" />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p>{hint}</p>}
    </div>
  );
}
