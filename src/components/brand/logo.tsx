import { cn } from "@/lib/utils";

/**
 * Kampus mark: an eight-pointed star, the girih tile that covers Samarkand's
 * domes, cut into a square. Drawn once here so the sidebar, drawer and login
 * page share it.
 */
export function KampusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
      fill="none"
    >
      <rect width="32" height="32" rx="7" className="fill-sidebar-active" />
      <path
        d="M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z"
        className="fill-sidebar"
      />
      <circle cx="16" cy="16" r="3" className="fill-sidebar-active" />
    </svg>
  );
}

export function KampusWordmark({
  name,
  className,
  markClassName,
}: {
  name: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <KampusMark className={markClassName} />
      <span className="text-[1.0625rem] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
