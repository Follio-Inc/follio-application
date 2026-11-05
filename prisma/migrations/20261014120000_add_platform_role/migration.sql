-- Developer Platform roles (PLATFORM_TODO item 28).
--
-- Additive only. Written by hand rather than generated from the datasource
-- because `prisma migrate diff --from-schema-datasource` also picks up
-- pre-existing drift this migration has nothing to do with: a
-- `ResumeEditSession` table and two `Profile` columns that exist in the
-- database, in no migration and in no code — `db push` leftovers. Dropping
-- them is a separate decision and not this item's to make.

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('viewer', 'runner', 'maintainer');

-- AlterTable
--
-- NOT NULL with a default, so every existing Admin row becomes `maintainer`
-- in the same statement and keeps exactly the access it had before roles
-- existed. No backfill, no window in which an admin is locked out, and new
-- rows inherit the same default from the column rather than from any call
-- site that creates them.
ALTER TABLE "Admin" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'maintainer';
