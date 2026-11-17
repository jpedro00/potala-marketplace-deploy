-- MARKETPLACE ONLY | schema=sellers | 20261110150000_seller_payment_preferences
-- Original SHA-256: 5ef3faa6eb8d383d9e1774e56eda944a5558bc8ae3b92593aa75ee9d0e049513
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- CreateTable
CREATE TABLE "sellers"."preferencias_pagamento" (
    "vendedor_id" UUID NOT NULL,
    "aceita_pix" BOOLEAN NOT NULL DEFAULT false,
    "aceita_cartao" BOOLEAN NOT NULL DEFAULT false,
    "periodicidade_repasse" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    "referencia_recebedor" VARCHAR(128),
    "provedor" VARCHAR(64),
    "banco" VARCHAR(80),
    "conta_final" CHAR(4),
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferencias_pagamento_pkey" PRIMARY KEY ("vendedor_id")
);

-- AddForeignKey
ALTER TABLE "sellers"."preferencias_pagamento" ADD CONSTRAINT "preferencias_pagamento_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "sellers"."vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sellers"."preferencias_pagamento" ADD CONSTRAINT "preferencias_validas" CHECK (
 "periodicidade_repasse" IN ('MANUAL','WEEKLY','MONTHLY') AND "revisao" > 0 AND
 ("conta_final" IS NULL OR "conta_final" ~ '^[0-9]{4}$') AND
 (("referencia_recebedor" IS NULL AND "provedor" IS NULL) OR (length(btrim("referencia_recebedor")) > 0 AND length(btrim("provedor")) > 0))
);

COMMIT;
