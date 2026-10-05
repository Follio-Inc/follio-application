-- User-facing career tenure shown as a tag on the Experience header.
-- Null means calculate from visible role dates.
ALTER TABLE "Profile" ADD COLUMN "totalExperience" TEXT;
