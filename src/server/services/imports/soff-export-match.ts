import type { SnapGroup, SnapStudent, SoffSnapshot } from "./soff-export-normalize";

/*
 * Which student and group of the snapshot is which record the centre already has
 * (A-189). Pure, so it can be checked against real data without a database.
 *
 * Students first, by what tells one person from another: the same phone and name,
 * then a phone or a name that one student has on each side. Groups next, by the
 * students they share: names are a weak sign, since a centre renames its groups
 * and one group's old name can be another's new one. Last, people the old system
 * holds twice under the same phone and name are told apart by their groups.
 */

export interface KampusStudent {
  id: string;
  branchExt: string;
  fullName: string;
  phone: string | null;
}

export interface KampusGroup {
  id: string;
  branchExt: string;
  name: string;
}

export interface MatchInput {
  snapshot: SoffSnapshot;
  students: KampusStudent[];
  groups: KampusGroup[];
  members: Array<{ groupId: string; studentId: string }>;
  /** Records an earlier run already paired: old id → Kampus id. */
  studentRefs: Map<string, string>;
  groupRefs: Map<string, string>;
}

export interface MatchResult {
  /** Snapshot ext → Kampus id, for the records that exist already. */
  students: Map<string, string>;
  groups: Map<string, string>;
  studentsBy: { ref: number; phoneAndName: number; phone: number; name: number; twin: number };
  groupsBy: { ref: number; members: number; name: number; earlierName: number };
}

/** Lower case, one space, one kind of apostrophe: "Go`zal  ALI" and "goʻzal ali" are the same name. */
export function nameKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[`ʻʼ’‘´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tally<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const have = map.get(k);
    if (have) have.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function matchSnapshot(input: MatchInput): MatchResult {
  const { snapshot } = input;
  const result: MatchResult = {
    students: new Map(),
    groups: new Map(),
    studentsBy: { ref: 0, phoneAndName: 0, phone: 0, name: 0, twin: 0 },
    groupsBy: { ref: 0, members: 0, name: 0, earlierName: 0 },
  };
  const takenStudents = new Set<string>();
  const takenGroups = new Set<string>();
  const studentIds = new Set(input.students.map((s) => s.id));
  const groupIds = new Set(input.groups.map((g) => g.id));
  const claimStudent = (s: SnapStudent, id: string, how: keyof MatchResult["studentsBy"]) => {
    result.students.set(s.ext, id);
    takenStudents.add(id);
    result.studentsBy[how] += 1;
  };
  const claimGroup = (g: SnapGroup, id: string, how: keyof MatchResult["groupsBy"]) => {
    result.groups.set(g.ext, id);
    takenGroups.add(id);
    result.groupsBy[how] += 1;
  };

  // --- What an earlier run paired stays paired ---------------------------------------
  for (const s of snapshot.students) {
    const id = input.studentRefs.get(s.ext);
    if (id && studentIds.has(id) && !takenStudents.has(id)) claimStudent(s, id, "ref");
  }
  for (const g of snapshot.groups) {
    const id = input.groupRefs.get(g.ext);
    if (id && groupIds.has(id) && !takenGroups.has(id)) claimGroup(g, id, "ref");
  }

  // --- Students that are one of a kind -------------------------------------------------
  const bothKey = (phone: string | null, name: string) =>
    phone ? `${phone}|${nameKey(name)}` : null;
  const twins: Array<{ theirs: SnapStudent[]; ours: KampusStudent[] }> = [];
  for (const branch of snapshot.branches) {
    const open = () =>
      input.students.filter((x) => x.branchExt === branch.ext && !takenStudents.has(x.id));
    const waiting = () =>
      snapshot.students.filter((s) => s.branchExt === branch.ext && !result.students.has(s.ext));

    const oursByBoth = tally(open(), (x) => bothKey(x.phone, x.fullName));
    const twinKeys = new Set<string>();
    for (const [key, theirs] of tally(waiting(), (s) => bothKey(s.phone, s.fullName))) {
      const ours = oursByBoth.get(key);
      if (!ours) continue;
      if (theirs.length === 1 && ours.length === 1)
        claimStudent(theirs[0]!, ours[0]!.id, "phoneAndName");
      else {
        // The same person twice in the old system: decided below, by their groups.
        twins.push({ theirs, ours });
        twinKeys.add(key);
      }
    }
    const single = <T>(
      rows: T[],
      key: (row: T) => string | null,
      both: (row: T) => string | null,
    ) =>
      tally(
        rows.filter((row) => !twinKeys.has(both(row) ?? "")),
        key,
      );
    const oursByPhone = single(
      open(),
      (x) => x.phone,
      (x) => bothKey(x.phone, x.fullName),
    );
    for (const [phone, theirs] of single(
      waiting(),
      (s) => s.phone,
      (s) => bothKey(s.phone, s.fullName),
    )) {
      const ours = oursByPhone.get(phone);
      if (theirs.length === 1 && ours?.length === 1) claimStudent(theirs[0]!, ours[0]!.id, "phone");
    }
    const oursByName = single(
      open(),
      (x) => nameKey(x.fullName),
      (x) => bothKey(x.phone, x.fullName),
    );
    for (const [name, theirs] of single(
      waiting(),
      (s) => nameKey(s.fullName),
      (s) => bothKey(s.phone, s.fullName),
    )) {
      const ours = oursByName.get(name);
      if (theirs.length === 1 && ours?.length === 1) claimStudent(theirs[0]!, ours[0]!.id, "name");
    }
  }

  // --- Groups, by the students they share ------------------------------------------------
  const membersOfKampusGroup = tally(input.members, (m) => m.groupId);
  const kampusStudentsOfSnapGroup = new Map<string, Set<string>>();
  for (const m of snapshot.memberships) {
    const id = result.students.get(m.studentExt);
    if (!id) continue;
    const set = kampusStudentsOfSnapGroup.get(m.groupExt) ?? new Set<string>();
    set.add(id);
    kampusStudentsOfSnapGroup.set(m.groupExt, set);
  }
  const shared: Array<{ group: SnapGroup; id: string; count: number; sameName: boolean }> = [];
  for (const group of snapshot.groups) {
    if (result.groups.has(group.ext)) continue;
    const theirs = kampusStudentsOfSnapGroup.get(group.ext);
    if (!theirs) continue;
    for (const ours of input.groups) {
      if (ours.branchExt !== group.branchExt || takenGroups.has(ours.id)) continue;
      const members = membersOfKampusGroup.get(ours.id) ?? [];
      const count = members.filter((m) => theirs.has(m.studentId)).length;
      // At least half of the group the centre has must be in the old one.
      if (count > 0 && count * 2 >= members.length) {
        shared.push({
          group,
          id: ours.id,
          count,
          sameName: nameKey(ours.name) === nameKey(group.name),
        });
      }
    }
  }
  shared.sort((a, b) => b.count - a.count || Number(b.sameName) - Number(a.sameName));
  for (const pair of shared) {
    if (result.groups.has(pair.group.ext) || takenGroups.has(pair.id)) continue;
    claimGroup(pair.group, pair.id, "members");
  }
  // Groups without students on the Kampus side: by name, then by a name they had before.
  const byName = (group: SnapGroup, name: string) =>
    input.groups.find(
      (x) =>
        x.branchExt === group.branchExt &&
        !takenGroups.has(x.id) &&
        nameKey(x.name) === nameKey(name),
    );
  for (const group of snapshot.groups) {
    if (result.groups.has(group.ext)) continue;
    const ours = byName(group, group.name);
    if (ours) claimGroup(group, ours.id, "name");
  }
  for (const group of snapshot.groups) {
    if (result.groups.has(group.ext)) continue;
    for (const old of group.previousNames) {
      const ours = byName(group, old);
      if (ours) {
        claimGroup(group, ours.id, "earlierName");
        break;
      }
    }
  }

  // --- The same person twice: the record that sits in the same groups wins ---------------
  const snapGroupOfKampus = new Map<string, string>();
  for (const [ext, id] of result.groups) snapGroupOfKampus.set(id, ext);
  const snapGroupsOfStudent = tally(snapshot.memberships, (m) => m.studentExt);
  const kampusGroupsOfStudent = tally(input.members, (m) => m.studentId);
  for (const { theirs, ours } of twins) {
    const pairs: Array<{ s: SnapStudent; id: string; score: number }> = [];
    for (const s of theirs) {
      const inGroups = new Set((snapGroupsOfStudent.get(s.ext) ?? []).map((m) => m.groupExt));
      for (const k of ours) {
        const score = (kampusGroupsOfStudent.get(k.id) ?? []).filter((m) =>
          inGroups.has(snapGroupOfKampus.get(m.groupId) ?? ""),
        ).length;
        pairs.push({ s, id: k.id, score });
      }
    }
    // Without a shared group: the record still in use, then the older one.
    pairs.sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.s.archived) - Number(b.s.archived) ||
        Number(a.s.oldId) - Number(b.s.oldId),
    );
    for (const pair of pairs) {
      if (result.students.has(pair.s.ext) || takenStudents.has(pair.id)) continue;
      claimStudent(pair.s, pair.id, "twin");
    }
  }

  return result;
}
