import { cn } from "@/lib/utils";

/** A thin bar filled to `percent`; a null percent shows an empty track. */
export function ProgressMeter({
  percent,
  className,
  label,
}: {
  percent: number | null;
  className?: string;
  label?: string;
}) {
  const value = percent ?? 0;
  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      data-testid="progress-meter"
      data-percent={percent ?? ""}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}
