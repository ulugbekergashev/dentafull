// Qabul summasi (utils/appointmentTotal.ts — dentalocal da ham aynan shu fayl)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAppointmentTotal } from '../utils/financialCalculations';

const services: any[] = [
    { id: 1, name: 'Plomba', price: 300000 },
    { id: 2, name: 'Endodontiya', price: 330000 },
    { id: 3, name: 'Periodontit', price: 420000 },
];

test('narxli qatorlar qo\'shiladi', () => {
    const r = calculateAppointmentTotal("Bajarilgan ishlar:\n- Plomba (Tish #16) [300 000 UZS]\n- Koronka (Tish #36) [1 500 000 UZS]", services);
    assert.equal(r.total, 1800000);
    // toLocaleString raqamlar orasiga bo'linmas bo'shliq qo'yadi
    assert.equal(r.breakdown.replace(/\s/g, ' '), 'Plomba (Tish #16)|300 000||Koronka (Tish #36)|1 500 000||TOTAL|1 800 000');
});

test('qabulga yozishdagi erkin matn (reja) pulga kirmaydi', () => {
    // dentalocal dagi klinika: "Periodontit Endodontiya ... 48" — 420 000 o'rniga 750 000 chiqardi
    const r = calculateAppointmentTotal("Periodontit Endodontiya 48\nBajarilgan ishlar:\n- Periodontit (Tish #48) [420 000 UZS]", services);
    assert.equal(r.total, 420000);
});

test('eski narxsiz band faqat ishlar blokida narxnomadan olinadi', () => {
    assert.equal(calculateAppointmentTotal('Bajarilgan ishlar:\n- Plomba', services).total, 300000);
    assert.equal(calculateAppointmentTotal('- Plomba', services).total, 0);
    assert.equal(calculateAppointmentTotal("Qo'shimcha (11:21:54):\n- Endodontiya", services).total, 330000);
});

test('ogohlantirish qatori pulga kirmaydi', () => {
    const r = calculateAppointmentTotal("Bajarilgan ishlar:\n- Plomba [300 000 UZS]\n⚠️ Majburiy talablarsiz yakunlandi. Sabab: Endodontiya rasmi yo'q", services);
    assert.equal(r.total, 300000);
});
