import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, can, type Actor } from "@/server/rbac/authorize";

/*
 * The setup checklist on the home page (A-128): what a new centre's CEO still has
 * to add before the centre runs, each step with a tick and a link. Shown to people
 * who may change the centre's settings, until every step is done or it is hidden.
 */

export const SETUP_STEPS = [
  "branches",
  "courses",
  "rooms",
  "staff",
  "groups",
  "students",
  "paymentMethods",
  "telegram",
  "onlinePayments",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface SetupStepDto {
  key: SetupStep;
  done: boolean;
  /** How many exist, or null for a connection that is either there or not. */
  count: number | null;
  href: string;
}

export interface SetupChecklistDto {
  steps: SetupStepDto[];
  done: number;
  total: number;
  /** False once hidden with its button or the switch in Settings → General. */
  shown: boolean;
}

const HREF: Record<SetupStep, string> = {
  branches: "/settings/general",
  courses: "/settings/courses",
  rooms: "/settings/rooms",
  staff: "/settings/staff",
  groups: "/groups",
  students: "/students",
  paymentMethods: "/settings/general",
  telegram: "/settings/integrations",
  onlinePayments: "/settings/integrations",
};

/** Null for people who may not change the centre's settings. */
export async function getSetupChecklist(
  actor: Actor,
  db: DbClient = prisma,
): Promise<SetupChecklistDto | null> {
  if (!can(actor, "settings.org")) return null;
  const organizationId = actor.organizationId;
  const inOrg = { branch: { organizationId } };
  const [
    branches,
    courses,
    rooms,
    staff,
    groups,
    students,
    paymentMethods,
    integrations,
    settings,
  ] = await Promise.all([
    db.branch.count({ where: { organizationId, isActive: true } }),
    db.course.count({ where: { ...inOrg, isArchived: false } }),
    db.room.count({ where: inOrg }),
    db.user.count({ where: { organizationId, isArchived: false } }),
    db.group.count({ where: { ...inOrg, status: { not: "ARCHIVED" } } }),
    db.student.count({ where: { ...inOrg, isArchived: false } }),
    db.paymentMethod.count({ where: { organizationId, isActive: true } }),
    db.integrationSetting.findMany({
      where: { organizationId, isEnabled: true, provider: { in: ["TELEGRAM", "PAYME", "CLICK"] } },
      select: { provider: true, config: true },
    }),
    db.orgSettings.findUnique({
      where: { organizationId },
      select: { showSetupChecklist: true },
    }),
  ]);
  const configured = (provider: string, field: string) =>
    integrations.some((i) => {
      if (i.provider !== provider) return false;
      const value = (i.config as Record<string, unknown> | null)?.[field];
      return typeof value === "string" && value.length > 0;
    });
  const telegram = configured("TELEGRAM", "botToken");
  const online = configured("PAYME", "merchantId") || configured("CLICK", "merchantId");
  const counted = (key: SetupStep, count: number, min = 1): SetupStepDto => ({
    key,
    done: count >= min,
    count,
    href: HREF[key],
  });
  const steps: SetupStepDto[] = [
    counted("branches", branches),
    counted("courses", courses),
    counted("rooms", rooms),
    // Someone besides the CEO.
    counted("staff", staff, 2),
    counted("groups", groups),
    counted("students", students),
    counted("paymentMethods", paymentMethods),
    { key: "telegram", done: telegram, count: null, href: HREF.telegram },
    { key: "onlinePayments", done: online, count: null, href: HREF.onlinePayments },
  ];
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    shown: settings?.showSetupChecklist ?? true,
  };
}

/** "Hide" on the card, or the switch in Settings → General. */
export async function setSetupChecklistShown(
  actor: Actor,
  shown: boolean,
  db: DbClient = prisma,
): Promise<SetupChecklistDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  await db.orgSettings.upsert({
    where: { organizationId },
    update: { showSetupChecklist: shown },
    create: { organizationId, showSetupChecklist: shown },
  });
  return (await getSetupChecklist(actor, db)) as SetupChecklistDto;
}
