import { UserRoundPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { Actor } from "@/server/rbac/authorize";
import { countJoinRequests } from "@/server/services/sign-in/join-requests.service";

/**
 * "N people are waiting to be let in" (A-196), on the pages where students and
 * staff are added. Nothing is shown to someone who cannot answer the requests,
 * or when nobody waits.
 */
export async function JoinRequestsBanner({ actor }: { actor: Actor }) {
  const count = await countJoinRequests(actor);
  if (count === 0) return null;
  const t = await getTranslations("joinRequests");
  return (
    <Link
      href="/join-requests"
      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
      data-testid="join-requests-banner"
    >
      <UserRoundPlus className="size-5 shrink-0 text-primary" />
      <span className="flex-1">{t("banner", { count })}</span>
      <span className="font-medium text-primary">{t("bannerOpen")}</span>
    </Link>
  );
}
