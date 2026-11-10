CREATE TABLE identity."AdminAccessAudit" (
 id UUID PRIMARY KEY,
 "actorUserId" UUID,
 action TEXT NOT NULL CHECK(action IN ('ROLE_UPSERT','GRANT_CREATE','GRANT_REVOKE','SUPERADMIN_BOOTSTRAP')),
 "targetId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAccessAudit_createdAt_idx" ON identity."AdminAccessAudit"("createdAt");
