-- AlterTable
ALTER TABLE "GitHubProfile" ADD COLUMN     "hiddenLanguages" TEXT[],
ADD COLUMN     "hiddenOrganizations" TEXT[],
ADD COLUMN     "showContributions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showLanguageChart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnPortfolio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOrganizations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showStats" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customDescription" TEXT,
ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnPortfolio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnResume" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showReadme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showStats" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Project_isVisible_idx" ON "Project"("isVisible");
