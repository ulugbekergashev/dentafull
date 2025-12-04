/*
  Warnings:

  - A unique constraint covering the columns `[clinicId,telegramChatId]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,telegramChatId]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Clinic_telegramChatId_key";

-- DropIndex
DROP INDEX "Doctor_telegramChatId_key";

-- DropIndex
DROP INDEX "Patient_telegramChatId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_clinicId_telegramChatId_key" ON "Doctor"("clinicId", "telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_telegramChatId_key" ON "Patient"("clinicId", "telegramChatId");
