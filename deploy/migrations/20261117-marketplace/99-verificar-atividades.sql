-- READ ONLY: no email, token or course participant data.
SELECT to_regclass('catalog."Activity"') AS activities, to_regclass('catalog."ActivitySession"') AS sessions, to_regclass('catalog."Enrollment"') AS enrollments, to_regclass('catalog."ActivityMaterial"') AS materials;
SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='catalog' AND table_name='Activity' AND column_name IN ('instructors','modality','venue','meetingUrl') ORDER BY column_name;
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='catalog' AND t.typname='EnrollmentStatus' ORDER BY enumsortorder;
