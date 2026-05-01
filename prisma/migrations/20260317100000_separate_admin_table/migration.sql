-- Create separate Admin table
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- Migrate existing admins from User to Admin
INSERT INTO "Admin" ("id", "clerkId", "email", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "clerkId", "email", NULL, "createdAt", NOW()
FROM "User"
WHERE "role" = 'ADMIN';

-- Remove role column and index from User
DROP INDEX IF EXISTS "User_role_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- Drop the UserRole enum type
DROP TYPE IF EXISTS "UserRole";

-- Create indexes on Admin table
CREATE UNIQUE INDEX "Admin_clerkId_key" ON "Admin"("clerkId");
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
CREATE INDEX "Admin_clerkId_idx" ON "Admin"("clerkId");
CREATE INDEX "Admin_email_idx" ON "Admin"("email");
