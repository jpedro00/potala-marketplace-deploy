-- MARKETPLACE ONLY | schema=sellers | 20261111150000_partner_legal
-- Original SHA-256: d12a8a22f89fb7ae6ff18e36536c7df283a4c738a56a844357cfac1962074caa
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE sellers."PartnerDocumentType"(id uuid PRIMARY KEY, name varchar(100) NOT NULL, required boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sellers."PartnerDocument"(id uuid PRIMARY KEY, "sellerId" uuid NOT NULL REFERENCES sellers.vendedores(id), "typeId" uuid NOT NULL REFERENCES sellers."PartnerDocumentType"(id), filename varchar(200) NOT NULL, "mimeType" varchar(40) NOT NULL, data bytea NOT NULL, "contentHash" varchar(64) NOT NULL, status varchar(24) NOT NULL DEFAULT 'UPLOADED', reason varchar(2000), "uploadedBy" uuid NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(status IN ('UPLOADED','APPROVED','CORRECTION_REQUESTED','REJECTED')), CHECK(octet_length(data) BETWEEN 1 AND 5242880));
CREATE INDEX "PartnerDocument_sellerId_typeId_createdAt_idx" ON sellers."PartnerDocument"("sellerId","typeId","createdAt");
CREATE TABLE sellers."PartnerReviewEvent"(id uuid PRIMARY KEY, "sellerId" uuid NOT NULL REFERENCES sellers.vendedores(id), "documentId" uuid REFERENCES sellers."PartnerDocument"(id), "actorId" uuid NOT NULL, action varchar(30) NOT NULL, reason varchar(2000), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PartnerReviewEvent_sellerId_createdAt_idx" ON sellers."PartnerReviewEvent"("sellerId","createdAt");
COMMIT;
