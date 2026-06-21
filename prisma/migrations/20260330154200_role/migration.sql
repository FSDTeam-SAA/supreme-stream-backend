-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'user';
