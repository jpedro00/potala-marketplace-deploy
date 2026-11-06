-- CreateSchema
-- Este serviço é o único dono deste schema Postgres. Nenhuma migration deste
-- repositório deve tocar tabelas fora de "identity".
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateEnum
CREATE TYPE "identity"."UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "identity"."Role" AS ENUM ('CUSTOMER', 'SELLER', 'ADMIN');

-- CreateTable
CREATE TABLE "identity"."usuarios" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "hash_senha" TEXT NOT NULL,
    "status" "identity"."UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verificado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."perfis_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "telefone" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."papeis_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "papel" "identity"."Role" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papeis_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."sessoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "ultimo_uso_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_em" TIMESTAMP(3),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."perfis_cliente" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."enderecos" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "rotulo" TEXT,
    "destinatario" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."perfis_administrador" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_administrador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "identity"."usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_status_idx" ON "identity"."usuarios"("status");

-- CreateIndex
CREATE INDEX "usuarios_criado_em_idx" ON "identity"."usuarios"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_usuario_usuario_id_key" ON "identity"."perfis_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "papeis_usuario_usuario_id_idx" ON "identity"."papeis_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "papeis_usuario_papel_idx" ON "identity"."papeis_usuario"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "papeis_usuario_usuario_id_papel_key" ON "identity"."papeis_usuario"("usuario_id", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_hash_token_key" ON "identity"."sessoes"("hash_token");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "identity"."sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "identity"."sessoes"("expira_em");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_cliente_usuario_id_key" ON "identity"."perfis_cliente"("usuario_id");

-- CreateIndex
CREATE INDEX "enderecos_cliente_id_idx" ON "identity"."enderecos"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_administrador_usuario_id_key" ON "identity"."perfis_administrador"("usuario_id");

-- AddForeignKey
ALTER TABLE "identity"."perfis_usuario" ADD CONSTRAINT "perfis_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."papeis_usuario" ADD CONSTRAINT "papeis_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."perfis_cliente" ADD CONSTRAINT "perfis_cliente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."enderecos" ADD CONSTRAINT "enderecos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "identity"."perfis_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."perfis_administrador" ADD CONSTRAINT "perfis_administrador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
