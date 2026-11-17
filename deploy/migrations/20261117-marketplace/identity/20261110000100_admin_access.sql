-- MARKETPLACE ONLY | schema=identity | 20261110000100_admin_access
-- Original SHA-256: 560c8439ab5cf5b9c9a06552139a90819601bcd00ea08cfdf990805855b13d16
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE identity.perfis_administrador ADD COLUMN super_admin BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE identity."AdminAccessRole" (id UUID PRIMARY KEY, slot INTEGER UNIQUE NOT NULL CHECK(slot BETWEEN 1 AND 5), name TEXT NOT NULL, permissions TEXT[] NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE identity."AdminAccessGrant" (id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE, "roleId" UUID NOT NULL REFERENCES identity."AdminAccessRole"(id) ON DELETE RESTRICT, "scopeType" TEXT NOT NULL, "sellerIds" UUID[] NOT NULL DEFAULT '{}', "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (("scopeType" = 'GLOBAL' AND cardinality("sellerIds") = 0) OR ("scopeType" = 'SELLERS' AND cardinality("sellerIds") BETWEEN 1 AND 100)));
CREATE INDEX "AdminAccessGrant_userId_idx" ON identity."AdminAccessGrant"("userId");

COMMIT;
