/*
  Warnings:

  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ucode" ADD COLUMN     "email" TEXT,
ADD COLUMN     "otp" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";
