-- The site owner (A-108): the person who runs the server and creates organisations
-- for other centres. The first CEO of the first organisation becomes it.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSiteOwner" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isSiteOwner" = true WHERE id = (
  SELECT u.id FROM "User" u
  JOIN "UserRole" ur ON ur."userId" = u.id
  JOIN "Role" r ON r.id = ur."roleId"
  WHERE r.code = 'CEO'
    AND u."organizationId" = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
  ORDER BY u."createdAt" ASC
  LIMIT 1
);
