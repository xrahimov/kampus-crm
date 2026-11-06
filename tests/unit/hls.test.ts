/**
 * Streaming copies of recordings (A-175): ffmpeg turns a short test video into
 * HLS renditions in local storage, the job records them on the material, the
 * student's link may read every file of the copy, deletion takes them along,
 * and the player's progress reports are kept per student.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { portalFileAllowed } from "@/server/services/homework/homework.service";
import {
  deleteMaterialFiles,
  makeRecordingStream,
  pickRenditions,
  transcodeToHls,
} from "@/server/services/materials/hls.service";
import {
  listGroupMaterials,
  listPortalMaterials,
  saveMaterialProgress,
} from "@/server/services/materials/materials.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { listStudentLinks } from "@/server/services/video/video.service";
import { LocalStorage } from "@/server/storage/local";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `hls${RUN}`;

function ffmpegAvailable(): boolean {
  try {
    execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync(process.env.FFPROBE_PATH ?? "ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAS_FFMPEG = ffmpegAvailable();

const ceo: Actor = {
  userId: "",
  fullName: `${TAG} CEO`,
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let dir: string;
let storage: LocalStorage;
let branchId: string;
let groupId: string;
let materialId: string;
let token: string;
const SOURCE_KEY = `recordings/${"c".repeat(32)}.webm`;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kampus-hls-test-"));
  storage = new LocalStorage(dir);
  const user = await prisma.user.create({
    data: {
      phone: `+99896${RUN}01`,
      fullName: ceo.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 1,
      gradingSystemId: null,
      color: "#0F766E",
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [{ weekday: 1, startTime: "10:00", endTime: "11:00", roomId: null }],
      teachers: [],
      startDate: "2026-01-05",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student`, phone: `+99896${RUN}02` },
    joinedAt: "2026-01-05",
    status: "ACTIVE",
  });
  token = (await listStudentLinks(ceo, groupId))[0]!.token;
  // A two-second test clip stands in for the teacher's recording.
  if (HAS_FFMPEG) {
    const clip = path.join(dir, "clip.webm");
    execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=640x480:rate=15:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libvpx",
      "-b:v",
      "200k",
      "-c:a",
      "libopus",
      clip,
    ]);
    await storage.put(SOURCE_KEY, new Uint8Array(await readFile(clip)), "video/webm");
  } else {
    await storage.put(SOURCE_KEY, new Uint8Array([1, 2, 3]), "video/webm");
  }
  materialId = (
    await prisma.lessonMaterial.create({
      data: {
        groupId,
        kind: "RECORDING",
        title: `${TAG} Recording`,
        url: `/api/v1/files/${SOURCE_KEY}`,
        size: 3,
        durationSec: 2,
        createdById: ceo.userId,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: ceo.userId }] } });
  await prisma.lessonMaterial.deleteMany({ where: { groupId } });
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: ceo.userId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

describe("the rendition ladder", () => {
  it("never upscales and always offers at least one rendition", () => {
    expect(pickRenditions(1080).map((r) => r.height)).toEqual([360, 720]);
    expect(pickRenditions(480).map((r) => r.height)).toEqual([360]);
    expect(pickRenditions(240).map((r) => r.height)).toEqual([240]);
    expect(pickRenditions(241).map((r) => r.height)).toEqual([240]);
  });
});

describe.skipIf(!HAS_FFMPEG)("the streaming copy", () => {
  it("transcodes a recording into playlists and byte-range media files", async () => {
    const result = await transcodeToHls(storage, SOURCE_KEY, { tmpRoot: dir });
    // 480p source: one 360p rendition = media + playlist, plus the master.
    expect(result.renditions).toEqual([{ height: 360, width: 480 }]);
    expect(result.keys).toHaveLength(3);
    for (const key of result.keys) expect(key).toMatch(/^hls\/[a-f0-9]{32}\.(m3u8|m4s)$/);
    const master = await storage.get(result.masterKey);
    expect(master?.contentType).toBe("application/vnd.apple.mpegurl");
    const masterText = new TextDecoder().decode(master!.data);
    expect(masterText).toContain("#EXT-X-STREAM-INF:BANDWIDTH=840400,RESOLUTION=480x360");
    const playlistName = masterText.trim().split("\n").at(-1)!;
    expect(playlistName).toMatch(/^[a-f0-9]{32}\.m3u8$/);
    const playlist = new TextDecoder().decode((await storage.get(`hls/${playlistName}`))!.data);
    expect(playlist).toContain("#EXT-X-MAP:URI=");
    expect(playlist).toContain("#EXT-X-BYTERANGE:");
    expect(playlist).toContain("#EXT-X-ENDLIST");
    const media = result.keys.find((k) => k.endsWith(".m4s"))!;
    expect((await storage.size(media))!).toBeGreaterThan(1000);
    await Promise.all(result.keys.map((k) => storage.delete(k)));
  });

  it("records the copy on the material, lets the student read it and deletes it with the material", async () => {
    expect(await makeRecordingStream(prisma, materialId, { storage, tmpRoot: dir })).toBe("done");
    expect(await makeRecordingStream(prisma, materialId, { storage, tmpRoot: dir })).toBe(
      "skipped",
    );
    const row = await prisma.lessonMaterial.findUniqueOrThrow({ where: { id: materialId } });
    expect(row.hlsKey).toMatch(/^hls\/[a-f0-9]{32}\.m3u8$/);
    expect(row.hlsKeys).toContain(row.hlsKey);
    expect(row.hlsKeys).toHaveLength(3);

    const staff = await listGroupMaterials(ceo, groupId);
    const material = staff.items.find((m) => m.id === materialId)!;
    expect(material.hlsUrl).toBe(`/api/v1/files/${row.hlsKey}`);
    expect(material.watched).toEqual({ started: 0, finished: 0 });
    const portal = (await listPortalMaterials(token))!.find((m) => m.id === materialId)!;
    expect(portal.hlsUrl).toBe(`/api/v1/public/class/${token}/files/${row.hlsKey}`);
    for (const key of row.hlsKeys) expect(await portalFileAllowed(token, key)).toBe(true);
    expect(await portalFileAllowed(token, `hls/${"0".repeat(32)}.m4s`)).toBe(false);

    await deleteMaterialFiles(storage, row);
    for (const key of [...row.hlsKeys, SOURCE_KEY]) expect(await storage.size(key)).toBeNull();
  });
});

describe("where the student stopped", () => {
  it("keeps the position per student, counts 90 % as watched and refuses other groups", async () => {
    expect(
      await saveMaterialProgress(token, materialId, { positionSec: 40, durationSec: 100 }),
    ).toBe(true);
    let portal = (await listPortalMaterials(token))!.find((m) => m.id === materialId)!;
    expect(portal.resumeSec).toBe(40);
    let staff = (await listGroupMaterials(ceo, groupId)).items.find((m) => m.id === materialId)!;
    expect(staff.watched).toEqual({ started: 1, finished: 0 });

    expect(
      await saveMaterialProgress(token, materialId, { positionSec: 95, durationSec: 100 }),
    ).toBe(true);
    // Rewinding keeps "watched"; the position follows.
    expect(
      await saveMaterialProgress(token, materialId, { positionSec: 10, durationSec: 100 }),
    ).toBe(true);
    portal = (await listPortalMaterials(token))!.find((m) => m.id === materialId)!;
    expect(portal.resumeSec).toBe(10);
    staff = (await listGroupMaterials(ceo, groupId)).items.find((m) => m.id === materialId)!;
    expect(staff.watched).toEqual({ started: 1, finished: 1 });

    expect(await saveMaterialProgress(token, "nope", { positionSec: 1, durationSec: null })).toBe(
      false,
    );
    expect(
      await saveMaterialProgress("x".repeat(24), materialId, { positionSec: 1, durationSec: null }),
    ).toBe(false);
  });
});
