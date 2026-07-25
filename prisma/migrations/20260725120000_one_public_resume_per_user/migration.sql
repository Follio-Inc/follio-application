-- Ensure at most one non-archived PUBLIC resume per user.
-- First demote extras created by the former clone-visibility bug (keep newest).

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC
    ) AS rn
  FROM "Profile"
  WHERE "resumeVisibility" = 'PUBLIC'
    AND "isArchived" = false
)
UPDATE "Profile"
SET
  "resumeVisibility" = 'UNLISTED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "Profile_userId_one_public_resume_key"
ON "Profile" ("userId")
WHERE "resumeVisibility" = 'PUBLIC' AND "isArchived" = false;
