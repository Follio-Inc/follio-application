-- Add optional middle name support with source provenance tracking
ALTER TABLE "Profile"
ADD COLUMN "middleName" TEXT,
ADD COLUMN "middleNameSource" "DataSource" NOT NULL DEFAULT 'MANUAL';
