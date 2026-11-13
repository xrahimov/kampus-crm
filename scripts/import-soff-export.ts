/**
 * Copies a centre's whole SOFF CRM into one Kampus organisation (A-189).
 *
 * The input is a folder of export files: one `soff-export/1` JSON file per branch
 * (plain or gzipped), taken read-only from the old system, plus any supplement
 * files. The copy is safe to repeat: a second run adds what is new and brings the
 * rest up to date.
 *
 * Without `--write` this is a dry run: the whole copy runs inside a transaction
 * that is rolled back, and the report shows exactly what a real run would do.
 *
 *   npx tsx scripts/import-soff-export.ts --org "KINGSTON LC" --dir /import
 *   npx tsx scripts/import-soff-export.ts --org "KINGSTON LC" --dir /import --write
 *
 * On the server, in the worker image (it carries the source and tsx):
 *
 *   docker compose -f docker-compose.prod.yml run --rm --no-deps -v /root/soff-import:/import:ro \
 *     worker npx tsx scripts/import-soff-export.ts --org "KINGSTON LC" --dir /import
 *
 * Take a database dump first. Nothing here sends a message to anyone.
 */
import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { prisma } from "../src/server/db/prisma";
import { applySoffSnapshot } from "../src/server/services/imports/soff-export-apply";
import {
  normalizeSoffExports,
  summarizeSnapshot,
} from "../src/server/services/imports/soff-export-normalize";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const orgName = argument("org");
  const dir = argument("dir");
  const write = process.argv.includes("--write");
  if (!orgName || !dir) {
    throw new Error(
      'Usage: import-soff-export.ts --org "<organisation name>" --dir <folder> [--write]',
    );
  }

  const names = (await readdir(dir)).filter((n) => /\.json(\.gz)?$/i.test(n)).sort();
  if (names.length === 0) throw new Error(`No .json or .json.gz files in ${dir}`);
  const files: unknown[] = [];
  for (const name of names) {
    const raw = await readFile(path.join(dir, name));
    const text = (name.toLowerCase().endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
    files.push(JSON.parse(text));
  }
  const snapshot = normalizeSoffExports(files);
  console.log(`read ${names.length} files`);
  console.log("THE OLD SYSTEM HOLDS");
  console.log(JSON.stringify(summarizeSnapshot(snapshot), null, 1));

  const organizations = await prisma.organization.findMany({
    where: { name: { equals: orgName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (organizations.length !== 1) {
    throw new Error(
      organizations.length === 0
        ? `No organisation is named "${orgName}"`
        : `${organizations.length} organisations are named "${orgName}"`,
    );
  }

  const started = Date.now();
  const report = await applySoffSnapshot(snapshot, {
    organizationId: organizations[0]!.id,
    dryRun: !write,
    log: (line) => console.log(`... ${line}`),
  });
  console.log(write ? "WRITTEN TO KAMPUS" : "DRY RUN, NOTHING WRITTEN. A REAL RUN WOULD DO THIS");
  console.log(JSON.stringify(report, null, 1));
  const moneyOk = report.money.every(
    (m) =>
      m.expected.owing === m.kampus.owing &&
      m.expected.credit === m.kampus.credit &&
      Math.abs(m.expected.owingTotal - m.kampus.owingTotal) <= m.expected.owing + 1 &&
      Math.abs(m.expected.creditTotal - m.kampus.creditTotal) <= m.expected.credit + 1,
  );
  console.log(moneyOk ? "BALANCES MATCH THE OLD SYSTEM" : "BALANCES DO NOT MATCH THE OLD SYSTEM");
  console.log(
    `${write ? "IMPORT_DONE" : "DRY_RUN_DONE"} in ${Math.round((Date.now() - started) / 1000)} s`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
