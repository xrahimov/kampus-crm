import "dotenv/config";
import { execSync } from "node:child_process";

/** Fresh schema + demo seed before the e2e suite. */
export default function globalSetup() {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
}
