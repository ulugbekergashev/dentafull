// Bajarilgan ish va to'lov hisobi (utils/workBilling.ts) — denta7 va dentalocal da AYNAN BIR XIL test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUnbilledWork, buildTechnicianCostIndex, WorkTx, WorkAppointment } from '../utils/workBilling';

const appt = (id: string, date: string, works: [string, number][], status = 'Completed'): WorkAppointment => ({
    id, date, status,
    notes: 'Bajarilgan ishlar:\n' + works.map(([name, price]) => `- ${name} [${price.toLocaleString('ru-RU')} UZS]`).join('\n'),
});
// Qabul izohidan to'lov yozuvidagi ko'rinish (utils/appointmentTotal.ts bilan bir xil shakl)
const breakdownOf = (a: WorkAppointment): string => {
    const items = (a.notes || '').split('\n').map(l => l.match(/^-\s*(.*?)\s*\[([\d\s  ]+)\s*UZS\]/)).filter(Boolean) as RegExpMatchArray[];
    const total = items.reduce((s, m) => s + Number(m[2].replace(/\D/g, '')), 0);
    return items.map(m => `${m[1]}|${m[2]}`).join('||') + (items.length ? `||TOTAL|${total}` : '');
};
const tx = (over: Partial<WorkTx>): WorkTx => ({ service: '', status: 'Paid', type: 'Cash', date: '2026-10-01', amount: 0, ...over });

test('to\'lovdan keyin qo\'shilgan ish ko\'rinadi — faqat o\'sha qolgan ish', () => {
    const a = appt('a1', '2026-10-01', [['Plomba', 300000], ['Rentgen', 50000]]);
    const paid = tx({ id: 't1', service: 'Plomba|300 000||TOTAL|300 000', amount: 300000 });
    const [work] = findUnbilledWork([a], [paid], breakdownOf);
    assert.equal(work.appointment.id, 'a1');
    assert.equal(work.remaining!.total, 50000);
    assert.match(work.remaining!.breakdown, /^Rentgen\|/);
});

test('hamma ishlar to\'langan qabul yopiladi', () => {
    const a = appt('a1', '2026-10-01', [['Plomba', 300000]]);
    assert.deepEqual(findUnbilledWork([a], [tx({ id: 't1', service: breakdownOf(a), amount: 300000 })], breakdownOf), []);
});

test('qarzga yozilgan, keyin boshqa kuni yopilgan ish — qabul to\'langan (bulutdagi forDate)', () => {
    const a = appt('a1', '2026-10-01', [['Koronka', 1500000]]);
    const list = breakdownOf(a);
    const txs = [
        tx({ id: 't1', service: `${list} (Qisman to'lov)`, amount: 500000 }),
        // qarz boshqa kuni to'liq yopilgan: sana — to'lov kuni, forDate — tashrif kuni
        tx({ id: 't2', service: `${list} (Qarz)`, amount: 1000000, date: '2026-10-15', forDate: '2026-10-01' }),
    ];
    assert.deepEqual(findUnbilledWork([a], txs, breakdownOf), []);
});

test('ikkinchi tashrif uchun to\'lov birinchi tashrifni yopmaydi', () => {
    const a1 = appt('a1', '2026-10-01', [['Konsultatsiya', 100000]]);
    const a2 = appt('a2', '2026-10-08', [['Konsultatsiya', 100000]]);
    const paid = tx({ id: 't2', service: breakdownOf(a2), amount: 100000, date: '2026-10-08' });
    assert.deepEqual(findUnbilledWork([a1, a2], [paid], breakdownOf).map(w => w.appointment.id), ['a1']);
});

test('dentalocal: qabulga bog\'langan yozuv (appointmentId) sanadan qat\'i nazar yopadi', () => {
    const a = appt('a1', '2026-10-01', [['Plomba', 300000]]);
    const paid = tx({ id: 't1', service: breakdownOf(a), amount: 300000, date: '2026-10-20', appointmentId: 'a1' });
    assert.deepEqual(findUnbilledWork([a], [paid], breakdownOf), []);
});

test('"Bepul" yozuvi ishlar ro\'yxati bilan — qolgan ishni yopadi', () => {
    const a = appt('a1', '2026-10-01', [['Plomba', 300000], ['Rentgen', 50000]]);
    const txs = [
        tx({ id: 't1', service: 'Plomba|300 000||TOTAL|300 000', amount: 300000 }),
        tx({ id: 't2', service: 'Rentgen|50 000||TOTAL|50 000 (Bepul: kafolat)', amount: 0, discountAmount: 50000, discountPercent: 100 }),
    ];
    assert.deepEqual(findUnbilledWork([a], txs, breakdownOf), []);
});

test('avans depoziti va hali kelinmagan qabul hisobga kirmaydi', () => {
    const a = appt('a1', '2026-10-01', [['Plomba', 300000]]);
    const future = appt('a2', '2026-10-30', [['Plomba', 300000]], 'Pending');
    const deposit = tx({ id: 't1', service: 'Avans', amount: 300000 });
    assert.deepEqual(findUnbilledWork([a, future], [deposit], breakdownOf).map(w => w.appointment.id), ['a1']);
});

test('texnik haqqi chegirmadan kamaymaydi; bo\'lingan ishda qismlarga taqsimlanadi', () => {
    const services = [{ name: 'Koronka', price: 1000000, cost: 300000 }];
    const whole = tx({ id: 't1', service: 'Koronka', amount: 950000, discountAmount: 50000 });
    assert.equal(buildTechnicianCostIndex([whole], services).get(whole), 300000);

    const part = tx({ id: 't2', patientId: 'p1', service: "Koronka|1 000 000||TOTAL|1 000 000 (Qisman to'lov)", amount: 600000 });
    const debt = tx({ id: 't3', patientId: 'p1', service: 'Koronka|1 000 000||TOTAL|1 000 000 (Qarz)', amount: 400000, status: 'Pending' });
    const index = buildTechnicianCostIndex([part, debt], services);
    assert.equal(Math.round(index.get(part)!), 180000);
    assert.equal(Math.round(index.get(debt)!), 120000);
});
