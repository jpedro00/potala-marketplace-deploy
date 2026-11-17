-- MARKETPLACE ONLY | schema=sellers | 20261111170000_delivery_preferences
-- Original SHA-256: 5252cdf15bb0c67c661cdf0446c3e70d405a749c56217fe5f5cdaf1b7f1f6b7c
-- Apply only after read-only preflight confirms this migration is pending.
-- A failure aborts this file. Do not run COMMIT by itself after an error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "sellers"."seller_delivery_settings" (
  "sellerId" UUID PRIMARY KEY,
  "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
  "pickupAddress" VARCHAR(500),
  "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "rates" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_pickup_address" CHECK (NOT "pickupEnabled" OR length(trim("pickupAddress")) > 0),
  CONSTRAINT "delivery_rates_array" CHECK (jsonb_typeof("rates") = 'array' AND jsonb_array_length("rates") <= 100)
);

COMMIT;
