-- MARKETPLACE ONLY | schema=identity | 20261110000200_access_audit
-- Original SHA-256: 0f9e38c8a7e45735e2d8c5d8c92d8798dd10a299d8c69b8c3fc1bd37d1eecb86
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE identity."AdminAccessAudit" (
 id UUID PRIMARY KEY,
 "actorUserId" UUID,
 action TEXT NOT NULL CHECK(action IN ('ROLE_UPSERT','GRANT_CREATE','GRANT_REVOKE','SUPERADMIN_BOOTSTRAP')),
 "targetId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAccessAudit_createdAt_idx" ON identity."AdminAccessAudit"("createdAt");

COMMIT;
