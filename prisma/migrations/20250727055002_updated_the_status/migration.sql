-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
