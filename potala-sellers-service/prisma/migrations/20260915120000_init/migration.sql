-- CreateSchema
-- Este serviço é o único dono deste schema Postgres. Nenhuma migration deste
-- repositório deve tocar tabelas fora de "sellers".
CREATE SCHEMA IF NOT EXISTS "sellers";

-- CreateEnum
CREATE TYPE "sellers"."SellerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "sellers"."SellerMembershipRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "sellers"."DocumentType" AS ENUM ('CPF', 'CNPJ');

-- CreateTable
CREATE TABLE "sellers"."vendedores" (
    "id" UUID NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tipo_documento" "sellers"."DocumentType" NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "sellers"."SellerStatus" NOT NULL DEFAULT 'PENDING',
    "motivo_status" TEXT,
    "revisado_em" TIMESTAMP(3),
    "revisado_por_usuario_id" UUID,
    "comissao_bps" INTEGER,
    "media_avaliacoes" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers"."membros_vendedor" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "papel" "sellers"."SellerMembershipRole" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membros_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers"."logs_auditoria" (
    "id" UUID NOT NULL,
    "ator_usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "tipo_entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "metadados" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_slug_key" ON "sellers"."vendedores"("slug");

-- CreateIndex
CREATE INDEX "vendedores_status_idx" ON "sellers"."vendedores"("status");

-- CreateIndex
CREATE INDEX "vendedores_criado_em_idx" ON "sellers"."vendedores"("criado_em");

-- CreateIndex
CREATE INDEX "vendedores_revisado_por_usuario_id_idx" ON "sellers"."vendedores"("revisado_por_usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_tipo_documento_numero_documento_key" ON "sellers"."vendedores"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "membros_vendedor_usuario_id_key" ON "sellers"."membros_vendedor"("usuario_id");

-- CreateIndex
CREATE INDEX "membros_vendedor_vendedor_id_idx" ON "sellers"."membros_vendedor"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "membros_vendedor_usuario_id_vendedor_id_key" ON "sellers"."membros_vendedor"("usuario_id", "vendedor_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_ator_usuario_id_idx" ON "sellers"."logs_auditoria"("ator_usuario_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_tipo_entidade_entidade_id_idx" ON "sellers"."logs_auditoria"("tipo_entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_criado_em_idx" ON "sellers"."logs_auditoria"("criado_em");

-- AddForeignKey
ALTER TABLE "sellers"."membros_vendedor" ADD CONSTRAINT "membros_vendedor_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "sellers"."vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nota: "revisado_por_usuario_id" (vendedores) e "usuario_id" (membros_vendedor)
-- são referências soltas a identity.usuarios. Sem FK proposital — schemas
-- de serviços diferentes não têm integridade referencial pelo Postgres, só
-- pela aplicação (ver docs/internal-api-contract.md).

-- CheckConstraint
-- Mesma regra do monólito de origem (migration
-- 20260901160000_check_financeiro_e_idempotencia_pagamento): comissão é
-- opcional (nula enquanto PENDING/indefinida) e, quando definida, cabe em
-- 0..10000 pontos-base (0%..100%).
ALTER TABLE "sellers"."vendedores"
  ADD CONSTRAINT "vendedores_comissao_bps_faixa_check"
  CHECK ("comissao_bps" IS NULL OR ("comissao_bps" >= 0 AND "comissao_bps" <= 10000));
