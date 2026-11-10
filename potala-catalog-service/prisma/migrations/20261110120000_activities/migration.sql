-- CreateEnum
CREATE TYPE "catalog"."ActivityKind" AS ENUM ('COURSE', 'EVENT', 'RECURRING');

-- CreateEnum
CREATE TYPE "catalog"."ActivityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "catalog"."EnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "catalog"."Activity" (
    "id" UUID NOT NULL,
    "sellerId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "catalog"."ActivityKind" NOT NULL,
    "status" "catalog"."ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "enrollmentDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."ActivitySession" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."Enrollment" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "catalog"."EnrollmentStatus" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "orderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."ActivityMaterial" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ActivityMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."MaterialAccess" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_status_kind_idx" ON "catalog"."Activity"("status", "kind");

-- CreateIndex
CREATE INDEX "Activity_sellerId_idx" ON "catalog"."Activity"("sellerId");

-- CreateIndex
CREATE INDEX "ActivitySession_activityId_startsAt_idx" ON "catalog"."ActivitySession"("activityId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_orderId_key" ON "catalog"."Enrollment"("orderId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_idx" ON "catalog"."Enrollment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_activityId_userId_key" ON "catalog"."Enrollment"("activityId", "userId");

-- CreateIndex
CREATE INDEX "ActivityMaterial_activityId_idx" ON "catalog"."ActivityMaterial"("activityId");

-- CreateIndex
CREATE INDEX "MaterialAccess_enrollmentId_accessedAt_idx" ON "catalog"."MaterialAccess"("enrollmentId", "accessedAt");

-- AddForeignKey
ALTER TABLE "catalog"."ActivitySession" ADD CONSTRAINT "ActivitySession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "catalog"."Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."Enrollment" ADD CONSTRAINT "Enrollment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "catalog"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."ActivityMaterial" ADD CONSTRAINT "ActivityMaterial_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "catalog"."Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."MaterialAccess" ADD CONSTRAINT "MaterialAccess_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "catalog"."Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."MaterialAccess" ADD CONSTRAINT "MaterialAccess_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "catalog"."ActivityMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE catalog."Activity" ADD CONSTRAINT "Activity_price_check" CHECK ("priceCents" >= 0), ADD CONSTRAINT "Activity_capacity_check" CHECK (capacity > 0);
ALTER TABLE catalog."ActivitySession" ADD CONSTRAINT "ActivitySession_dates_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE catalog."Enrollment" ADD CONSTRAINT "Enrollment_price_check" CHECK ("priceCents" >= 0);
