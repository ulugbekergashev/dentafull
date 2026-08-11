import { Transaction, Expense, Doctor, PaymentMethod, CashRegisterDay } from '../types';
import { findDoctorForTransaction } from './financialCalculations';
import {
    PAYMENT_METHODS,
    isCashDrawerMethod,
    isMoneyInMethod,
} from './paymentMethods';

// ─────────────────────────────────────────────────────────────────────────────
// KASSA KITOBI — faqat haqiqiy pul harakati.
//
// Moliya sahifasidan farqi: u hisoblangan daromadni (accrual) ko'rsatadi, bu esa
// kassaga nima kirib, nima chiqqanini. Ikkalasi ataylab boshqa raqam beradi:
//   • 'Balance' turi — bemor avansidan yechilgan, bugun kassaga yangi pul KIRMAYDI.
//   • 'Avans' xizmati — pul bugun kirdi, garchi xizmat keyinroq bajarilsa ham.
//   • Qarzga yozilgan (Pending) to'lovlar kassaga umuman kirmaydi.
//
// "Kassada qoldi" = naqd tushum − naqd xarajat. Klient Excelidagi «Остаток» formulasi
// (Jami − Rasxod − Terminal − Click) shu bilan bir xil natija beradi.
// ─────────────────────────────────────────────────────────────────────────────

export const UNASSIGNED_DOCTOR_ID = '__unassigned__';

export interface CashBookRow {
    id: string;
    /** "14:32" — eski yozuvlarda vaqt saqlanmagan, shunda null */
    time: string | null;
    /** Tartiblash uchun daqiqa (vaqti yo'q qatorlar oxirida turadi) */
    sortKey: number;
    patientName: string;
    patientId?: string;
    service: string;
    method: PaymentMethod;
    amount: number;
    doctorId: string;
    doctorName: string;
    /** Kassaga pul kirdimi ('Balance' — yo'q) */
    isMoneyIn: boolean;
    isCash: boolean;
}

export interface CashBookDoctorColumn {
    id: string;
    name: string;
    total: number;
    cash: number;
    nonCash: number;
}

export interface CashBookTotals {
    /** Kassaga tushgan jami (Excel «Общая») — avansdan yechilganlarsiz */
    gross: number;
    byMethod: Record<string, number>;
    cashIn: number;
    nonCashIn: number;
    expenseTotal: number;
    cashExpense: number;
    nonCashExpense: number;
    /** Naqd yashikda qolgan pul (Excel «Остаток») */
    drawer: number;
    /** Avansdan yechilgan — kassaga kirmaydi, ma'lumot uchun */
    fromBalance: number;
    /** Shu kunda qarzga yozilgani (status Pending/Overdue) */
    unpaid: number;
    paymentCount: number;
}

export interface CashBookDay {
    date: string;
    rows: CashBookRow[];
    doctorColumns: CashBookDoctorColumn[];
    expenses: Expense[];
    totals: CashBookTotals;
}

const EMPTY_BY_METHOD = (): Record<string, number> => {
    const acc: Record<string, number> = {};
    PAYMENT_METHODS.forEach(m => { acc[m.key] = 0; });
    return acc;
};

const emptyTotals = (): CashBookTotals => ({
    gross: 0,
    byMethod: EMPTY_BY_METHOD(),
    cashIn: 0,
    nonCashIn: 0,
    expenseTotal: 0,
    cashExpense: 0,
    nonCashExpense: 0,
    drawer: 0,
    fromBalance: 0,
    unpaid: 0,
    paymentCount: 0,
});

/** ISO sanani (yoki DateTime satrini) 'YYYY-MM-DD' ga keltiradi */
const dayOf = (value?: string | null): string => (value || '').split('T')[0];

/** createdAt DateTime satridan lokal "HH:MM" chiqaradi */
function extractTime(createdAt?: string | null): { label: string | null; minutes: number } {
    if (!createdAt) return { label: null, minutes: Number.MAX_SAFE_INTEGER };
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return { label: null, minutes: Number.MAX_SAFE_INTEGER };
    const h = d.getHours();
    const m = d.getMinutes();
    return {
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        minutes: h * 60 + m,
    };
}

function doctorLabel(doctor: Doctor): string {
    return `${doctor.lastName} ${doctor.firstName}`.trim();
}

/**
 * Ustunlar ro'yxati — shifokorlar barcha kunlarda bir xil tartibda turishi uchun
 * doctors ro'yxatidan quriladi. "Belgilanmagan" ustuni faqat kerak bo'lganda qo'shiladi.
 */
function buildDoctorColumns(doctors: Doctor[], rows: CashBookRow[]): CashBookDoctorColumn[] {
    const columns = new Map<string, CashBookDoctorColumn>();

    doctors.forEach(d => {
        columns.set(d.id, { id: d.id, name: doctorLabel(d), total: 0, cash: 0, nonCash: 0 });
    });

    rows.forEach(row => {
        if (!row.isMoneyIn) return;
        let col = columns.get(row.doctorId);
        if (!col) {
            // O'chirilgan shifokor yoki biriktirilmagan to'lov — summalar yo'qolmasligi uchun ustun qo'shamiz
            col = { id: row.doctorId, name: row.doctorName, total: 0, cash: 0, nonCash: 0 };
            columns.set(row.doctorId, col);
        }
        col.total += row.amount;
        if (row.isCash) col.cash += row.amount;
        else col.nonCash += row.amount;
    });

    const list = Array.from(columns.values());
    // "Belgilanmagan" har doim oxirida
    return list.sort((a, b) => {
        if (a.id === UNASSIGNED_DOCTOR_ID) return 1;
        if (b.id === UNASSIGNED_DOCTOR_ID) return -1;
        return a.name.localeCompare(b.name, 'uz');
    });
}

function toRow(tx: Transaction, doctors: Doctor[]): CashBookRow {
    const doctor = findDoctorForTransaction(tx, doctors);
    const { label, minutes } = extractTime(tx.createdAt);
    const method = (tx.type || 'Cash') as PaymentMethod;
    const moneyIn = isMoneyInMethod(method);

    return {
        id: tx.id,
        time: label,
        sortKey: minutes,
        patientName: tx.patientName || '—',
        patientId: tx.patientId,
        service: tx.service || '',
        method,
        amount: tx.amount || 0,
        doctorId: doctor?.id ?? UNASSIGNED_DOCTOR_ID,
        doctorName: doctor ? doctorLabel(doctor) : (tx.doctorName?.trim() || 'Belgilanmagan'),
        isMoneyIn: moneyIn,
        isCash: moneyIn && isCashDrawerMethod(method),
    };
}

function accumulate(totals: CashBookTotals, row: CashBookRow) {
    if (!row.isMoneyIn) {
        totals.fromBalance += row.amount;
        totals.byMethod[row.method] = (totals.byMethod[row.method] || 0) + row.amount;
        return;
    }
    totals.gross += row.amount;
    totals.paymentCount += 1;
    totals.byMethod[row.method] = (totals.byMethod[row.method] || 0) + row.amount;
    if (row.isCash) totals.cashIn += row.amount;
    else totals.nonCashIn += row.amount;
}

function accumulateExpense(totals: CashBookTotals, expense: Expense) {
    const amount = expense.amount || 0;
    totals.expenseTotal += amount;
    if (isCashDrawerMethod(expense.method)) totals.cashExpense += amount;
    else totals.nonCashExpense += amount;
}

/**
 * Bir kunlik kassa varag'i: bemor × shifokor matritsasi + kunlik yakun.
 */
export function buildCashBookDay(
    date: string,
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[]
): CashBookDay {
    const totals = emptyTotals();

    const dayTransactions = transactions.filter(t => t && dayOf(t.date) === date);

    const rows = dayTransactions
        .filter(t => t.status === 'Paid')
        .map(t => toRow(t, doctors))
        .sort((a, b) => a.sortKey - b.sortKey || a.patientName.localeCompare(b.patientName, 'uz'));

    rows.forEach(row => accumulate(totals, row));

    dayTransactions
        .filter(t => t.status !== 'Paid')
        .forEach(t => { totals.unpaid += t.amount || 0; });

    const dayExpenses = expenses
        .filter(e => e && dayOf(e.date) === date)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    dayExpenses.forEach(e => accumulateExpense(totals, e));

    totals.drawer = totals.cashIn - totals.cashExpense;

    return {
        date,
        rows,
        doctorColumns: buildDoctorColumns(doctors, rows),
        expenses: dayExpenses,
        totals,
    };
}

export interface CashBookMonthDay {
    date: string;
    day: number;
    totals: CashBookTotals;
    /** shifokor id → shu kundagi tushumi */
    byDoctor: Record<string, number>;
    hasActivity: boolean;
}

export interface CashBookMonth {
    /** 'YYYY-MM' */
    month: string;
    days: CashBookMonthDay[];
    doctorColumns: CashBookDoctorColumn[];
    totals: CashBookTotals;
    /** Oy davomida naqd yashikdagi o'zgarishlar yig'indisi */
    runningDrawer: number;
}

/** 'YYYY-MM' oyidagi kunlar sonini qaytaradi */
export function daysInMonth(month: string): number {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return 0;
    return new Date(y, m, 0).getDate();
}

/**
 * Oylik daftar: har bir kun bitta qator, oxirida oy yakuni.
 */
export function buildCashBookMonth(
    month: string,
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[]
): CashBookMonth {
    const count = daysInMonth(month);
    const monthTotals = emptyTotals();

    // Oy ichidagi yozuvlarni bir marta filtrlab, kunlarga bo'lib olamiz —
    // har kun uchun butun ro'yxatni qayta aylanmaslik uchun.
    const txByDay = new Map<string, Transaction[]>();
    transactions.forEach(t => {
        const d = dayOf(t?.date);
        if (!d.startsWith(month)) return;
        const list = txByDay.get(d);
        if (list) list.push(t); else txByDay.set(d, [t]);
    });

    const expByDay = new Map<string, Expense[]>();
    expenses.forEach(e => {
        const d = dayOf(e?.date);
        if (!d.startsWith(month)) return;
        const list = expByDay.get(d);
        if (list) list.push(e); else expByDay.set(d, [e]);
    });

    const allRows: CashBookRow[] = [];
    const days: CashBookMonthDay[] = [];

    for (let i = 1; i <= count; i++) {
        const date = `${month}-${String(i).padStart(2, '0')}`;
        const dayTx = txByDay.get(date) || [];
        const dayExp = expByDay.get(date) || [];
        const totals = emptyTotals();
        const byDoctor: Record<string, number> = {};

        dayTx.forEach(t => {
            if (t.status !== 'Paid') {
                totals.unpaid += t.amount || 0;
                return;
            }
            const row = toRow(t, doctors);
            allRows.push(row);
            accumulate(totals, row);
            if (row.isMoneyIn) {
                byDoctor[row.doctorId] = (byDoctor[row.doctorId] || 0) + row.amount;
            }
        });

        dayExp.forEach(e => accumulateExpense(totals, e));
        totals.drawer = totals.cashIn - totals.cashExpense;

        days.push({
            date,
            day: i,
            totals,
            byDoctor,
            hasActivity: dayTx.length > 0 || dayExp.length > 0,
        });

        // Oy yakuniga qo'shish
        monthTotals.gross += totals.gross;
        monthTotals.cashIn += totals.cashIn;
        monthTotals.nonCashIn += totals.nonCashIn;
        monthTotals.expenseTotal += totals.expenseTotal;
        monthTotals.cashExpense += totals.cashExpense;
        monthTotals.nonCashExpense += totals.nonCashExpense;
        monthTotals.fromBalance += totals.fromBalance;
        monthTotals.unpaid += totals.unpaid;
        monthTotals.paymentCount += totals.paymentCount;
        Object.keys(totals.byMethod).forEach(k => {
            monthTotals.byMethod[k] = (monthTotals.byMethod[k] || 0) + totals.byMethod[k];
        });
    }

    monthTotals.drawer = monthTotals.cashIn - monthTotals.cashExpense;

    return {
        month,
        days,
        doctorColumns: buildDoctorColumns(doctors, allRows),
        totals: monthTotals,
        runningDrawer: monthTotals.drawer,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// KUNNI YOPISH
// ─────────────────────────────────────────────────────────────────────────────

export interface CashClosureStatus {
    closed: boolean;
    closure?: CashRegisterDay;
    /**
     * Kun yopilgandan keyin kassa summasi o'zgardimi.
     * Yopish kunni qulflamaydi, shuning uchun kechroq kelgan to'lov shu bayroq bilan ko'rinadi.
     */
    changedAfterClose: boolean;
    /** Sanalgan naqd − hozirgi hisob bo'yicha naqd (yopilgandan keyin o'zgargan bo'lsa yangilanadi) */
    currentDifference: number;
}

/** 1 so'mgacha farqni yaxlitlash xatosi deb hisoblaymiz */
const EPSILON = 1;

export function getClosureStatus(
    date: string,
    currentDrawer: number,
    closures: CashRegisterDay[]
): CashClosureStatus {
    const closure = closures.find(c => dayOf(c.date) === date);
    if (!closure) {
        return { closed: false, changedAfterClose: false, currentDifference: 0 };
    }
    const drift = Math.abs((closure.expectedCash || 0) - currentDrawer);
    return {
        closed: true,
        closure,
        changedAfterClose: drift > EPSILON,
        currentDifference: (closure.countedCash || 0) - currentDrawer,
    };
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
export function formatDateLabel(date: string): string {
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return date;
    return `${d}.${m}.${y}`;
}

const MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/** 'YYYY-MM' → 'Avgust 2026' */
export function formatMonthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Sanani kun bo'yicha siljitadi (satr → satr, zona siljishisiz) */
export function shiftDate(date: string, deltaDays: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Oyni siljitadi: '2026-08' → '2026-09' */
export function shiftMonth(month: string, deltaMonths: number): string {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + deltaMonths, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
