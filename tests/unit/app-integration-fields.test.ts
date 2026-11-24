import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTEGRATION_PROVIDERS, integrationSchemas } from "@/lib/validation/integrations";

/*
 * The phone app has the forms of Settings → Integrations, AmoCRM and FaceID
 * itself (A-249), with its own list of each service's fields. A field added
 * to a service's schema and forgotten in the app would be sent as nothing and
 * fall back to its default on every save from the app, so this fails when the
 * two part ways.
 *
 * The app's file is read as text, not imported: the app is a project of its
 * own (`mobile/`), and its packages are not installed where the site's tests
 * run.
 */
const APP_FIELDS = join(process.cwd(), "mobile/src/features/settings/integration-fields.ts");

/** The app's `INTEGRATION_FIELDS`, as { SMS: ["email", …], … }. */
function appFields(): Record<string, string[]> {
  const text = readFileSync(APP_FIELDS, "utf8");
  const start = text.indexOf("export const INTEGRATION_FIELDS");
  const end = text.indexOf("\n};", start);
  expect(start).toBeGreaterThan(-1);
  const body = text.slice(start, end);
  const out: Record<string, string[]> = {};
  // A service starts on a line like "  SMS: [" and takes every `key: "…"` up to the next one.
  let provider: string | null = null;
  for (const line of body.split("\n")) {
    const head = /^ {2}([A-Z_]+): \[/.exec(line);
    if (head) {
      provider = head[1]!;
      out[provider] = [];
    }
    if (!provider) continue;
    for (const [, key] of line.matchAll(/key:\s*"([^"]+)"/g)) out[provider]!.push(key!);
  }
  return out;
}

describe("the app's integration forms", () => {
  it("have every service the server has", () => {
    expect(Object.keys(appFields()).sort()).toEqual([...INTEGRATION_PROVIDERS].sort());
  });

  it.each(INTEGRATION_PROVIDERS)("send every field of %s and no other", (provider) => {
    const schema = Object.keys(integrationSchemas[provider].shape).filter(
      (key) => key !== "isEnabled",
    );
    expect([...(appFields()[provider] ?? [])].sort()).toEqual(schema.sort());
  });
});
