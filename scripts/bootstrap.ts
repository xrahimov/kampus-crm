/**
 * First start of a real deployment (docs/DEPLOY.md): creates the organisation,
 * one branch, the system roles and the first CEO account from environment
 * variables. Nothing invented is written. Re-runnable: it does nothing once an
 * organisation exists, so the variables can be removed from .env afterwards.
 * The first CEO is the site owner, who adds further centres from
 * Settings → Organisations (A-108).
 *
 *   BOOTSTRAP_ORG_NAME="My Learning Center" BOOTSTRAP_BRANCH_NAME="Main" \
 *   BOOTSTRAP_CEO_PHONE="+998901234567" BOOTSTRAP_CEO_PASSWORD="..." \
 *   npm run db:bootstrap
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { provisionOrganization } from "../src/server/services/settings/organizations.service";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set (see .env.production.example)`);
  return value;
}

async function main() {
  if ((await prisma.organization.count()) > 0) {
    console.log("Bootstrap skipped: an organisation already exists.");
    return;
  }
  const orgName = required("BOOTSTRAP_ORG_NAME");
  const branchName = required("BOOTSTRAP_BRANCH_NAME");
  const phone = required("BOOTSTRAP_CEO_PHONE");
  const password = required("BOOTSTRAP_CEO_PASSWORD");
  if (!/^\+\d{9,15}$/.test(phone)) {
    throw new Error("BOOTSTRAP_CEO_PHONE must be in international form, e.g. +998901234567");
  }
  if (password.length < 8) throw new Error("BOOTSTRAP_CEO_PASSWORD must be at least 8 characters");

  await prisma.$transaction((tx) =>
    provisionOrganization(tx, {
      name: orgName,
      branches: [branchName],
      ceo: {
        fullName: process.env.BOOTSTRAP_CEO_NAME?.trim() || "CEO",
        phone,
        password,
        isSiteOwner: true,
      },
      cashMethodName: process.env.BOOTSTRAP_CASH_NAME?.trim() || "Cash",
    }),
  );
  console.log(`Created organisation "${orgName}", branch "${branchName}" and CEO ${phone}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
