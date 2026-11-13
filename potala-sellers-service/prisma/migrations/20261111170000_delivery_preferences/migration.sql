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
