// Avtomatika (triggers.ts): qabulga 1 soat ham qolmaganda yozilgan tashrifga SMS ketmaydi —
// bemor klinikada turibdi yoki u bilan hozirgina gaplashildi. Qolganlariga avvalgidek ketadi.
// Soxta baza bilan ishlaydi — haqiqiy bazaga ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/sms-just-booked.test.cjs
const path = require('path');
const assert = require('assert');

// db.ts `global.prisma` bor bo'lsa o'shani oladi — haqiqiy PrismaClient yaratilmaydi
let rows = [];
const matches = (row, where) => Object.entries(where).every(([key, cond]) => {
  const v = row[key];
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) return v === cond;
  if ('in' in cond) return cond.in.includes(v);
  if ('gte' in cond) return v != null && v >= cond.gte;
  throw new Error(`soxta baza bu shartni bilmaydi: ${key}`);
});
global.prisma = { appointment: { findMany: async ({ where }) => rows.filter((r) => matches(r, where)) } };
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';

require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { getTrigger, tashkentNowMs } = require(path.join(__dirname, '..', 'triggers.ts'));

const MIN = 60000;
const clinic = { id: 'c1', name: 'Test klinika' };
const patient = { id: 'p1', firstName: 'Aziz', lastName: 'Karimov' };
const doctor = { id: 'd1', firstName: 'Olim', lastName: 'Sobirov' };

/** Qabul: hozirdan `inMin` daqiqa keyin (Toshkent soati), `bookedAgoMin` daqiqa oldin yozilgan */
const appt = (id, inMin, bookedAgoMin, over = {}) => {
  const wall = new Date(tashkentNowMs() + inMin * MIN).toISOString();
  return {
    id, clinicId: clinic.id, doctorId: doctor.id, patient, doctor, status: 'Confirmed',
    date: wall.slice(0, 10), time: wall.slice(11, 16),
    bookedAt: bookedAgoMin === null ? null : new Date(Date.now() - bookedAgoMin * MIN),
    ...over,
  };
};
const reminder = (hoursBefore) => ({ clinicId: clinic.id, hoursBefore });
const booked = () => ({ clinicId: clinic.id, createdAt: new Date(Date.now() - 30 * 24 * 60 * MIN) });
const due = async (trigger, rule, list) => {
  rows = list;
  return (await getTrigger(trigger).findDue(rule, clinic)).map((d) => d.refId.split(':')[0]);
};

const tests = {
  'eslatma: kelib, yaqin bo\'sh vaqtga yozilgan bemorga ketmaydi': async () => {
    // 14:07 da keldi, 14:30 ga yozildi — "2 soat oldin" oynasi allaqachon ochiq
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', 23, 0)]), []);
    assert.deepStrictEqual(await due('before_appointment', reminder(24), [appt('a', 55, 2)]), []);
  },
  'eslatma: 1 soatdan uzoqroqqa yozilganga avvalgidek ketadi': async () => {
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', 90, 0)]), ['a']);
    assert.deepStrictEqual(await due('before_appointment', reminder(24), [appt('a', 300, 10)]), ['a']);
  },
  'eslatma: oldindan yozilgan qabulga vaqti yaqinlashganda ketadi': async () => {
    // Kecha yozilgan, 20 daqiqadan keyin — bu haqiqiy eslatma
    assert.deepStrictEqual(await due('before_appointment', reminder(1), [appt('a', 20, 24 * 60)]), ['a']);
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', 100, 3 * 24 * 60)]), ['a']);
  },
  'eslatma: yozilgan vaqti noma\'lum eski qabulga avvalgidek ketadi': async () => {
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', 20, null)]), ['a']);
  },
  'eslatma: oyna hali ochilmagan yoki qabul vaqti o\'tgan bo\'lsa ketmaydi': async () => {
    assert.deepStrictEqual(await due('before_appointment', reminder(1), [appt('a', 150, 24 * 60)]), []);
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', -5, 24 * 60)]), []);
    // "Hozir" orqali navbatga yozilgan bemor
    assert.deepStrictEqual(await due('before_appointment', reminder(2), [appt('a', 0, 0)]), []);
  },
  'eslatma: kelgan ("Keldi") va bekor qilingan qabulga ketmaydi': async () => {
    const list = [appt('a', 90, 24 * 60, { status: 'Checked-In' }), appt('b', 90, 24 * 60, { status: 'Cancelled' })];
    assert.deepStrictEqual(await due('before_appointment', reminder(2), list), []);
  },
  '"yozildingiz": qabulgacha 1 soat ham qolmagan bo\'lsa ketmaydi': async () => {
    assert.deepStrictEqual(await due('appointment_booked', booked(), [appt('a', 0, 0)]), []);
    assert.deepStrictEqual(await due('appointment_booked', booked(), [appt('a', 23, 0)]), []);
    // Ilgari 30 daqiqadan keyin ketardi — endi chegara 1 soat
    assert.deepStrictEqual(await due('appointment_booked', booked(), [appt('a', 45, 0)]), []);
  },
  '"yozildingiz": 1 soatdan uzoqroqqa yozilganga avvalgidek ketadi': async () => {
    assert.deepStrictEqual(await due('appointment_booked', booked(), [appt('a', 90, 0)]), ['a']);
    assert.deepStrictEqual(await due('appointment_booked', booked(), [appt('a', 3 * 24 * 60, 5)]), ['a']);
  },
  'bir nechta qabul: faqat hozirgina yozilgani tushib qoladi': async () => {
    const list = [appt('yaqin', 30, 1), appt('uzoq', 100, 1), appt('eski', 30, 2 * 24 * 60)];
    assert.deepStrictEqual((await due('before_appointment', reminder(2), list)).sort(), ['eski', 'uzoq']);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
  }
  console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} o'tdi`);
  process.exitCode = failed ? 1 : 0;
})();
