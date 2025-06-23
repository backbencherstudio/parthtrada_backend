/*
  Warnings:

  - You are about to drop the column `isOnboardCompleted` on the `StudentProfile` table. All the data in the column will be lost.
  - You are about to drop the column `stripeAccountId` on the `StudentProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExpertProfile" ADD COLUMN     "isOnboardCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeAccountId" TEXT;

-- AlterTable
ALTER TABLE "StudentProfile" DROP COLUMN "isOnboardCompleted",
DROP COLUMN "stripeAccountId";
