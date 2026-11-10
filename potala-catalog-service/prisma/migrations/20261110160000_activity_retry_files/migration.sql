ALTER TYPE catalog."EnrollmentStatus" ADD VALUE 'EXPIRED';
DROP INDEX catalog."Enrollment_activityId_userId_key";
CREATE INDEX "Enrollment_activityId_userId_idx" ON catalog."Enrollment"("activityId","userId");
-- Existing enum values keep the partial index valid during the enum extension.
CREATE UNIQUE INDEX "Enrollment_active_user_key" ON catalog."Enrollment"("activityId","userId") WHERE status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED');
ALTER TABLE catalog."ActivityMaterial" ALTER COLUMN content SET DEFAULT '';
ALTER TABLE catalog."ActivityMaterial" ADD COLUMN data BYTEA, ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'text/plain', ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE catalog."ActivityMaterial" ADD CONSTRAINT "ActivityMaterial_size_check" CHECK ((data IS NULL OR octet_length(data)<=5242880) AND ("sizeBytes" IS NULL OR "sizeBytes" BETWEEN 0 AND 5242880));
ALTER TABLE catalog."ActivityMaterial" ADD CONSTRAINT "ActivityMaterial_mime_check" CHECK ("mimeType" IN ('text/plain','application/pdf','image/jpeg','image/png'));
