/*
  Warnings:

  - A unique constraint covering the columns `[telegramChatId]` on the table `Clinic` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramChatId]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramChatId]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "telegramChatId" TEXT;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "telegramChatId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_telegramChatId_key" ON "Clinic"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_telegramChatId_key" ON "Doctor"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_telegramChatId_key" ON "Patient"("telegramChatId");
