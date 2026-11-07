-- Total experience can show years, months, or both. Null means follow the duration default.
ALTER TABLE "Profile" ADD COLUMN "totalExperienceShowYears" BOOLEAN;
ALTER TABLE "Profile" ADD COLUMN "totalExperienceShowMonths" BOOLEAN;
