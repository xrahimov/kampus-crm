import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/lib/rbac/permissions";

/*
 * The phone app's role form lists the permissions itself (A-244): the same
 * ones as the site's, in the same order. A permission added to the site and
 * forgotten in the app fails here.
 *
 * The app's file is read as text, not imported: the app is a project of its
 * own (`mobile/`), and its packages are not installed where the site's tests
 * run.
 */
const APP_LIST = join(process.cwd(), "mobile/src/features/settings/permissions.ts");

describe("the app's list of permissions", () => {
  it("is the site's list", () => {
    const text = readFileSync(APP_LIST, "utf8");
    const start = text.indexOf("export const PERMISSIONS = [");
    const end = text.indexOf("] as const", start);
    expect(start).toBeGreaterThan(-1);
    const codes = [...text.slice(start, end).matchAll(/"([a-zA-Z.]+)"/g)].map(([, code]) => code);
    expect(codes).toEqual([...PERMISSIONS]);
  });
});
