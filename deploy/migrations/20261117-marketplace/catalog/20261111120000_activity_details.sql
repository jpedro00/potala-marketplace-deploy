-- MARKETPLACE ONLY | schema=catalog | 20261111120000_activity_details
-- Original SHA-256: fa225e5be55b8e5a05f28de57fed1e4667d17b164142b6ccf2b49e41667258a3
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "catalog"."ActivityModality" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');
ALTER TABLE "catalog"."Activity"
  ADD COLUMN "instructors" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "modality" "catalog"."ActivityModality",
  ADD COLUMN "venue" TEXT,
  ADD COLUMN "meetingUrl" TEXT;

COMMIT;
