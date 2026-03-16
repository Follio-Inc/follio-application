/*
  Warnings:

  - A unique constraint covering the columns `[profileId,source]` on the table `RawImportPayload` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('BASIC_INFO', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'LINKS', 'AWARDS', 'CERTIFICATIONS', 'PUBLICATIONS', 'VOLUNTEERING', 'LANGUAGES', 'INTERESTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CustomContentType" AS ENUM ('STRUCTURED', 'FREEFORM');

-- CreateTable
CREATE TABLE "ProfileSection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "SectionType" NOT NULL,
    "customName" TEXT,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "customContent" JSONB,
    "contentType" "CustomContentType" NOT NULL DEFAULT 'STRUCTURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileSection_profileId_idx" ON "ProfileSection"("profileId");

-- CreateIndex
CREATE INDEX "ProfileSection_sortOrder_idx" ON "ProfileSection"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSection_profileId_type_customName_key" ON "ProfileSection"("profileId", "type", "customName");

-- CreateIndex
CREATE UNIQUE INDEX "RawImportPayload_profileId_source_key" ON "RawImportPayload"("profileId", "source");

-- AddForeignKey
ALTER TABLE "ProfileSection" ADD CONSTRAINT "ProfileSection_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
