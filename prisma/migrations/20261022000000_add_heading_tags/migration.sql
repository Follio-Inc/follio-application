-- Capsule tags shown beside experience, education, and project headings.
ALTER TABLE "WorkExperience" ADD COLUMN IF NOT EXISTS "headingTags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Education" ADD COLUMN IF NOT EXISTS "headingTags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "headingTags" JSONB NOT NULL DEFAULT '[]';
