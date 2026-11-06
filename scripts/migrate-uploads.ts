/**
 * Copies the files of the local upload folder into object storage (A-174), so a
 * server can switch from `UPLOAD_DIR` to `STORAGE_DRIVER=s3` without losing
 * photos, materials or recordings. Re-runnable: a file already in the bucket
 * with the same size is skipped. Nothing is deleted locally.
 *
 *   STORAGE_DRIVER=s3 S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY=... S3_SECRET_KEY=... \
 *   UPLOAD_DIR=/data/uploads npx tsx scripts/migrate-uploads.ts
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { TYPE_BY_EXTENSION } from "../src/server/storage/local";
import { S3Storage, s3ConfigFromEnv } from "../src/server/storage/s3";
import { STORAGE_KEY_PATTERN } from "../src/server/storage/storage";

async function main() {
  const config = s3ConfigFromEnv();
  if (!config) throw new Error("Set STORAGE_DRIVER=s3 and the S3_* variables first");
  const root = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads");
  const s3 = new S3Storage(config);
  let copied = 0;
  let skipped = 0;
  for (const folder of await readdir(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const name of await readdir(path.join(root, folder.name))) {
      const key = `${folder.name}/${name}`;
      if (!STORAGE_KEY_PATTERN.test(key)) continue;
      const file = path.join(root, key);
      const { size } = await stat(file);
      if ((await s3.size(key)) === size) {
        skipped += 1;
        continue;
      }
      const ext = path.extname(name).slice(1);
      const contentType = TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
      const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
      await s3.putStream(key, stream, contentType, size + 1);
      copied += 1;
      console.log(`copied ${key} (${size} bytes)`);
    }
  }
  console.log(`done: ${copied} copied, ${skipped} already there`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
