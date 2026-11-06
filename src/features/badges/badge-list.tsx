"use client";

import {
  Award,
  CalendarCheck,
  Coins,
  Dumbbell,
  Flame,
  type LucideIcon,
  Medal,
  Target,
  Trophy,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useDateFormat } from "@/lib/use-date-format";
import { PERFECT_MONTH_LESSONS, type BadgeCode, type BadgeDto } from "@/lib/validation/badges";

const ICONS: Record<BadgeCode, LucideIcon> = {
  firstHomework: Award,
  homework10: Medal,
  streak10: Flame,
  perfectMonth: CalendarCheck,
  exercises10: Dumbbell,
  exerciseAce: Target,
  testAce: Trophy,
  coins100: Coins,
};

/** Every badge as a tile: earned ones in colour with the date, locked ones greyed with the hint (A-163). */
export function BadgeList({
  badges,
  testId = "badge-list",
}: {
  badges: BadgeDto[];
  testId?: string;
}) {
  const t = useTranslations("badges");
  const fmt = useDateFormat();
  const earned = badges.filter((b) => b.earnedAt).length;
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-count`}>
        {t("count", { earned, total: badges.length })}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {badges.map((b) => {
          const Icon = ICONS[b.code];
          const done = b.earnedAt !== null;
          return (
            <li
              key={b.code}
              className={cn(
                "flex items-start gap-2 rounded-md border p-2 text-xs",
                done ? "border-primary/40 bg-primary/5" : "text-muted-foreground opacity-70",
              )}
              data-testid="badge-tile"
              data-earned={done}
              data-code={b.code}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", done ? "text-primary" : "")} />
              <div className="min-w-0">
                <div className="font-medium text-foreground">{t(`items.${b.code}.name`)}</div>
                <div>
                  {done
                    ? t("earned", {
                        date: fmt(new Date(b.earnedAt!), { dateStyle: "medium" }),
                      }) + (b.groupName ? ` · ${b.groupName}` : "")
                    : t(`items.${b.code}.hint`, { count: PERFECT_MONTH_LESSONS })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
