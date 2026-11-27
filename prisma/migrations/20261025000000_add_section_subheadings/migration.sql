-- Optional in-section sub-headings (Most Relevant / Other combined). Off by default.
ALTER TABLE "ProfileSection" ADD COLUMN IF NOT EXISTS "subHeadings" JSONB;
