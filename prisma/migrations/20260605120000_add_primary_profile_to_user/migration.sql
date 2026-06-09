-- Add a stable "primary" (portfolio) profile pointer per user, decoupled from
-- the transient "active" (builder) profile pointer.

-- AlterTable Profile (idempotent)
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "primaryForUserId" TEXT;

-- CreateIndex (idempotent) — at most one primary profile per user
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_primaryForUserId_key" ON "Profile"("primaryForUserId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Profile_primaryForUserId_fkey') THEN
    ALTER TABLE "Profile" ADD CONSTRAINT "Profile_primaryForUserId_fkey" FOREIGN KEY ("primaryForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill: each user's current active profile becomes their primary profile.
UPDATE "Profile"
SET "primaryForUserId" = "activeForUserId"
WHERE "activeForUserId" IS NOT NULL
  AND "primaryForUserId" IS NULL;

-- Backfill: users with no active profile get their oldest profile as primary.
UPDATE "Profile" p
SET "primaryForUserId" = p."userId"
WHERE p."id" IN (
  SELECT DISTINCT ON (candidate."userId") candidate."id"
  FROM "Profile" candidate
  WHERE candidate."userId" NOT IN (
    SELECT "primaryForUserId" FROM "Profile" WHERE "primaryForUserId" IS NOT NULL
  )
  ORDER BY candidate."userId", candidate."createdAt" ASC
);
