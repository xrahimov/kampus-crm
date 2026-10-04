"use client";

import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";

export const ALL = "__all";

/** URL-backed filters shared by the log and call pages: `null`/ALL clears a key, page resets. */
export function useLogParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
}
