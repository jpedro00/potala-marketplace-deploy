-- MARKETPLACE ONLY | schema=identity | 20261111120000_account_actions_notifications
-- Original SHA-256: 22b7d4df0ba0a20bee417173c594c77fc77a58d3767e6e9972fc03a790350a0a
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "identity"."AccountActionToken" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "purpose" TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AccountActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AccountActionToken_purpose_check" CHECK ("purpose" IN ('PASSWORD_RESET','EMAIL_CONFIRMATION'))
);
CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "identity"."AccountActionToken"("tokenHash");
CREATE INDEX "AccountActionToken_userId_purpose_idx" ON "identity"."AccountActionToken"("userId", "purpose");
CREATE TABLE "identity"."Notification" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "idempotencyKey" TEXT NOT NULL,
 "template" TEXT NOT NULL, "title" TEXT NOT NULL, "message" TEXT NOT NULL,
 "encryptedPayload" TEXT, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lockedUntil" TIMESTAMP(3), "providerMessageId" TEXT, "readAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3),
 CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "Notification_status_check" CHECK ("status" IN ('QUEUED','SENT','FAILED')),
 CONSTRAINT "Notification_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "identity"."Notification"("idempotencyKey");
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "identity"."Notification"("status", "nextAttemptAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "identity"."Notification"("userId", "createdAt");

COMMIT;
