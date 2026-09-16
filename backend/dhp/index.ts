/**
 * DHP (Raqamli sog'liqni saqlash platformasi, dhp.uz) integratsiyasi.
 *
 *   codes.ts   — profil/kod tizimi manzillari, stomatologik mutaxassisliklar
 *   client.ts  — token, FHIR so'rovlar, mock server
 *   mappers.ts — Prisma yozuvlari → FHIR R5 resurslari (sof funksiyalar)
 *   sync.ts    — navbat (DhpResourceLink), qayta ishlash, holat, tekshiruv
 *
 * server.ts faqat shu faylni require qiladi.
 */
export * from './sync';
export { DhpClient, DhpError, DHP_ENV, MOCK_CLIENT_ID, isMockConfig } from './client';
export type { DhpEnvironment } from './client';
export { DENTAL_SPECIALTIES, specialtyByCode } from './codes';
