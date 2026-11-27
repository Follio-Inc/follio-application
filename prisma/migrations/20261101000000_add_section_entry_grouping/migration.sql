-- Consecutive same-organization grouping (group promotion) on resume sections.
-- Null = off. REPEATS = only orgs with 2+ consecutive entries. ALL = every entry.
ALTER TABLE "ProfileSection" ADD COLUMN IF NOT EXISTS "entryGrouping" TEXT;
