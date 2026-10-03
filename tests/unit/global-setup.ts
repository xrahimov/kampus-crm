import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Applies pending migrations and the demo seed once before DB-backed unit
 * tests run. The seed provides the deployment's single organisation (A-37),
 * which the settings services resolve by `createdAt`.
 */
export default function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the unit tests (see .env.example)");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
}
