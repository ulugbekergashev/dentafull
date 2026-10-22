// Bulut: shifokor ulushi (texnik xarajati ayirilgan summadan) va Kassa oylik ko'rinishi (2026-10-22, dentalocal dan)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDoctorShares, calculateTotalFinancials } from '../utils/financialCalculations';
import { buildCashBookDay, buildCashBookMonth } from '../utils/cashbook';

const doctor: any = { id: 'd1', firstName: 'Bobur', lastName: 'Karimov', percentage: 40, salaryType: 'kpi' };
const services: any[] = [{ id: 1, name: 'Koronka', price: 1000000, cost: 300000, duration: 60 }];
const tx = (over: any): any => ({ id: Math.random().toString(36), clinicId: 'c1', patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'd1', status: 'Paid', type: 'Cash', date: '2026-10-05', ...over });

test('shifokor ulushi texnik haqqi ayirilgan summadan hisoblanadi', () => {
    const txs = [tx({ amount: 950000, service: 'Koronka', discountAmount: 50000 })];
    const [share] = calculateDoctorShares(txs, [], [doctor], services);
    // (950 000 − 300 000) × 40%
    assert.equal(Math.round(share.accrued), 260000);
    assert.equal(share.technicianCost, 300000);
    assert.equal(share.grossRevenue, 950000);
});

test('xizmatlar berilmasa — avvalgidek to\'liq summadan', () => {
    const [share] = calculateDoctorShares([tx({ amount: 950000, service: 'Koronka' })], [], [doctor]);
    assert.equal(Math.round(share.accrued), 380000);
});

test('bo\'lingan ish: texnik haqqi qismlarga taqsimlanadi, jami bir marta', () => {
    const all = [
        tx({ amount: 600000, service: "Koronka|1 000 000||TOTAL|1 000 000 (Qisman to'lov)" }),
        tx({ amount: 400000, service: 'Koronka|1 000 000||TOTAL|1 000 000 (Qarz)', status: 'Pending', date: '2026-10-05' }),
    ];
    // Davr filtri faqat to'langan qismni oladi, lekin taqsimlash to'liq ro'yxat (context) bo'yicha
    const [share] = calculateDoctorShares([all[0]], [], [doctor], services, all);
    assert.equal(Math.round(share.technicianCost), 180000);
    assert.equal(Math.round(share.accrued), Math.round((600000 - 180000) * 0.4));
});

test('sof foyda: daromad − ulush − boshqa xarajatlar (laboratoriya xarajati ikki marta ayirilmaydi)', () => {
    const txs = [tx({ amount: 1000000, service: 'Koronka' })];
    const lab: any = { id: 'e1', category: 'Lab', amount: 300000, date: '2026-10-05' };
    const f = calculateTotalFinancials(txs, [lab], [doctor], services);
    assert.equal(Math.round(f.doctorShareAccrued), 280000);
    assert.equal(Math.round(f.netProfit), 1000000 - 280000 - 300000);
});

test('Kassa: oylik jadvaldagi kun qoldig\'i kunlik varaq bilan bir xil', () => {
    const txs = [
        tx({ amount: 200000, date: '2026-10-01', createdAt: '2026-10-01T05:00:00Z', service: 'Plomba' }),
        tx({ amount: 100000, date: '2026-10-02', createdAt: '2026-10-02T05:00:00Z', service: 'Plomba' }),
        tx({ amount: 50000, date: '2026-10-03', createdAt: '2026-10-03T05:00:00Z', service: 'Plomba' }),
    ];
    const closures: any[] = [{ id: 'c1', clinicId: 'c1', date: '2026-10-01', shift: 1, countedCash: 200000, handedOver: 150000, closedAt: '2026-10-01T15:00:00Z' }];
    const month = buildCashBookMonth('2026-10', txs, [], [doctor], closures, []);
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) {
        const day = buildCashBookDay(d, txs, [], [doctor], closures, []);
        const row = month.days.find(x => x.date === d)!;
        assert.equal(row.totals.drawer, day.totals.drawer, d);
    }
    // Oy yakuni — ochilish + oy oqimi (topshirilgan pul yashikda yo'q)
    assert.equal(month.totals.netCashFlow, 350000);
});
