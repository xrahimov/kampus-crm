import "dotenv/config";
import { execSync } from "node:child_process";

/** Applies pending migrations once before DB-backed unit tests run. */
export default function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the unit tests (see .env.example)");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
