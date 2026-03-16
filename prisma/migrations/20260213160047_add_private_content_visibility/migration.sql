DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContentVisibility') THEN
		CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'UNLISTED');
	END IF;
END
$$;

ALTER TYPE "ContentVisibility" ADD VALUE IF NOT EXISTS 'PRIVATE';
