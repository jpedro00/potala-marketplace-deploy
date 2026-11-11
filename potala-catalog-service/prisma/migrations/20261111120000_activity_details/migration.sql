CREATE TYPE "catalog"."ActivityModality" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');
ALTER TABLE "catalog"."Activity"
  ADD COLUMN "instructors" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "modality" "catalog"."ActivityModality",
  ADD COLUMN "venue" TEXT,
  ADD COLUMN "meetingUrl" TEXT;
