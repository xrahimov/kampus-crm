import { describe, expect, it } from "vitest";

import { SETTINGS_NAV } from "@/features/settings/settings-nav";

import { SETTINGS_SECTIONS } from "../../mobile/src/features/catalog/settings-sections";

/*
 * The phone app lists the Settings sections itself (A-234): the same ones as
 * the site, in the same order, behind the same permission. A section added to
 * the site and forgotten in the app fails here.
 */
describe("the app's list of Settings sections", () => {
  it("is the site's list, without the site owner's own section", () => {
    expect(SETTINGS_SECTIONS).toEqual(
      SETTINGS_NAV.filter((item) => !item.siteOwner && !item.phase).map((item) => ({
        key: item.key,
        path: item.href,
        permission: item.permission,
      })),
    );
  });
});
