-- AlterTable
ALTER TABLE "orders"."pedidos" ADD COLUMN     "inscricao_atividade_id" UUID,
ADD COLUMN     "sessao_analytics_id" UUID;

-- AlterTable
ALTER TABLE "orders"."pedidos_vendedor" ADD COLUMN     "desconto_centavos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "snapshot_financeiro" JSONB,
ADD COLUMN     "taxa_gateway_centavos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders"."transacoes_pagamento" ADD COLUMN     "chave_idempotencia" VARCHAR(128);

-- CreateTable
CREATE TABLE "orders"."politicas_financeiras" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "escopo_id" UUID,
    "chave_escopo" VARCHAR(80) NOT NULL,
    "versao" INTEGER NOT NULL,
    "comissao_bps" INTEGER NOT NULL,
    "taxa_gateway_bps" INTEGER NOT NULL,
    "taxa_fixa_centavos" INTEGER NOT NULL,
    "criado_por_usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "politicas_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders"."solicitacoes_estorno" (
    "id" UUID NOT NULL,
    "transacao_id" UUID NOT NULL,
    "chave_idempotencia" VARCHAR(128) NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PREPARED',
    "criado_por_usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_estorno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "politicas_financeiras_chave_escopo_versao_key" ON "orders"."politicas_financeiras"("chave_escopo", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_estorno_chave_idempotencia_key" ON "orders"."solicitacoes_estorno"("chave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_inscricao_atividade_id_key" ON "orders"."pedidos"("inscricao_atividade_id");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_pagamento_chave_idempotencia_key" ON "orders"."transacoes_pagamento"("chave_idempotencia");

-- AddForeignKey
ALTER TABLE "orders"."solicitacoes_estorno" ADD CONSTRAINT "solicitacoes_estorno_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "orders"."transacoes_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"."politicas_financeiras" ADD CONSTRAINT "politicas_valores_validos" CHECK (
 "scope" IN ('PLATFORM','SELLER','CATEGORY','PRODUCT') AND
 (("scope" = 'PLATFORM' AND "escopo_id" IS NULL) OR ("scope" <> 'PLATFORM' AND "escopo_id" IS NOT NULL)) AND
 "chave_escopo" = "scope" || ':' || COALESCE("escopo_id"::text, '*') AND
 "versao" > 0 AND "comissao_bps" BETWEEN 0 AND 10000 AND "taxa_gateway_bps" BETWEEN 0 AND 10000 AND "taxa_fixa_centavos" >= 0
);
ALTER TABLE "orders"."solicitacoes_estorno" ADD CONSTRAINT "estorno_preparacao_valida" CHECK ("valor_centavos" > 0 AND "status" IN ('PREPARED','CANCELLED'));
ALTER TABLE "orders"."pedidos_vendedor" ADD CONSTRAINT "pedidos_taxa_desconto_validos" CHECK ("taxa_gateway_centavos" >= 0 AND "desconto_centavos" >= 0);

CREATE FUNCTION "orders"."reject_policy_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial policies are immutable; create a new version'; END;
$$;
CREATE TRIGGER "financial_policy_immutable" BEFORE UPDATE OR DELETE ON "orders"."politicas_financeiras" FOR EACH ROW EXECUTE FUNCTION "orders"."reject_policy_mutation"();
