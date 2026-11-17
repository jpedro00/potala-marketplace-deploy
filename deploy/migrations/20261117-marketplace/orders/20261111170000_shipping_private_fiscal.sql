-- MARKETPLACE ONLY | schema=orders | 20261111170000_shipping_private_fiscal
-- Original SHA-256: 299b104563fcbe09d66389a1a83bd19be106c1b0b6447d488765e4743b12864b
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TYPE "orders"."CouponDiscountType" ADD VALUE 'SHIPPING';
ALTER TABLE "orders"."pedidos_vendedor" ADD COLUMN "shipping_snapshot" JSONB;
CREATE TABLE "orders"."FiscalAttachment" (
  "id" UUID PRIMARY KEY,
  "sellerOrderId" UUID NOT NULL REFERENCES "orders"."pedidos_vendedor"("id") ON DELETE RESTRICT,
  "sellerId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "fileName" VARCHAR(100) NOT NULL,
  "mediaType" VARCHAR(50) NOT NULL CHECK ("mediaType" IN ('application/pdf', 'application/xml')),
  "bytes" BYTEA NOT NULL CHECK (octet_length("bytes") BETWEEN 1 AND 5242880),
  "sha256" CHAR(64) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "FiscalAttachment_sellerOrderId_idx" ON "orders"."FiscalAttachment"("sellerOrderId");
CREATE TABLE "orders"."FiscalAttachmentAudit" (
  "id" UUID PRIMARY KEY,
  "attachmentId" UUID NOT NULL REFERENCES "orders"."FiscalAttachment"("id") ON DELETE RESTRICT,
  "actorId" UUID NOT NULL,
  "action" VARCHAR(20) NOT NULL CHECK ("action" IN ('UPLOAD','DOWNLOAD','REVOKE')),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FiscalAttachmentAudit_attachmentId_idx" ON "orders"."FiscalAttachmentAudit"("attachmentId");

COMMIT;
