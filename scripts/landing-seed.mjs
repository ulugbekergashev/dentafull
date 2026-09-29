/**
 * Landing skrinshotlari uchun demo ma'lumotiga qo'shimchalar.
 *
 * Demo o'zi har kuni bugungi kunga moslab jonli klinika quradi
 * (`services/demoSeed.ts`): to'rt shifokor, qabullar, to'lovlar, navbat.
 * Bu yerda faqat u qilmaydigan ikki narsa beriladi:
 *   - `demo-patient-1` ning tish xaritasi — rasm bo'sh odontogramma bo'lmasin;
 *   - ruscha skrinshot uchun xizmat va mutaxassislik nomlari: bu klinika
 *     ma'lumoti, interfeys emas — ruszabon klinikada jadval aynan shunday ko'rinadi.
 */

/** Tish xaritasi bo'sh ko'rinmasligi uchun holatlar */
const TEETH = [
  { patientId: "demo-patient-1", number: 17, conditions: ["Cavity"], notes: "" },
  { patientId: "demo-patient-1", number: 15, conditions: ["Pulpitis"], notes: "" },
  { patientId: "demo-patient-1", number: 14, conditions: ["Filled"], notes: "" },
  { patientId: "demo-patient-1", number: 24, conditions: ["Missing"], notes: "" },
  { patientId: "demo-patient-1", number: 25, conditions: ["Implant"], notes: "" },
  { patientId: "demo-patient-1", number: 46, conditions: ["Crown"], notes: "" },
  { patientId: "demo-patient-1", number: 44, conditions: ["Filled"], notes: "" },
  { patientId: "demo-patient-1", number: 35, conditions: ["Cavity"], notes: "" },
  { patientId: "demo-patient-1", number: 36, conditions: ["Filled"], notes: "" },
];

/** services/demoSeed.ts dagi nomlar → ruscha */
const RU_NAMES = {
  "Sut tishini plombalash": "Пломбирование молочного зуба",
  "Tish plombalash": "Пломбирование зуба",
  "Tish tozalash": "Профессиональная чистка",
  "Tish olib tashlash": "Удаление зуба",
  "Tish oqartirish": "Отбеливание зубов",
  "Metall-keramika toj": "Металлокерамическая коронка",
  "Breket tizimi": "Брекет-система",
  "Breket nazorati": "Контроль брекетов",
  "Kanal davolash": "Лечение канала",
  "Implant o'rnatish": "Установка импланта",
  "Ftorlash": "Фторирование",
  "Dental rentgen": "Дентальный рентген",
  "Konsultatsiya": "Консультация",
  "Jarroh-implantolog": "Хирург-имплантолог",
  "Bolalar stomatologi": "Детский стоматолог",
  "Terapevt": "Терапевт",
  "Ortodont": "Ортодонт",
};

export function buildLandingOverlay(lang = "uz") {
  return { teeth: TEETH, names: lang === "ru" ? RU_NAMES : null };
}
