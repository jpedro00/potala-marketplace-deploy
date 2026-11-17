-- MARKETPLACE ONLY | schema=catalog | 20261111140000_product_attributes
-- Original SHA-256: 1077e5188e08bb4467e7ec99ee50ddc76221fc8f86631ae642cc0e8a64afcc64
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE catalog."ProductItemType" AS ENUM ('PHYSICAL','DIGITAL','SERVICE','COURSE');
CREATE TYPE catalog."ProductAttributeKind" AS ENUM ('TEXT','NUMBER','BOOLEAN','CHOICE');
ALTER TABLE catalog.produtos ADD COLUMN "itemType" catalog."ProductItemType" NOT NULL DEFAULT 'PHYSICAL', ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}';
ALTER TABLE catalog.produtos ADD CONSTRAINT product_attributes_object CHECK(jsonb_typeof(attributes)='object');
CREATE TABLE catalog."ProductAttributeDefinition" (
 id UUID PRIMARY KEY, "itemType" catalog."ProductItemType" NOT NULL,
 key VARCHAR(40) NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,39}$' AND key NOT IN ('constructor','prototype','__proto__')),
 label VARCHAR(80) NOT NULL, kind catalog."ProductAttributeKind" NOT NULL,
 options JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(options)='array'),
 active BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ProductAttributeDefinition_itemType_key_key" ON catalog."ProductAttributeDefinition"("itemType",key);

COMMIT;
