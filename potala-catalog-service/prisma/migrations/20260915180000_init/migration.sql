-- CreateSchema
-- Este serviço é o único dono deste schema Postgres. Nenhuma migration deste
-- repositório deve tocar tabelas fora de "catalog".
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateEnum
CREATE TYPE "catalog"."CategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "catalog"."ProductStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'REJECTED', 'INACTIVE');

-- CreateTable
CREATE TABLE "catalog"."categorias" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoria_pai_id" UUID,
    "status" "catalog"."CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."produtos" (
    "id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "status" "catalog"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."imagens_produto" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "texto_alternativo" TEXT,
    "posicao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imagens_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."variantes_produto" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco_centavos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variantes_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."estoques" (
    "id" UUID NOT NULL,
    "variante_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "quantidade_reservada" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estoques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "catalog"."categorias"("slug");

-- CreateIndex
CREATE INDEX "categorias_categoria_pai_id_idx" ON "catalog"."categorias"("categoria_pai_id");

-- CreateIndex
CREATE INDEX "categorias_status_idx" ON "catalog"."categorias"("status");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_vendedor_id_slug_key" ON "catalog"."produtos"("vendedor_id", "slug");

-- CreateIndex
-- Necessário como alvo da FK composta de variantes_produto abaixo.
CREATE UNIQUE INDEX "produtos_id_vendedor_id_key" ON "catalog"."produtos"("id", "vendedor_id");

-- CreateIndex
CREATE INDEX "produtos_vendedor_id_idx" ON "catalog"."produtos"("vendedor_id");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "catalog"."produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_status_idx" ON "catalog"."produtos"("status");

-- CreateIndex
CREATE INDEX "produtos_criado_em_idx" ON "catalog"."produtos"("criado_em");

-- CreateIndex
CREATE INDEX "imagens_produto_produto_id_idx" ON "catalog"."imagens_produto"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "variantes_produto_vendedor_id_sku_key" ON "catalog"."variantes_produto"("vendedor_id", "sku");

-- CreateIndex
CREATE INDEX "variantes_produto_produto_id_idx" ON "catalog"."variantes_produto"("produto_id");

-- CreateIndex
CREATE INDEX "variantes_produto_vendedor_id_idx" ON "catalog"."variantes_produto"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "estoques_variante_id_key" ON "catalog"."estoques"("variante_id");

-- AddForeignKey
ALTER TABLE "catalog"."categorias" ADD CONSTRAINT "categorias_categoria_pai_id_fkey" FOREIGN KEY ("categoria_pai_id") REFERENCES "catalog"."categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "catalog"."categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."imagens_produto" ADD CONSTRAINT "imagens_produto_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "catalog"."produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- FK composta: variantes_produto(produto_id, vendedor_id) -> produtos(id, vendedor_id).
-- Garante, dentro deste mesmo schema, que uma variante nunca aponte para um
-- vendedor_id diferente do produto ao qual ela pertence.
ALTER TABLE "catalog"."variantes_produto" ADD CONSTRAINT "variantes_produto_produto_id_vendedor_id_fkey" FOREIGN KEY ("produto_id", "vendedor_id") REFERENCES "catalog"."produtos"("id", "vendedor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."estoques" ADD CONSTRAINT "estoques_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "catalog"."variantes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nota: "vendedor_id" (produtos e variantes_produto) é referência solta a
-- sellers.vendedores — sem FK cross-schema, mesma decisão já aplicada em
-- sellers-service para identity.usuarios. Integridade referencial é
-- responsabilidade da aplicação (SellerContextGuard, resolvido por chamada a
-- sellers-service), não do Postgres — ver docs/internal-api-contract.md.

-- CheckConstraint
-- Mesmas regras do monólito de origem (migrations
-- 20260901150000_check_estoque_quantidades e
-- 20260901160000_check_financeiro_e_idempotencia_pagamento).
ALTER TABLE "catalog"."estoques"
  ADD CONSTRAINT "estoques_quantidade_nao_negativa_check"
  CHECK ("quantidade" >= 0);

ALTER TABLE "catalog"."estoques"
  ADD CONSTRAINT "estoques_quantidade_reservada_nao_negativa_check"
  CHECK ("quantidade_reservada" >= 0);

ALTER TABLE "catalog"."estoques"
  ADD CONSTRAINT "estoques_quantidade_reservada_nao_excede_quantidade_check"
  CHECK ("quantidade_reservada" <= "quantidade");

ALTER TABLE "catalog"."produtos"
  ADD CONSTRAINT "produtos_preco_centavos_nao_negativo_check"
  CHECK ("preco_centavos" >= 0);

ALTER TABLE "catalog"."variantes_produto"
  ADD CONSTRAINT "variantes_produto_preco_centavos_nulo_ou_nao_negativo_check"
  CHECK ("preco_centavos" IS NULL OR "preco_centavos" >= 0);
