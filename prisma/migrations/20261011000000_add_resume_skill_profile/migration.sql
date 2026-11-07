-- Resume skill profile: skills the model read from each resume line, rewritten after saves.
ALTER TABLE "Profile" ADD COLUMN "resumeSkillProfile" JSONB;
