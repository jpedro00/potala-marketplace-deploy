-- MARKETPLACE ONLY | schema=catalog | 20261111130000_contact_submissions
-- Original SHA-256: 1d1a4a02375ab7891148e1381abcfca1b775c50609cbca8793aec66e819379d4
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE catalog."ContactSubmission" (
 id UUID PRIMARY KEY, "requestHash" VARCHAR(64) NOT NULL, name VARCHAR(120) NOT NULL,
 email VARCHAR(254) NOT NULL, subject VARCHAR(160) NOT NULL, message VARCHAR(5000) NOT NULL,
 status VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','READ','CLOSED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ContactSubmission_createdAt_id_idx" ON catalog."ContactSubmission"("createdAt",id);
CREATE TABLE catalog."ContactAction" (
 id UUID PRIMARY KEY, "contactId" UUID NOT NULL REFERENCES catalog."ContactSubmission"(id),
 "actorId" UUID NOT NULL, status VARCHAR(10) NOT NULL CHECK(status IN ('NEW','READ','CLOSED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ContactAction_contactId_createdAt_idx" ON catalog."ContactAction"("contactId","createdAt");
ALTER TABLE catalog.eventos_analytics DROP CONSTRAINT analytics_evento_check;
ALTER TABLE catalog.eventos_analytics ADD CONSTRAINT analytics_evento_check CHECK(evento IN ('page_view','view_item','add_to_cart','begin_checkout','sign_up','seller_application','contact_click','contact_submit','view_activity','enroll','download','purchase'));

COMMIT;
