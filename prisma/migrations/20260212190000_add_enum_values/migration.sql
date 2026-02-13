-- AlterEnum: Add new values to DataSource
-- These must be committed in their own transaction before they can be used as defaults
ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'GOOGLE';
ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'MEDIUM';
ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'BLOG';

-- AlterEnum: Add new values to LinkType
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'MEDIUM';
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'SUBSTACK';
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'HASHNODE';
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'DEVTO';

-- AlterEnum: Add PHOTOS to SectionType
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'PHOTOS';

-- CreateEnum
CREATE TYPE "PhotoCategory" AS ENUM ('PROFILE', 'GALLERY');
