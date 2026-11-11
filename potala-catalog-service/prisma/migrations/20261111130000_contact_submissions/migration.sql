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
