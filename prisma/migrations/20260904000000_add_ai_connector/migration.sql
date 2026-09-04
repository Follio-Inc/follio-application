-- CreateEnum
CREATE TYPE "AiEditDraftStatus" AS ENUM ('PENDING', 'APPLIED', 'DISCARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AiConnectorClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "redirectUris" TEXT[],
    "name" TEXT NOT NULL DEFAULT 'AI assistant',
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConnectorClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConnectorAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConnectorAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConnectorToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConnectorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEditDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "AiEditDraftStatus" NOT NULL DEFAULT 'PENDING',
    "operations" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "clientLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEditDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiConnectorClient_clientId_key" ON "AiConnectorClient"("clientId");

-- CreateIndex
CREATE INDEX "AiConnectorClient_clientId_idx" ON "AiConnectorClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConnectorAuthCode_codeHash_key" ON "AiConnectorAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "AiConnectorAuthCode_userId_idx" ON "AiConnectorAuthCode"("userId");

-- CreateIndex
CREATE INDEX "AiConnectorAuthCode_expiresAt_idx" ON "AiConnectorAuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiConnectorToken_tokenHash_key" ON "AiConnectorToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AiConnectorToken_userId_idx" ON "AiConnectorToken"("userId");

-- CreateIndex
CREATE INDEX "AiConnectorToken_expiresAt_idx" ON "AiConnectorToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AiEditDraft_userId_status_idx" ON "AiEditDraft"("userId", "status");

-- CreateIndex
CREATE INDEX "AiEditDraft_profileId_idx" ON "AiEditDraft"("profileId");

-- CreateIndex
CREATE INDEX "AiEditDraft_expiresAt_idx" ON "AiEditDraft"("expiresAt");

-- AddForeignKey
ALTER TABLE "AiConnectorAuthCode" ADD CONSTRAINT "AiConnectorAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "AiConnectorClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConnectorAuthCode" ADD CONSTRAINT "AiConnectorAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConnectorToken" ADD CONSTRAINT "AiConnectorToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConnectorToken" ADD CONSTRAINT "AiConnectorToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "AiConnectorClient"("clientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEditDraft" ADD CONSTRAINT "AiEditDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEditDraft" ADD CONSTRAINT "AiEditDraft_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
