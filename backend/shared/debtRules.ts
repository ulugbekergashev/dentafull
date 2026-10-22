/**
 * QARZ QOIDALARI — denta7 (bulut) va dentalocal (kompyuterdagi nusxa) da AYNAN BIR XIL fayl:
 *   denta7:     backend/shared/debtRules.ts
 *   dentalocal: backend/shared/debtRules.ts
 * Birida o'zgartirsangiz, ikkinchisiga ham o'zgartirmasdan ko'chiring. Klinika bulutdan
 * dentalocal ga o'tganda bemorning qarzi ikkala dasturda bir xil chiqishi shart (2026-10-22).
 *
 * Ilgari har bir sahifa qarzni o'zicha sanardi: biri faqat "Pending" ni, biri "Overdue" ni ham,
 * biri bo'lib to'lashni qo'shib, biri qo'shmay; biri bemorni id bo'yicha, biri ism bo'yicha.
 * Natijada bitta bemorning qarzi Moliya, Bemorlar va Bosh sahifada har xil chiqardi.
 *
 * Qoida (hamma joyda shu):
 *  - Ochiq to'lov yozuvi — Pending yoki Overdue (avans depoziti va eski "Expense" yozuvi emas) —
 *    bemorning qarzi. Yozuvga "qarz" belgisi qo'yilgan-qo'yilmagani ahamiyatsiz: kassada
 *    to'lanmagan summa yozilgan ekan, bemor shuni to'lashi kerak.
 *  - Faol bo'lib to'lash rejasining to'lanmagan qismi ham qarz.
 *  - Yozuv bemorga id bo'yicha bog'lanadi; ism faqat yozuvda bemor id si bo'lmasa (eski yozuvlar).
 *  - "Olinmagan pul" (qabul tugagan, kassada hali hech qanday yozuv yo'q) — qarz EMAS.
 *
 * Fayl hech narsani import qilmaydi — server ham, brauzer ham shu bitta faylni o'qiydi.
 */

export interface DebtTx {
    id?: string;
    patientId?: string | null;
    patientName?: string | null;
    amount?: number | string | null;
    status?: string | null;
    type?: string | null;
    service?: string | null;
    date?: string | null;
}

export interface DebtPlan {
    patientId?: string | null;
    totalAmount?: number | string | null;
    totalPaid?: number | string | null;
    status?: string | null;
}

export interface DebtPatient {
    id: string;
    /** "Familiya Ism" — to'lov yozuvidagi patientName bilan bir xil ko'rinishda */
    name?: string | null;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
};

/** Ismni solishtirish uchun: kichik harf, bo'shliqlar bitta */
export const normalizePatientName = (name: unknown): string =>
    String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Avans depoziti — bemor oldindan qo'ygan pul, qarz ham, tushum ham emas */
export const isAdvanceDeposit = (tx: { service?: string | null }): boolean =>
    String(tx?.service ?? '').trim().toLowerCase() === 'avans';

export const OPEN_STATUSES = ['Pending', 'Overdue'];

/** Bemor to'lashi kerak bo'lgan ochiq yozuv */
export const isOpenCharge = (tx: DebtTx | null | undefined): boolean =>
    !!tx && OPEN_STATUSES.includes(String(tx.status)) && tx.type !== 'Expense' && !isAdvanceDeposit(tx);

/** Bo'lib to'lash rejasining to'lanmagan qismi (faqat faol reja) */
export const installmentRemaining = (plan: DebtPlan | null | undefined): number =>
    plan && plan.status === 'Active' ? Math.max(0, num(plan.totalAmount) - num(plan.totalPaid)) : 0;

/** Yozuv shu bemornikimi: id bo'lsa — faqat id; id siz eski yozuv — to'liq ism */
export function txBelongsToPatient(tx: DebtTx, patient: DebtPatient): boolean {
    if (tx.patientId) return tx.patientId === patient.id;
    const name = normalizePatientName(patient.name);
    return !!name && normalizePatientName(tx.patientName) === name;
}

export interface PatientDebt {
    /** Ochiq to'lov yozuvlari */
    charges: number;
    /** Faol bo'lib to'lash rejalarining qolgani */
    installments: number;
    total: number;
}

/** Bitta bemorning qarzi */
export function patientDebt(patient: DebtPatient, transactions: DebtTx[], plans: DebtPlan[] = []): PatientDebt {
    const charges = (transactions || [])
        .filter(tx => isOpenCharge(tx) && txBelongsToPatient(tx, patient))
        .reduce((sum, tx) => sum + num(tx.amount), 0);
    const installments = (plans || [])
        .filter(p => p.patientId === patient.id)
        .reduce((sum, p) => sum + installmentRemaining(p), 0);
    return { charges, installments, total: charges + installments };
}

export interface DebtorRow {
    /** Bemor id si, id siz eski yozuvlar uchun "name:<ism>" */
    key: string;
    patientId?: string;
    patientName: string;
    charges: number;
    installments: number;
    total: number;
    /** Ochiq yozuvlar soni */
    chargeCount: number;
    /** Eng eski ochiq yozuv sanasi (YYYY-MM-DD) yoki '' */
    oldestDate: string;
}

/**
 * Qarzdorlar ro'yxati — klinika bo'yicha. Id siz eski yozuv shu ismli YAGONA bemorga
 * qo'shiladi (bemorlar ro'yxati berilgan bo'lsa); bunday bemor bir nechta yoki yo'q bo'lsa —
 * alohida qator bo'lib qoladi (pul boshqa odamnikiga qo'shilib ketmasin).
 * Qarzi 0 bo'lganlar ro'yxatga kirmaydi. Katta qarzdan kichigiga saralanadi.
 */
export function buildDebtors(transactions: DebtTx[], plans: DebtPlan[] = [], patients: DebtPatient[] = []): DebtorRow[] {
    const nameOf = new Map<string, string>();
    const idsByName = new Map<string, string[]>();
    for (const p of patients || []) {
        if (!p?.id) continue;
        nameOf.set(p.id, String(p.name ?? '').trim());
        const key = normalizePatientName(p.name);
        if (key) idsByName.set(key, [...(idsByName.get(key) || []), p.id]);
    }

    const rows = new Map<string, DebtorRow>();
    const rowFor = (patientId: string | undefined, name: string): DebtorRow => {
        const key = patientId || `name:${normalizePatientName(name)}`;
        let row = rows.get(key);
        if (!row) {
            row = {
                key, patientId, patientName: (patientId && nameOf.get(patientId)) || name || '—',
                charges: 0, installments: 0, total: 0, chargeCount: 0, oldestDate: '',
            };
            rows.set(key, row);
        }
        return row;
    };

    for (const tx of transactions || []) {
        if (!isOpenCharge(tx)) continue;
        let patientId = tx.patientId || undefined;
        if (!patientId) {
            const same = idsByName.get(normalizePatientName(tx.patientName)) || [];
            if (same.length === 1) patientId = same[0];
        }
        const row = rowFor(patientId, String(tx.patientName ?? '').trim());
        row.charges += num(tx.amount);
        row.chargeCount += 1;
        const day = String(tx.date ?? '').slice(0, 10);
        if (day && (!row.oldestDate || day < row.oldestDate)) row.oldestDate = day;
    }

    for (const plan of plans || []) {
        const left = installmentRemaining(plan);
        if (left <= 0 || !plan.patientId) continue;
        rowFor(plan.patientId, nameOf.get(plan.patientId) || '').installments += left;
    }

    return [...rows.values()]
        .map(r => ({ ...r, total: r.charges + r.installments }))
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);
}

/** Klinikaning umumiy qarzi — buildDebtors yig'indisi bilan aynan bir xil */
export function totalDebt(transactions: DebtTx[], plans: DebtPlan[] = []): number {
    const charges = (transactions || []).filter(isOpenCharge).reduce((sum, tx) => sum + num(tx.amount), 0);
    const installments = (plans || []).filter(p => !!p.patientId).reduce((sum, p) => sum + installmentRemaining(p), 0);
    return charges + installments;
}

// ─── Qarzni to'lash ──────────────────────────────────────────────────────────

export const DEBT_REPAID_SUFFIX = ' (Qarzdorlik yopildi)';

export interface DebtPaymentInput {
    /** Hozir olingan pul */
    paid: number;
    /** Hozir berilgan qo'shimcha chegirma (ixtiyoriy) */
    extraDiscount?: number;
    /** To'lov usuli (Cash, Card, Balance, ...) */
    method: string;
    /** To'lov sanasi, YYYY-MM-DD */
    today: string;
}

export interface DebtPaymentPlan {
    full: boolean;
    /** Haqiqatda olinadigan pul (qarzdan ortig'i olinmaydi) */
    paid: number;
    /** Yopilgandan keyin qolgan qarz */
    remaining: number;
    /** Qarz yozuvining o'zgaradigan maydonlari (to'liq yopilsa — Paid; qisman — qolgan summa) */
    update: {
        status?: 'Paid';
        amount: number;
        type?: string;
        date?: string;
        discountAmount?: number;
        discountPercent?: number;
    };
    /** Qisman to'lovda — yangi "Paid" yozuvning hisoblangan maydonlari (qolganini chaqiruvchi qarzdan oladi) */
    create?: {
        status: 'Paid';
        amount: number;
        type: string;
        date: string;
        service: string;
        discountAmount: number;
        discountPercent: number;
    };
}

/**
 * Qarzni to'lash rejasi. D — qarz, X — qo'shimcha chegirma, P — olingan pul.
 *  - P + X ≥ D: qarz yozuvining o'zi "Paid" bo'ladi (to'lov kunida kassaga tushadi), chegirma qo'shiladi.
 *  - aks holda: P alohida "(Qarzdorlik yopildi)" yozuvi bo'ladi, qarz D − P − X ga kamayadi.
 *    Qarz yozilganda berilgan chegirma yopilgan ulushga qarab bo'linadi (texnik xarajati to'g'ri
 *    bo'linsin), qo'shimcha chegirma esa yangi yozuvga tushadi.
 * Qarzdan ko'p pul olinmaydi. Pulsiz (faqat chegirma bilan) qisman yopish — null.
 */
export function planDebtPayment(
    debt: { amount?: number | string | null; discountAmount?: number | string | null; service?: string | null },
    input: DebtPaymentInput
): DebtPaymentPlan | null {
    const D = Math.round(num(debt.amount));
    const d0 = Math.round(num(debt.discountAmount));
    if (D <= 0) return null;
    const X = Math.min(D, Math.max(0, Math.round(num(input.extraDiscount))));
    const P = Math.min(D - X, Math.max(0, Math.round(num(input.paid))));

    if (P + X >= D) {
        const totalDiscount = d0 + X;
        return {
            full: true,
            paid: P,
            remaining: 0,
            update: {
                status: 'Paid',
                amount: P,
                type: input.method,
                date: input.today,
                ...(X > 0 ? {
                    discountAmount: totalDiscount,
                    discountPercent: P + totalDiscount > 0 ? Math.round(totalDiscount / (P + totalDiscount) * 100) : 0,
                } : {}),
            },
        };
    }

    if (P <= 0) return null;
    const share = Math.round(d0 * (P + X) / D);
    return {
        full: false,
        paid: P,
        remaining: D - P - X,
        create: {
            status: 'Paid',
            amount: P,
            type: input.method,
            date: input.today,
            service: `${debt.service ?? ''}${DEBT_REPAID_SUFFIX}`,
            discountAmount: share + X,
            discountPercent: X > 0 ? Math.max(1, Math.round(X / D * 100)) : 0,
        },
        update: { amount: D - P - X, discountAmount: d0 - share },
    };
}
