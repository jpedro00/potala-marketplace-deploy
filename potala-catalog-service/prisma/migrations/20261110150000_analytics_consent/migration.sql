CREATE TABLE "catalog"."consentimentos_analytics" ("sessao_anonima" UUID NOT NULL, "revogado_em" TIMESTAMP(3), "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "consentimentos_analytics_pkey" PRIMARY KEY ("sessao_anonima"));
CREATE INDEX "consentimentos_analytics_criado_em_idx" ON "catalog"."consentimentos_analytics"("criado_em");
