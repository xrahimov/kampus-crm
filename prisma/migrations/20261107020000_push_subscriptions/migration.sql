-- Web Push subscriptions of the student app (A-176).
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'uz',
  "path" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_studentId_idx" ON "PushSubscription"("studentId");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
