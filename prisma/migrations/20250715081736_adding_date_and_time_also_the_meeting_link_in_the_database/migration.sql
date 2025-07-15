/*
  Warnings:

  - You are about to drop the column `time` on the `Booking` table. All the data in the column will be lost.
  - Added the required column `expertDateTime` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `studentDateTime` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "time",
ADD COLUMN     "expertDateTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "studentDateTime" TIMESTAMP(3) NOT NULL;
