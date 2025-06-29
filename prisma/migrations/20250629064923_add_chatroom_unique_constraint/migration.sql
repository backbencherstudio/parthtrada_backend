/*
  Warnings:

  - A unique constraint covering the columns `[studentId,expertId]` on the table `ChatRoom` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_studentId_expertId_key" ON "ChatRoom"("studentId", "expertId");
