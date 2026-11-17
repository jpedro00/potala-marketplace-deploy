-- MARKETPLACE ONLY | schema=catalog | 20261111150000_partner_legal
-- Original SHA-256: 12a2bc12307b1434168cdbc4dcfcbe89e08a90e9c0f7fded702c91138144c2c5
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE catalog."LegalPolicy" (id uuid PRIMARY KEY, key varchar(40) NOT NULL, version integer NOT NULL, title varchar(200) NOT NULL, content text NOT NULL, "contentHash" varchar(64) NOT NULL, status varchar(12) NOT NULL DEFAULT 'DRAFT', "createdBy" uuid NOT NULL, "reviewedBy" uuid, "publishedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(key,version), CHECK(status IN ('DRAFT','PUBLISHED','REVOKED')), CHECK(version>0));
CREATE UNIQUE INDEX legal_policy_current ON catalog."LegalPolicy"(key) WHERE status='PUBLISHED';
CREATE INDEX "LegalPolicy_key_status_idx" ON catalog."LegalPolicy"(key,status);
CREATE TABLE catalog."LegalAcceptance" (id uuid PRIMARY KEY, "policyId" uuid NOT NULL REFERENCES catalog."LegalPolicy"(id) ON DELETE RESTRICT, "userId" uuid NOT NULL, "contentHash" varchar(64) NOT NULL, "acceptedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("policyId","userId"));
CREATE INDEX "LegalAcceptance_userId_acceptedAt_idx" ON catalog."LegalAcceptance"("userId","acceptedAt");
CREATE FUNCTION catalog.immutable_legal_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Legal acceptances are immutable'; END; $$;
CREATE TRIGGER immutable_legal_acceptance BEFORE UPDATE OR DELETE ON catalog."LegalAcceptance" FOR EACH ROW EXECUTE FUNCTION catalog.immutable_legal_acceptance();
COMMIT;
