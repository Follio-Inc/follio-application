-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "githubLastPush" TIMESTAMP(3),
ADD COLUMN     "githubLicense" TEXT,
ADD COLUMN     "githubOwner" TEXT,
ADD COLUMN     "githubPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "githubReadme" TEXT,
ADD COLUMN     "githubRepo" TEXT,
ADD COLUMN     "githubWatchers" INTEGER;

-- CreateTable
CREATE TABLE "GitHubProfile" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "githubId" INTEGER,
    "avatarUrl" TEXT,
    "htmlUrl" TEXT,
    "bio" TEXT,
    "company" TEXT,
    "blog" TEXT,
    "location" TEXT,
    "hireable" BOOLEAN,
    "publicRepos" INTEGER NOT NULL DEFAULT 0,
    "publicGists" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "accountCreatedAt" TIMESTAMP(3),
    "totalStars" INTEGER NOT NULL DEFAULT 0,
    "totalForks" INTEGER NOT NULL DEFAULT 0,
    "primaryLanguages" TEXT[],
    "languageStats" JSONB,
    "contributionStats" JSONB,
    "organizations" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT,
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubProfile_profileId_key" ON "GitHubProfile"("profileId");

-- CreateIndex
CREATE INDEX "GitHubProfile_username_idx" ON "GitHubProfile"("username");

-- CreateIndex
CREATE INDEX "Project_githubPinned_idx" ON "Project"("githubPinned");

-- AddForeignKey
ALTER TABLE "GitHubProfile" ADD CONSTRAINT "GitHubProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
