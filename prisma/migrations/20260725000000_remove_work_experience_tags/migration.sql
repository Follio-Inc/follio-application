-- Remove per-experience skills/technologies tags.
-- Dedicated Skills section (Skill / SkillGroup) is unchanged.
ALTER TABLE "WorkExperience" DROP COLUMN IF EXISTS "tags";
