// Klinikani dentalocal ga ko'chirish fayli (backend/dentalocalExport.ts).
// dentalocal tomoni: backend/scripts/dentacrm-import-smoke.ts shu sun'iy klinika faylini
// vaqtinchalik bazaga yuklab, qarzlar bir xil chiqishini tekshiradi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClinicExport, exportFileName, EXPORT_FORMAT } from '../backend/dentalocalExport';
import { fakePrisma } from './fixtures/fakeCloudClinic';

test('maxfiy va faqat bulutga tegishli maydonlar faylga tushmaydi', async () => {
    const data = await buildClinicExport(fakePrisma, 'cloud-clinic-1');
    assert.equal(data.format, EXPORT_FORMAT);
    const patient = data.tables.Patient.find(p => p.id === 'p1')!;
    for (const field of ['pinfl', 'passport', 'regionCode', 'districtCode', 'branchId']) assert.ok(!(field in patient), field);
    assert.ok(!('pinfl' in data.tables.Doctor[0]));
    assert.ok(!('telegramChatId' in data.tables.Receptionist[0]));
    for (const secret of ['password', 'username', 'botToken', 'aiApiKey', 'eskizEmail', 'status']) assert.ok(!(secret in data.clinic), secret);
    assert.equal(data.clinic.name, 'Smile Dent');
    assert.equal(data.clinic.accessControl, '{"v":1}');
});

test('xodimlarning parol xeshi saqlanadi — dentalocal da o\'sha login bilan kiriladi', async () => {
    const data = await buildClinicExport(fakePrisma, 'cloud-clinic-1');
    assert.equal(data.tables.Doctor.find(d => d.id === 'doc-1')!.password, '$2a$10$hash1');
});

test('bog\'langan jadvallar ham olinadi: tish, rasm, bo\'lib to\'lash qismlari, ombor, ICD-10', async () => {
    const data = await buildClinicExport(fakePrisma, 'cloud-clinic-1');
    assert.equal(data.tables.ToothData.length, 2);
    assert.equal(data.tables.PatientPhoto.length, 1);
    assert.equal(data.tables.InstallmentItem.length, 2);
    assert.equal(data.tables.InventoryLog.length, 1);
    assert.deepEqual(data.tables.ICD10Code.map(c => c.code), ['K02.1']);
    assert.equal(data.checks.counts.Transaction, 12);
});

test('bemorlar qarzi — umumiy qoida bo\'yicha (dentalocal shu bilan solishtiradi)', async () => {
    const data = await buildClinicExport(fakePrisma, 'cloud-clinic-1');
    // p4: belgisiz eski qarz 500k + muddati o'tgan 70k + id siz 30k (yagona ism) + faol reja 1 000 000
    assert.deepEqual(data.checks.patientDebts, { p4: 1600000, p1: 150000, p2: 80000 });
    // Ikki "Rustamov Ali" — id siz 40k hech kimga qo'shilmaydi, lekin umumiy qarzda bor
    assert.equal(data.checks.totalDebt, 1870000);
});

test('bemor bo\'yicha to\'liq tekshiruv: qarz, to\'langan, avans, qabullar', async () => {
    const data = await buildClinicExport(fakePrisma, 'cloud-clinic-1');
    // p1: to'langan 100k + 50k (qarzning yopilgan qismi) + avans 100k + avansdan 20k
    assert.deepEqual(data.checks.patients.p1, { debt: 150000, paid: 270000, balance: 100000, appointments: 1 });
    assert.deepEqual(data.checks.patients.p4, { debt: 1600000, paid: 500000, balance: 0, appointments: 1 });
    // Qarzi yo'q bemor ham ro'yxatda (0 lar bilan) — dentalocal hammasini solishtiradi
    assert.deepEqual(data.checks.patients.p3, { debt: 0, paid: 0, balance: 0, appointments: 0 });
    // Eski dentalocal o'rnatishlari uchun qarz alohida ham turadi
    assert.equal(data.checks.patientDebts.p1, 150000);
});

test('topilmagan klinika — xato', async () => {
    await assert.rejects(() => buildClinicExport(fakePrisma, 'yoq'), /Klinika topilmadi/);
});

test('fayl nomi — lotin harflari', () => {
    assert.equal(exportFileName("Tabassum' Dent №1", '2026-10-22'), 'DentaCRM-Tabassum_Dent_1-2026-10-22.json.gz');
    assert.equal(exportFileName('', '2026-10-22'), 'DentaCRM-klinika-2026-10-22.json.gz');
});
