-- Sessions the phone app opens (A-203) are marked, so they can live longer than a browser's.
ALTER TABLE "Session" ADD COLUMN "app" BOOLEAN NOT NULL DEFAULT false;

-- One-time links that open the site signed in from the phone app (A-204).
CREATE TABLE "WebHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "activeBranchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebHandoff_tokenHash_key" ON "WebHandoff"("tokenHash");
CREATE INDEX "WebHandoff_userId_idx" ON "WebHandoff"("userId");
CREATE INDEX "WebHandoff_expiresAt_idx" ON "WebHandoff"("expiresAt");

ALTER TABLE "WebHandoff" ADD CONSTRAINT "WebHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
