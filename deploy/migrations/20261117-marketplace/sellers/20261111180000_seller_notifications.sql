-- MARKETPLACE ONLY | schema=sellers | 20261111180000_seller_notifications
-- Original SHA-256: 6dc4bcebe5693a8861b4dc4b4797f5f79ae909f6d215ac01bc42a44781315782
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE sellers."SellerNotificationJob" (id uuid PRIMARY KEY, "userId" uuid NOT NULL, template varchar(40) NOT NULL, "idempotencyKey" varchar(200) NOT NULL UNIQUE, status varchar(16) NOT NULL DEFAULT 'PENDING', attempts integer NOT NULL DEFAULT 0, "nextAttemptAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedUntil" timestamp(3), "enqueuedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(status IN ('PENDING','PROCESSING','ENQUEUED')), CHECK(attempts>=0));
CREATE INDEX "SellerNotificationJob_status_nextAttemptAt_idx" ON sellers."SellerNotificationJob"(status,"nextAttemptAt");

COMMIT;
