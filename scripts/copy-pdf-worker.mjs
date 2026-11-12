// Copies the PDF reader's worker from pdfjs-dist into public/pdfjs, where the
// video lesson room loads it (A-183). Run after changing the pdfjs-dist
// version: `node scripts/copy-pdf-worker.mjs`. A unit test fails when the copy
// is stale.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules/pdfjs-dist/legacy/build");
const to = path.join(root, "public/pdfjs");
mkdirSync(to, { recursive: true });
copyFileSync(path.join(from, "pdf.worker.min.mjs"), path.join(to, "pdf.worker.min.mjs"));
copyFileSync(path.join(root, "node_modules/pdfjs-dist/LICENSE"), path.join(to, "LICENSE"));
console.log("Copied the PDF worker to public/pdfjs.");
