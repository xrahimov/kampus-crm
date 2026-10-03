"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Clickable column header bound to the `sort=field:dir` query parameter. */
export function SortHeader({
  field,
  children,
  className,
}: {
  field: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeField, direction] = (searchParams.get("sort") ?? "").split(":");
  const active = activeField === field;

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    const next = active && direction === "asc" ? "desc" : "asc";
    params.set("sort", `${field}:${next}`);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {children}
      <Icon className="size-3.5" />
    </button>
  );
}
