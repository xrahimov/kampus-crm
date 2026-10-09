import type { Prisma } from "@/generated/prisma/client";
import { PUBLIC_SLUG } from "@/lib/validation/settings";
import { prisma, type DbClient } from "@/server/db/prisma";
import { today } from "@/server/services/groups/shared";
import { normalizeHost } from "@/server/services/settings/domains.service";
import { dateToIso, decimalToNumber, isoToDate } from "@/server/services/settings/shared";

/*
 * A centre's public page (A-121): courses with prices, the timetable of the
 * groups that are running or recruiting, the teachers and the sign-up form,
 * for anyone, in the visitor's language. It opens at the root of the centre's
 * own address (A-114) and at /c/<slug> on the server's, once the centre has
 * switched it on in Settings → General.
 */

/** Members who hold a seat. */
const SEATED = ["NEW", "TRIAL", "ACTIVE"] as const;

export interface PublicCourseDto {
  id: string;
  name: string;
  description: string | null;
  /** So'm per month. */
  price: number;
  durationMonths: number;
  color: string | null;
  /** Groups of the course on the timetable. */
  groups: number;
}

export interface PublicGroupDto {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  color: string | null;
  branchName: string;
  /** Monday = 1 … Sunday = 7. */
  weekdays: number[];
  /** "HH:mm–HH:mm", one per distinct time across the days. */
  times: string[];
  teachers: string[];
  startDate: string;
  /** Room capacity minus seated members; null when the group has no room. */
  seatsLeft: number | null;
}

export interface PublicTeacherDto {
  id: string;
  fullName: string;
  photoUrl: string | null;
  courses: string[];
}

export interface PublicCentreDto {
  organizationId: string;
  name: string;
  logoUrl: string | null;
  slug: string | null;
  intro: string | null;
  phone: string | null;
  address: string | null;
  instagram: string | null;
  telegram: string | null;
  workStart: string;
  workEnd: string;
  branches: string[];
  courses: PublicCourseDto[];
  groups: PublicGroupDto[];
  teachers: PublicTeacherDto[];
  /** The lead form the page embeds; null when the centre has no active form. */
  formSlug: string | null;
}

async function load(
  db: DbClient,
  where: Prisma.OrgSettingsWhereUniqueInput,
): Promise<PublicCentreDto | null> {
  const settings = await db.orgSettings.findUnique({
    where,
    include: {
      organization: { select: { id: true, name: true, logoUrl: true } },
      publicForm: { select: { slug: true, isActive: true } },
    },
  });
  if (!settings?.publicPage) return null;
  const organizationId = settings.organizationId;
  const branchFilter = { organizationId, isActive: true };
  const [branches, courses, groups, firstForm] = await Promise.all([
    db.branch.findMany({
      where: branchFilter,
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { branch: branchFilter, isArchived: false },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        durationMonths: true,
        color: true,
      },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({
      where: {
        branch: branchFilter,
        status: { in: ["ACTIVE", "TRIAL"] },
        endDate: { gte: isoToDate(today()) },
      },
      select: {
        id: true,
        name: true,
        courseId: true,
        startDate: true,
        course: { select: { name: true, color: true } },
        branch: { select: { name: true } },
        slots: {
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            room: { select: { capacity: true } },
          },
          orderBy: { weekday: "asc" },
        },
        teachers: {
          select: {
            user: { select: { id: true, fullName: true, photoUrl: true, isArchived: true } },
          },
          orderBy: { since: "asc" },
        },
        _count: { select: { memberships: { where: { status: { in: [...SEATED] } } } } },
      },
      orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
    }),
    settings.publicForm?.isActive
      ? null
      : db.leadForm.findFirst({
          where: { organizationId, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { slug: true },
        }),
  ]);

  const teachers = new Map<string, PublicTeacherDto>();
  const groupDtos: PublicGroupDto[] = groups.map((g) => {
    const live = g.teachers.map((t) => t.user).filter((u) => !u.isArchived);
    for (const u of live) {
      const row = teachers.get(u.id) ?? {
        id: u.id,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        courses: [],
      };
      if (!row.courses.includes(g.course.name)) row.courses.push(g.course.name);
      teachers.set(u.id, row);
    }
    const capacity = g.slots.reduce((max, s) => (s.room ? Math.max(max, s.room.capacity) : max), 0);
    return {
      id: g.id,
      name: g.name,
      courseId: g.courseId,
      courseName: g.course.name,
      color: g.course.color,
      branchName: g.branch.name,
      weekdays: [...new Set(g.slots.map((s) => s.weekday))].sort((a, b) => a - b),
      times: [...new Set(g.slots.map((s) => `${s.startTime}–${s.endTime}`))],
      teachers: live.map((u) => u.fullName),
      startDate: dateToIso(g.startDate),
      seatsLeft: capacity > 0 ? Math.max(0, capacity - g._count.memberships) : null,
    };
  });
  const perCourse = new Map<string, number>();
  for (const g of groupDtos) perCourse.set(g.courseId, (perCourse.get(g.courseId) ?? 0) + 1);

  return {
    organizationId,
    name: settings.organization.name,
    logoUrl: settings.organization.logoUrl,
    slug: settings.publicSlug,
    intro: settings.publicIntro,
    phone: settings.publicPhone,
    address: settings.publicAddress,
    instagram: settings.publicInstagram,
    telegram: settings.publicTelegram,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    branches: branches.map((b) => b.name),
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      price: decimalToNumber(c.price),
      durationMonths: c.durationMonths,
      color: c.color,
      groups: perCourse.get(c.id) ?? 0,
    })),
    groups: groupDtos,
    teachers: [...teachers.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    formSlug: settings.publicForm?.isActive ? settings.publicForm.slug : (firstForm?.slug ?? null),
  };
}

/** The page behind /c/<slug>, or null when there is none or it is switched off. */
export async function getPublicCentreBySlug(
  slug: string,
  db: DbClient = prisma,
): Promise<PublicCentreDto | null> {
  const normalised = slug.trim().toLowerCase();
  if (!PUBLIC_SLUG.test(normalised)) return null;
  return load(db, { publicSlug: normalised });
}

/** The page at the root of a centre's own address (A-114), or null for other hosts. */
export async function getPublicCentreForHost(
  host: string | null | undefined,
  db: DbClient = prisma,
): Promise<PublicCentreDto | null> {
  const normalised = normalizeHost(host);
  if (!normalised) return null;
  const org = await db.organization.findUnique({
    where: { domain: normalised },
    select: { id: true },
  });
  return org ? load(db, { organizationId: org.id }) : null;
}
