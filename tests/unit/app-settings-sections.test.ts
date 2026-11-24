import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SETTINGS_NAV } from "@/features/settings/settings-nav";

/*
 * The phone app lists the Settings sections itself (A-234): the same ones as
 * the site, in the same order, behind the same permission. A section added to
 * the site and forgotten in the app fails here.
 *
 * The app's file is read as text, not imported: the app is a project of its
 * own (`mobile/`), and its packages are not installed where the site's tests
 * run.
 */
const APP_LIST = join(process.cwd(), "mobile/src/features/catalog/settings-sections.ts");
const SECTION = /\{\s*key:\s*"([^"]+)",\s*path:\s*"([^"]+)",\s*permission:\s*"([^"]+)",?\s*\}/g;

describe("the app's list of Settings sections", () => {
  it("is the site's list, without the site owner's own section", () => {
    const text = readFileSync(APP_LIST, "utf8");
    const sections = [...text.matchAll(SECTION)].map(([, key, path, permission]) => ({
      key,
      path,
      permission,
    }));
    expect(sections.length).toBeGreaterThan(0);
    expect(sections).toEqual(
      SETTINGS_NAV.filter((item) => !item.siteOwner && !item.phase).map((item) => ({
        key: item.key,
        path: item.href,
        permission: item.permission,
      })),
    );
  });
});
