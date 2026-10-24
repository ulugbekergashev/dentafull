// Ko'chirish tekshiruvi (backend/shared/transferChecks.ts) — denta7 va dentalocal da AYNAN BIR XIL test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientTransferChecks, compareTransferChecks } from '../backend/shared/transferChecks';

const patients = [
    { id: 'p1', lastName: 'Aliyev', firstName: 'Vali', balance: 80000.4 },
    { id: 'p2', lastName: 'Karimova', firstName: 'Nodira', balance: 0 },
];
const tx = (over: any) => ({ status: 'Paid', type: 'Cash', service: 'Plomba', date: '2026-10-01', amount: 0, ...over });
const transactions = [
    tx({ patientId: 'p1', amount: 100000 }),
    tx({ patientId: 'p1', amount: 50000, service: 'Avans' }),
    tx({ patientId: 'p1', amount: 30000, status: 'Pending' }),
    tx({ patientId: 'p1', amount: 999, type: 'Expense' }),
    tx({ patientId: 'p2', amount: 20000, type: 'Balance' }),
];
const plans = [{ patientId: 'p2', totalAmount: 500000, totalPaid: 100000, status: 'Active' }];
const appointments = [
    { patientId: 'p1', date: '2026-10-01' },
    { patientId: 'p1', date: '2026-10-08' },
    { patientId: 'p1', date: '2026-10-08' },
    { patientId: 'p2', date: '2026-10-02' },
    { patientId: 'begona', date: '2026-10-02' },
];

test('har bir bemor: qarz, to\'langan, avans, qabullar', () => {
    const checks = patientTransferChecks({ patients, transactions, plans, appointments });
    assert.deepEqual(checks, {
        p1: { debt: 30000, paid: 150000, balance: 80000, appointments: 2 },
        p2: { debt: 400000, paid: 20000, balance: 0, appointments: 1 },
    });
});

test('bir xil raqamlar — farq yo\'q, jami ko\'rsatiladi', () => {
    const checks = patientTransferChecks({ patients, transactions, plans, appointments });
    const result = compareTransferChecks(patients, { patients: checks }, checks);
    assert.equal(result.mismatchCount, 0);
    assert.deepEqual(result.fields, ['debt', 'paid', 'balance', 'appointments']);
    assert.deepEqual(result.totals.paid, { cloud: 170000, local: 170000 });
    assert.deepEqual(result.totals.appointments, { cloud: 3, local: 3 });
});

test('yo\'qolgan to\'lov va qabul aniqlanadi — bemor va maydon bilan', () => {
    const cloud = patientTransferChecks({ patients, transactions, plans, appointments });
    const local = patientTransferChecks({ patients, transactions: transactions.slice(1), plans, appointments: appointments.slice(1) });
    const result = compareTransferChecks(patients, { patients: cloud }, local);
    assert.equal(result.mismatchCount, 1);
    assert.deepEqual(result.mismatches.map(m => [m.patientId, m.field, m.cloud, m.local]), [
        ['p1', 'paid', 150000, 50000],
        ['p1', 'appointments', 2, 1],
    ]);
    assert.equal(result.mismatches[0].name, 'Aliyev Vali');
});

test('eski fayl (faqat qarz) — faqat qarz solishtiriladi', () => {
    const local = patientTransferChecks({ patients, transactions, plans, appointments: [] });
    const result = compareTransferChecks(patients, { patientDebts: { p1: 30000, p2: 400000 } }, local);
    assert.deepEqual(result.fields, ['debt']);
    assert.equal(result.mismatchCount, 0);
    const wrong = compareTransferChecks(patients, { patientDebts: { p1: 30000 } }, local);
    assert.deepEqual(wrong.mismatches.map(m => [m.patientId, m.field]), [['p2', 'debt']]);
});
