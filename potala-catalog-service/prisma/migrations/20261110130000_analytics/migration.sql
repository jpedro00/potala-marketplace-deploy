CREATE TABLE "catalog"."eventos_analytics" (
 "id" UUID NOT NULL, "sessao_anonima" UUID NOT NULL, "evento" VARCHAR(40) NOT NULL,
 "produto_id" UUID, "atividade_id" UUID, "pedido_id" UUID, "quantidade" INTEGER, "valor_centavos" INTEGER,
 "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "eventos_analytics_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "analytics_quantidade_check" CHECK ("quantidade" IS NULL OR "quantidade" BETWEEN 1 AND 10000),
 CONSTRAINT "analytics_valor_check" CHECK ("valor_centavos" IS NULL OR "valor_centavos" >= 0),
 CONSTRAINT "analytics_purchase_check" CHECK (("evento" = 'purchase' AND "pedido_id" IS NOT NULL AND "valor_centavos" IS NOT NULL) OR ("evento" <> 'purchase' AND "pedido_id" IS NULL AND "valor_centavos" IS NULL)),
 CONSTRAINT "analytics_evento_check" CHECK ("evento" IN ('page_view','view_item','add_to_cart','begin_checkout','sign_up','seller_application','contact_click','view_activity','enroll','download','purchase'))
);
CREATE UNIQUE INDEX "eventos_analytics_pedido_id_key" ON "catalog"."eventos_analytics"("pedido_id");
CREATE INDEX "eventos_analytics_ocorrido_em_idx" ON "catalog"."eventos_analytics"("ocorrido_em");
CREATE INDEX "eventos_analytics_evento_ocorrido_em_idx" ON "catalog"."eventos_analytics"("evento", "ocorrido_em");
CREATE INDEX "eventos_analytics_sessao_anonima_idx" ON "catalog"."eventos_analytics"("sessao_anonima");
