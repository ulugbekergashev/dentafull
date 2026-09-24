import { PaymentMethod, Transaction } from '../types';

/**
 * Bitta to'lovni bir necha usulga bo'lish (masalan yarmi naqd, yarmi karta).
 *
 * Kassada har bir usul alohida yozuv bo'ladi — shunda kassa hisobi, terminal
 * solishtiruvi va hisobotlar hech qanday o'zgarishsiz ishlayveradi: ular
 * allaqachon yozuvlarni usul bo'yicha yig'adi.
 */
export interface PaymentPart {
    method: PaymentMethod;
    amount: number;
}

/** To'lov oynasidagi qo'shimcha usullar soni chegarasi (asosiy usul bilan jami 3 ta) */
export const MAX_EXTRA_PARTS = 2;

export interface PaymentPlan {
    /** Xizmat matni ("nom" yoki "nom|narx||...||TOTAL|jami") */
    service: string;
    /** Asosiy usul — to'lanayotgan summadan qo'shimchalar ayirilgani shunga tushadi */
    primaryMethod: PaymentMethod;
    /** Hozir to'lanayotgan summa (qarzsiz) */
    paidAmount: number;
    extras: PaymentPart[];
    debtAmount: number;
    /** Jami chegirma summasi — yozuvlarga summasiga qarab bo'linadi */
    discountAmount: number;
}

export type PaymentRecord = Pick<Transaction, 'amount' | 'type' | 'service' | 'status' | 'discountAmount'> & { isDebt?: boolean };

/** Asosiy usulga qolgan summa (to'lanayotgan − qo'shimcha usullar) */
export const primaryShare = (paidAmount: number, extras: PaymentPart[]): number =>
    paidAmount - extras.reduce((s, p) => s + (p.amount || 0), 0);

/** Bemor avansidan jami qancha yechiladi — asosiy va qo'shimcha usullardagi "Hisobdan" qismlar */
export const balanceUsed = (primaryMethod: PaymentMethod, paidAmount: number, extras: PaymentPart[]): number =>
    (primaryMethod === 'Balance' ? Math.max(0, primaryShare(paidAmount, extras)) : 0)
    + extras.filter(p => p.method === 'Balance').reduce((s, p) => s + (p.amount || 0), 0);

/**
 * Qo'shimcha usullardagi xato — oynada ko'rsatish va saqlashni to'xtatish uchun.
 * Asosiy usulga ham pul qolishi shart, aks holda u bo'sh yozuv bo'lib qoladi.
 */
export function splitError(paidAmount: number, extras: PaymentPart[], balance = 0): 'amount' | 'exceeds' | 'balance' | null {
    if (extras.length === 0) return null;
    if (extras.some(p => !(p.amount > 0))) return 'amount';
    if (primaryShare(paidAmount, extras) <= 0) return 'exceeds';
    if (extras.filter(p => p.method === 'Balance').reduce((s, p) => s + p.amount, 0) > balance) return 'balance';
    return null;
}

/**
 * To'lov oynasidagi qiymatlardan kassaga yoziladigan yozuvlar.
 *
 * - Qarzsiz: har bir usulga bitta 'Paid' yozuv, xizmat nomi o'zgarmaydi.
 * - Qisman: to'langan qismlar "(Qisman to'lov)", qolgani bitta "(Qarz)" yozuv.
 * - Umuman to'lanmagan: bitta qarz yozuvi, xizmat nomi o'zgarmaydi.
 *
 * Chegirma yozuvlarga summasi ulushida bo'linadi — jami bitta to'lovdagidek
 * qoladi, hisobotda ikki marta sanalmaydi.
 */
export function buildPaymentRecords(plan: PaymentPlan): PaymentRecord[] {
    const parts: PaymentPart[] = [
        { method: plan.primaryMethod, amount: primaryShare(plan.paidAmount, plan.extras) },
        ...plan.extras,
    ].filter(p => p.amount > 0);
    const hasDebt = plan.debtAmount > 0;

    const records: PaymentRecord[] = parts.map(p => ({
        amount: p.amount,
        type: p.method,
        service: hasDebt ? `${plan.service} (Qisman to'lov)` : plan.service,
        status: 'Paid' as const,
    }));
    if (hasDebt) {
        records.push({
            amount: plan.debtAmount,
            type: parts[0]?.method ?? plan.primaryMethod,
            service: parts.length ? `${plan.service} (Qarz)` : plan.service,
            status: 'Pending',
            // Ataylab qarzga yozildi — ro'yxatlarda "qarz" deb ko'rsatiladi
            isDebt: true,
        });
    }
    // 0 so'm kiritilgan — avvalgidek bitta 0 so'mlik yozuv (qabul to'langan hisoblanadi)
    if (records.length === 0) {
        records.push({ amount: 0, type: plan.primaryMethod, service: plan.service, status: 'Paid' });
    }

    const total = records.reduce((s, r) => s + r.amount, 0);
    const discount = Math.round(plan.discountAmount || 0);
    let left = discount;
    records.forEach((r, i) => {
        const share = i === records.length - 1 ? left : (total > 0 ? Math.round(discount * r.amount / total) : 0);
        r.discountAmount = share;
        left -= share;
    });
    return records;
}
