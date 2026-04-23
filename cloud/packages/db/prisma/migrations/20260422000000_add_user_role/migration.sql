-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VISITOR');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing users to the admin role
UPDATE "users" SET "role" = 'ADMIN';
