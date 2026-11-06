-- CreateEnum
CREATE TYPE "catalog"."ContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "catalog"."ContentFormat" AS ENUM ('VIDEO', 'LIVE', 'TEXT');

-- CreateTable
CREATE TABLE "catalog"."conteudos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "instrutor" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "formato" "catalog"."ContentFormat" NOT NULL DEFAULT 'VIDEO',
    "preco_centavos" INTEGER NOT NULL DEFAULT 0,
    "status" "catalog"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "descricao" TEXT NOT NULL DEFAULT '',
    "nota_moderacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conteudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conteudos_status_idx" ON "catalog"."conteudos"("status");

-- CreateIndex
CREATE INDEX "conteudos_criado_em_idx" ON "catalog"."conteudos"("criado_em");

-- AddCheckConstraint (hand-added -- Prisma schema syntax has no native CHECK support, mesmo padrao de todo outro CHECK numerico deste projeto, ver conteudos_preco_centavos_check)
ALTER TABLE "catalog"."conteudos" ADD CONSTRAINT "conteudos_preco_centavos_check" CHECK ("preco_centavos" >= 0);
