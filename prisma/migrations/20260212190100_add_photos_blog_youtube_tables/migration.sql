-- AlterTable: Drop description column from WorkExperience
ALTER TABLE "WorkExperience" DROP COLUMN IF EXISTS "description";

-- CreateTable: BlogPost
CREATE TABLE IF NOT EXISTS "BlogPost" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "slug" TEXT,
    "excerpt" TEXT,
    "content" TEXT,
    "thumbnail" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[],
    "readTimeMin" INTEGER,
    "claps" INTEGER,
    "platform" TEXT,
    "platformIcon" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "source" "DataSource" NOT NULL DEFAULT 'BLOG',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable: YouTubeVideo
CREATE TABLE IF NOT EXISTS "YouTubeVideo" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "channelId" TEXT,
    "channelTitle" TEXT,
    "publishedAt" TIMESTAMP(3),
    "duration" TEXT,
    "viewCount" INTEGER DEFAULT 0,
    "likeCount" INTEGER DEFAULT 0,
    "commentCount" INTEGER DEFAULT 0,
    "tags" TEXT[],
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "showOnPortfolio" BOOLEAN NOT NULL DEFAULT true,
    "source" "DataSource" NOT NULL DEFAULT 'YOUTUBE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProfilePhoto
CREATE TABLE IF NOT EXISTS "ProfilePhoto" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "category" "PhotoCategory" NOT NULL DEFAULT 'GALLERY',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogPost_profileId_idx" ON "BlogPost"("profileId");
CREATE INDEX IF NOT EXISTS "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");
CREATE INDEX IF NOT EXISTS "BlogPost_isFeatured_idx" ON "BlogPost"("isFeatured");
CREATE INDEX IF NOT EXISTS "BlogPost_isVisible_idx" ON "BlogPost"("isVisible");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_profileId_url_key" ON "BlogPost"("profileId", "url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YouTubeVideo_profileId_idx" ON "YouTubeVideo"("profileId");
CREATE INDEX IF NOT EXISTS "YouTubeVideo_publishedAt_idx" ON "YouTubeVideo"("publishedAt");
CREATE INDEX IF NOT EXISTS "YouTubeVideo_isFeatured_idx" ON "YouTubeVideo"("isFeatured");
CREATE INDEX IF NOT EXISTS "YouTubeVideo_isVisible_idx" ON "YouTubeVideo"("isVisible");
CREATE UNIQUE INDEX IF NOT EXISTS "YouTubeVideo_profileId_videoId_key" ON "YouTubeVideo"("profileId", "videoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProfilePhoto_profileId_idx" ON "ProfilePhoto"("profileId");
CREATE INDEX IF NOT EXISTS "ProfilePhoto_category_idx" ON "ProfilePhoto"("category");

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeVideo" ADD CONSTRAINT "YouTubeVideo_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
