/*
  Warnings:

  - You are about to drop the column `timeZone` on the `ExpertProfile` table. All the data in the column will be lost.
  - You are about to drop the column `timeZone` on the `StudentProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExpertProfile" DROP COLUMN "timeZone";

-- AlterTable
ALTER TABLE "StudentProfile" DROP COLUMN "timeZone";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timeZone" TEXT;
