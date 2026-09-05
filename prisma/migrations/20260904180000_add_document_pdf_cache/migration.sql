-- CreateTable
CREATE TABLE "DocumentPdfCache" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPdfCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPdfCache_kind_subjectId_layout_key" ON "DocumentPdfCache"("kind", "subjectId", "layout");

-- CreateIndex
CREATE INDEX "DocumentPdfCache_subjectId_idx" ON "DocumentPdfCache"("subjectId");
