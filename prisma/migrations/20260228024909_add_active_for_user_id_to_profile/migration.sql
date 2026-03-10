-- DropIndex (idempotent)
DROP INDEX IF EXISTS "Profile_userId_key";

-- AlterTable Award
ALTER TABLE "Award" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Certification
ALTER TABLE "Certification" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Education
ALTER TABLE "Education" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Link
ALTER TABLE "Link" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Profile
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "activeForUserId" TEXT;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "linksVisibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "portfolioVisibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "resumeShowPhoto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "resumeTitle" TEXT NOT NULL DEFAULT 'Untitled Resume';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "resumeVisibility" "ContentVisibility" NOT NULL DEFAULT 'UNLISTED';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "unlistedKey" TEXT;

-- AlterTable Skill
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable WorkExperience
ALTER TABLE "WorkExperience" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_activeForUserId_key" ON "Profile"("activeForUserId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_unlistedKey_key" ON "Profile"("unlistedKey");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Profile_userId_idx" ON "Profile"("userId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Profile_activeForUserId_fkey') THEN
    ALTER TABLE "Profile" ADD CONSTRAINT "Profile_activeForUserId_fkey" FOREIGN KEY ("activeForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
