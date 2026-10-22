// Qarz qoidalari (backend/shared/debtRules.ts) — denta7 va dentalocal da AYNAN BIR XIL test.
// Ishga tushirish: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isOpenCharge, installmentRemaining, patientDebt, buildDebtors, totalDebt, planDebtPayment,
    txBelongsToPatient, DEBT_REPAID_SUFFIX, DebtTx, DebtPlan,
} from '../backend/shared/debtRules';

const tx = (over: Partial<DebtTx> & { amount: number }): DebtTx => ({
    patientId: 'p1', patientName: 'Aliyev Vali', status: 'Pending', type: 'Cash', service: 'Plomba', date: '2026-10-01', ...over,
});

test('ochiq yozuv: Pending va Overdue — qarz; Paid, avans va eski Expense — qarz emas', () => {
    assert.equal(isOpenCharge(tx({ amount: 100 })), true);
    assert.equal(isOpenCharge(tx({ amount: 100, status: 'Overdue' })), true);
    assert.equal(isOpenCharge(tx({ amount: 100, status: 'Paid' })), false);
    assert.equal(isOpenCharge(tx({ amount: 100, service: ' avans ' })), false);
    assert.equal(isOpenCharge(tx({ amount: 100, type: 'Expense' })), false);
    assert.equal(isOpenCharge(null), false);
});

test('"qarz" belgisi bo\'lmagan ochiq yozuv ham qarz (bulutdagi eski yozuvlar)', () => {
    const rows = [tx({ amount: 300000, service: 'Kanal plomba' }), tx({ amount: 200000, service: 'Plomba (Qarz)' })];
    assert.equal(patientDebt({ id: 'p1', name: 'Aliyev Vali' }, rows).charges, 500000);
});

test('bo\'lib to\'lash: faqat faol rejaning to\'lanmagan qismi', () => {
    assert.equal(installmentRemaining({ patientId: 'p1', totalAmount: 1000000, totalPaid: 400000, status: 'Active' }), 600000);
    assert.equal(installmentRemaining({ patientId: 'p1', totalAmount: 1000000, totalPaid: 1000000, status: 'Completed' }), 0);
    assert.equal(installmentRemaining({ patientId: 'p1', totalAmount: 1000000, totalPaid: 0, status: 'Cancelled' }), 0);
    assert.equal(installmentRemaining({ patientId: 'p1', totalAmount: 100, totalPaid: 300, status: 'Active' }), 0);
});

test('bemorga bog\'lash: id bo\'lsa faqat id, id siz eski yozuv — ism bo\'yicha', () => {
    const vali = { id: 'p1', name: 'Aliyev Vali' };
    // Bir xil ismli boshqa bemorning yozuvi — Valiga tushmasin
    assert.equal(txBelongsToPatient(tx({ amount: 1, patientId: 'p2' }), vali), false);
    assert.equal(txBelongsToPatient(tx({ amount: 1, patientId: null, patientName: ' aliyev   VALI ' }), vali), true);
    assert.equal(txBelongsToPatient(tx({ amount: 1, patientId: null, patientName: 'Boshqa Odam' }), vali), false);
});

test('bemorning qarzi = ochiq yozuvlar + faol rejalar', () => {
    const txs = [
        tx({ amount: 100000 }),
        tx({ amount: 50000, status: 'Overdue' }),
        tx({ amount: 999, status: 'Paid' }),
        tx({ amount: 70000, patientId: 'p2' }),
    ];
    const plans: DebtPlan[] = [
        { patientId: 'p1', totalAmount: 600000, totalPaid: 100000, status: 'Active' },
        { patientId: 'p2', totalAmount: 600000, totalPaid: 0, status: 'Active' },
    ];
    assert.deepEqual(patientDebt({ id: 'p1', name: 'Aliyev Vali' }, txs, plans), { charges: 150000, installments: 500000, total: 650000 });
});

test('qarzdorlar ro\'yxati: id bo\'yicha guruh, yig\'indisi umumiy qarzga teng', () => {
    const patients = [
        { id: 'p1', name: 'Aliyev Vali' },
        { id: 'p2', name: 'Karimova Nodira' },
        { id: 'p3', name: 'Rustamov Ali' },
        { id: 'p4', name: 'Rustamov Ali' },
    ];
    const txs = [
        tx({ amount: 100000 }),
        tx({ amount: 40000, patientId: null, patientName: 'Aliyev Vali', date: '2026-09-01' }), // yagona Aliyev Vali ga qo'shiladi
        tx({ amount: 30000, patientId: null, patientName: 'Rustamov Ali' }),                    // ikkita Rustamov — alohida qator
        tx({ amount: 20000, patientId: 'p2', patientName: 'Karimova N.' }),
        tx({ amount: 5000, patientId: 'p2', status: 'Paid' }),
    ];
    const plans: DebtPlan[] = [{ patientId: 'p2', totalAmount: 300000, totalPaid: 100000, status: 'Active' }];
    const rows = buildDebtors(txs, plans, patients);

    assert.deepEqual(rows.map(r => [r.key, r.total]), [
        ['p2', 220000],
        ['p1', 140000],
        ['name:rustamov ali', 30000],
    ]);
    const vali = rows.find(r => r.key === 'p1')!;
    assert.equal(vali.chargeCount, 2);
    assert.equal(vali.oldestDate, '2026-09-01');
    assert.equal(rows.find(r => r.key === 'p2')!.patientName, 'Karimova Nodira');
    assert.equal(rows.reduce((s, r) => s + r.total, 0), totalDebt(txs, plans));
});

test('qarzi yo\'q bemor ro\'yxatga kirmaydi', () => {
    assert.deepEqual(buildDebtors([tx({ amount: 100, status: 'Paid' })], [], [{ id: 'p1', name: 'Aliyev Vali' }]), []);
});

test('qarzni to\'liq to\'lash — yozuvning o\'zi yopiladi', () => {
    const plan = planDebtPayment({ amount: 300000, discountAmount: 0, service: 'Plomba' }, { paid: 300000, method: 'Card', today: '2026-10-22' })!;
    assert.equal(plan.full, true);
    assert.equal(plan.remaining, 0);
    assert.deepEqual(plan.update, { status: 'Paid', amount: 300000, type: 'Card', date: '2026-10-22' });
    assert.equal(plan.create, undefined);
});

test('qarzdan ko\'p pul olinmaydi', () => {
    const plan = planDebtPayment({ amount: 300000 }, { paid: 500000, method: 'Cash', today: '2026-10-22' })!;
    assert.equal(plan.full, true);
    assert.equal(plan.paid, 300000);
    assert.equal(plan.update.amount, 300000);
});

test('qisman to\'lash — alohida yozuv, qarz kamayadi, chegirma ulushga qarab bo\'linadi', () => {
    const plan = planDebtPayment({ amount: 400000, discountAmount: 100000, service: 'Koronka' }, { paid: 100000, method: 'Cash', today: '2026-10-22' })!;
    assert.equal(plan.full, false);
    assert.equal(plan.remaining, 300000);
    assert.deepEqual(plan.update, { amount: 300000, discountAmount: 75000 });
    assert.equal(plan.create!.service, `Koronka${DEBT_REPAID_SUFFIX}`);
    assert.equal(plan.create!.amount, 100000);
    assert.equal(plan.create!.discountAmount, 25000);
    // Pul ham, chegirma ham yo'qolmaydi va ikki marta sanalmaydi
    assert.equal(plan.create!.amount + plan.update.amount, 400000);
    assert.equal(plan.create!.discountAmount + plan.update.discountAmount!, 100000);
});

test('qo\'shimcha chegirma bilan yopish', () => {
    const full = planDebtPayment({ amount: 300000, discountAmount: 0 }, { paid: 250000, extraDiscount: 50000, method: 'Cash', today: '2026-10-22' })!;
    assert.equal(full.full, true);
    assert.deepEqual(full.update, { status: 'Paid', amount: 250000, type: 'Cash', date: '2026-10-22', discountAmount: 50000, discountPercent: 17 });

    const part = planDebtPayment({ amount: 300000, discountAmount: 0, service: 'X' }, { paid: 100000, extraDiscount: 50000, method: 'Cash', today: '2026-10-22' })!;
    assert.equal(part.full, false);
    assert.equal(part.remaining, 150000);
    assert.equal(part.create!.discountAmount, 50000);
    assert.equal(part.update.amount, 150000);
});

test('pulsiz qisman yopish va bo\'sh qarz — reja yo\'q', () => {
    assert.equal(planDebtPayment({ amount: 300000 }, { paid: 0, method: 'Cash', today: '2026-10-22' }), null);
    assert.equal(planDebtPayment({ amount: 300000 }, { paid: 0, extraDiscount: 100000, method: 'Cash', today: '2026-10-22' }), null);
    assert.equal(planDebtPayment({ amount: 0 }, { paid: 100, method: 'Cash', today: '2026-10-22' }), null);
});
