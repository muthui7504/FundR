ALTER TABLE "AppUser"
    ADD COLUMN IF NOT EXISTS "googleSubject" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_googleSubject_key"
    ON "AppUser"("googleSubject");
