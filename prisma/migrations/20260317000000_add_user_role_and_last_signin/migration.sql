-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN "lastSignInAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
