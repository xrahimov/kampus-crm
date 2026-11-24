import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPORTS_NAV } from "@/features/reports/reports-nav";

/*
 * The phone app lists the reports itself (A-238): the same ones as the site,
 * in the same order, behind the same permission. A report added to the site
 * and forgotten in the app fails here.
 *
 * The app's file is read as text, not imported: the app is a project of its
 * own (`mobile/`), and its packages are not installed where the site's tests
 * run.
 */
const APP_LIST = join(process.cwd(), "mobile/src/api/office-reports.ts");
const REPORT = /\{\s*key:\s*"([^"]+)",\s*path:\s*"([^"]+)",\s*permission:\s*"([^"]+)",?\s*\}/g;

describe("the app's list of reports", () => {
  const text = readFileSync(APP_LIST, "utf8");

  it("is the site's list", () => {
    const reports = [...text.matchAll(REPORT)].map(([, key, path, permission]) => ({
      key,
      path,
      permission,
    }));
    expect(reports.length).toBeGreaterThan(0);
    expect(reports).toEqual(
      REPORTS_NAV.filter((item) => !item.phase).map((item) => ({
        key: item.key,
        path: item.href,
        permission: item.permission,
      })),
    );
  });

  it("keeps in the app only reports the site has", () => {
    const block = /NATIVE_REPORTS = \[([^\]]+)\]/.exec(text)?.[1] ?? "";
    const names = [...block.matchAll(/"([^"]+)"/g)].map(([, name]) => name);
    expect(names.length).toBeGreaterThan(0);
    const paths = REPORTS_NAV.map((item) => item.href);
    for (const name of names) expect(paths).toContain(`/reports/${name}`);
  });
});
