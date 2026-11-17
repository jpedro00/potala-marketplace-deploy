-- MARKETPLACE ONLY | schema=catalog | 20261110150000_analytics_consent
-- Original SHA-256: 172a16d25d8c9f26c557476022ba43853fb3574fee608cc9fcb289e32f831b80
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "catalog"."consentimentos_analytics" ("sessao_anonima" UUID NOT NULL, "revogado_em" TIMESTAMP(3), "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "consentimentos_analytics_pkey" PRIMARY KEY ("sessao_anonima"));
CREATE INDEX "consentimentos_analytics_criado_em_idx" ON "catalog"."consentimentos_analytics"("criado_em");

COMMIT;
