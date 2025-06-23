-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "isOnboardCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeAccountId" TEXT;
