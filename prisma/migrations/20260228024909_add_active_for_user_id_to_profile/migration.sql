/*
  Warnings:

  - A unique constraint covering the columns `[activeForUserId]` on the table `Profile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[unlistedKey]` on the table `Profile` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Profile_userId_key";

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Certification" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "activeForUserId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linksVisibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "portfolioVisibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "resumeShowPhoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resumeTitle" TEXT NOT NULL DEFAULT 'Untitled Resume',
ADD COLUMN     "resumeVisibility" "ContentVisibility" NOT NULL DEFAULT 'UNLISTED',
ADD COLUMN     "unlistedKey" TEXT;

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkExperience" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_activeForUserId_key" ON "Profile"("activeForUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_unlistedKey_key" ON "Profile"("unlistedKey");

-- CreateIndex
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_activeForUserId_fkey" FOREIGN KEY ("activeForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
