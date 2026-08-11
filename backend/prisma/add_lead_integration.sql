-- Lid integratsiyasi (yuboraman.uz va shu kabi tashqi manbalar) uchun ustunlar.
--
-- Bu skript FAQAT QO'SHADI: hech qanday ustun, jadval yoki ma'lumot o'chirilmaydi.
-- Barcha yangi ustunlar NULL bo'lishi mumkin, shuning uchun hozir ishlab turgan
-- (eski) backend ham xatosiz ishlayveradi — u bu ustunlarni umuman so'ramaydi.
--
-- IF NOT EXISTS tufayli qayta-qayta ishga tushirsa ham xavfsiz.
--
-- TARTIB MUHIM: avval shu skript, keyin yangi kodni deploy qilish.
-- Teskarisi bo'lsa, yangi kod bazada yo'q ustunlarni so'rab xato beradi.
--
-- Ishga tushirish:
--   psql "$DATABASE_URL" -f backend/prisma/add_lead_integration.sql

-- Tashqi payload'ning asl nusxasi va bemorga ko'chiriladigan maydonlar
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "raw" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "dob" TEXT;

-- Har klinikaning tashqi manba uchun kaliti
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "leadApiKey" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "leadApiKeyCreatedAt" TIMESTAMP(3);

-- Kalit bo'yicha klinikani topish uchun (NULL qiymatlar takrorlanishi mumkin,
-- shuning uchun kalit yaratilmagan klinikalar bir-biriga xalaqit bermaydi)
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_leadApiKey_key" ON "Clinic"("leadApiKey");

-- 15 daqiqalik dublikat tekshiruvi shu indeks ustida ishlaydi
CREATE INDEX IF NOT EXISTS "Lead_clinicId_phone_createdAt_idx" ON "Lead"("clinicId", "phone", "createdAt");
