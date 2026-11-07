-- Per-entry duration tag beside experience / education subheadings.
-- Hidden by default; dates already communicate the range.
ALTER TABLE "WorkExperience" ADD COLUMN IF NOT EXISTS "durationVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Education" ADD COLUMN IF NOT EXISTS "durationVisible" BOOLEAN NOT NULL DEFAULT false;
