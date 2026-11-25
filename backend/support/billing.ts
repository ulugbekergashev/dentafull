// ─── Obuna to'lovi ───────────────────────────────────────────────────────────
// Ilgari: mijoz pul o'tkazadi → Telegramda chek yuboradi → rahbar super admin
// panelini ochib muddatni qo'lda suradi. To'lov tarixi hech qayerda qolmasdi.
//
// Endi: mijoz chekni botga yuboradi → operatorga karta keladi (+1 oy / +3 oy /
// +1 yil) → bir tugma bilan muddat uzayadi va to'lov SubscriptionPayment'ga
// yoziladi. Operator uxlayotgan bo'lsa ham klinika to'xtab qolmasligi uchun
// chek yuborilganda muddati tugagan klinika bir marta qisqa muddatga ochiladi
// ("ishonch muddati", Sozlamalarda kunlar soni; 0 — o'chirilgan).

import { todayTashkent } from './text';

/** Ishonch muddati shuncha kunda bir marta beriladi */
export const TRUST_COOLDOWN_DAYS = 30;
export const ALLOWED_MONTHS = [1, 3, 6, 12];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sanaga oy qo'shadi. Oy oxiri to'g'ri ishlaydi: 31-yanvar + 1 oy = 28/29-fevral
 * (JavaScript'ning setMonth'i buni 3-martga o'tkazib yuborardi).
 */
export const addMonths = (iso: string, months: number): string => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
};

export const addDays = (iso: string, days: number): string =>
    new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);

const laterOf = (a: string, b: string) => (a > b ? a : b);

export interface BillingDeps {
    db: any;
    /** Bazaga yozishni "yordam boti" nomidan jurnalga tushiradi (audit.ts runWithActor) */
    withActor: <T>(actor: { name: string; role: string; clinicId: string | null }, fn: () => Promise<T>) => Promise<T>;
}

export interface ExtendInfo {
    receiptFileId?: string | null;
    /** Kim tasdiqladi: operator ismi yoki "Payme" */
    approvedBy: string;
    /** To'langan aniq summa (so'm). Berilmasa tarif narxi × oy */
    amount?: number | null;
    note?: string | null;
    /** Jurnalda ko'rinadigan nom. Berilmasa "Yordam boti (tasdiqladi: ...)" */
    actorName?: string;
    /** Tashqi to'lov id'si (masalan "payme:<id>"): shu id bilan muddat faqat BIR marta uzayadi */
    externalId?: string | null;
}

export interface ExtendResult {
    toExpiry: string;
    amount: number | null;
    clinicName: string;
    /** externalId bo'yicha bu to'lov ilgari yozilgan — muddat qayta uzaytirilmadi */
    alreadyApplied?: boolean;
}

/** Muddat o'qilgandan keyin boshqa yozuv uni o'zgartirdi — qaytadan hisoblash kerak */
class ConcurrentChange extends Error { }
const MAX_EXTEND_RETRIES = 3;

const CLINIC_SELECT = { id: true, name: true, status: true, expiryDate: true, planId: true, customPrice: true, subscriptionType: true };

/** extend() ning bitta urinishi — `t` tranzaksiya ichidagi mijoz (yoki tranzaksiyasiz db) */
async function applyExtend(t: any, clinicId: string, months: number, info: ExtendInfo, externalId: string | null): Promise<ExtendResult> {
    const c = await t.clinic.findUnique({ where: { id: clinicId }, select: CLINIC_SELECT });
    if (!c) throw new Error('Klinika topilmadi');
    if (c.status === 'Deleted') throw new Error("Klinika o'chirilgan");

    // Takroriy chaqiruv (masalan, Payme qayta so'radi) muddatni ikkinchi marta uzaytirmaydi
    if (externalId) {
        const done = await t.subscriptionPayment.findFirst({ where: { externalId } });
        if (done) return { toExpiry: done.toExpiry, amount: done.amount ?? null, clinicName: c.name, alreadyApplied: true };
    }

    const today = todayTashkent();
    const last = await t.subscriptionPayment.findFirst({ where: { clinicId }, orderBy: { createdAt: 'desc' } });
    // Ishonch muddati to'langan davrga qo'shilmasligi uchun uning OLDINGI muddati olinadi — lekin
    // faqat muddat shundan beri o'zgarmagan bo'lsa (super admin qo'lda uzaytirgan bo'lsa u hisobga olinadi)
    const trustApplies = last?.kind === 'trust' && last.fromExpiry && c.expiryDate === last.toExpiry;
    const paidUntil = trustApplies ? last.fromExpiry : (c.expiryDate || today);
    const toExpiry = addMonths(laterOf(today, paidUntil), months);

    // Payme kabi aniq summa ma'lum bo'lsa — o'sha yoziladi, aks holda tarif narxidan hisoblanadi
    let amount: number | null = info.amount ?? null;
    if (amount === null) {
        const plan = await t.subscriptionPlan.findUnique({ where: { id: c.planId } }).catch(() => null);
        const monthly = c.customPrice ?? plan?.price ?? null;
        amount = monthly === null ? null : Math.round(Number(monthly) * months);
    }

    // Holat (status) O'ZGARTIRILMAYDI: qo'lda bloklangan klinika to'lov bilan o'zi ochilib qolmasin
    // (grantTrust ham ataylab shularni chetlab o'tadi).
    // update (updateMany emas) — jurnal (audit.ts) faqat update'ni yozadi. Qo'shimcha shart
    // (expiryDate) mos kelmasa Prisma P2025 tashlaydi: muddat shu orada o'zgargan.
    try {
        await t.clinic.update({
            where: { id: clinicId, expiryDate: c.expiryDate },
            data: { expiryDate: toExpiry, subscriptionType: 'Paid' },
        });
    } catch (e: any) {
        if (e?.code === 'P2025') throw new ConcurrentChange();
        throw e;
    }
    await t.subscriptionPayment.create({
        data: {
            clinicId, kind: 'payment', months, days: 0, amount,
            fromExpiry: c.expiryDate || null, toExpiry,
            receiptFileId: info.receiptFileId || null, approvedBy: info.approvedBy,
            note: info.note || null, externalId,
        },
    });
    return { toExpiry, amount, clinicName: c.name };
}

export const createBilling = ({ db, withActor }: BillingDeps) => {
    const clinicRow = (clinicId: string) => db.clinic.findUnique({ where: { id: clinicId }, select: CLINIC_SELECT });

    return {
        /**
         * Chek yuborilganda: muddati tugagan klinikani vaqtincha ochadi.
         * Faqat SANA bo'yicha tugagan klinikaga — qo'lda bloklangan (status ≠ Active)
         * klinika bu yo'l bilan ochilmaydi. TRUST_COOLDOWN_DAYS ichida bir marta.
         */
        async grantTrust(clinicId: string, trustDays: number, receiptFileId: string | null): Promise<{ granted: false } | { granted: true; toExpiry: string }> {
            if (trustDays <= 0) return { granted: false };
            const c = await clinicRow(clinicId);
            const today = todayTashkent();
            if (!c || c.status !== 'Active' || !c.expiryDate || c.expiryDate >= today) return { granted: false };

            const recent = await db.subscriptionPayment.findFirst({
                where: { clinicId, kind: 'trust', createdAt: { gte: new Date(Date.now() - TRUST_COOLDOWN_DAYS * DAY_MS) } },
            });
            if (recent) return { granted: false };

            const toExpiry = addDays(today, trustDays);
            await withActor({ name: 'Yordam boti (chek yuborildi)', role: 'SUPPORT_BOT', clinicId }, async () => {
                await db.clinic.update({ where: { id: clinicId }, data: { expiryDate: toExpiry } });
            });
            await db.subscriptionPayment.create({
                data: { clinicId, kind: 'trust', months: 0, days: trustDays, fromExpiry: c.expiryDate, toExpiry, receiptFileId, note: 'Chek tekshirilguncha' },
            });
            return { granted: true, toExpiry };
        },

        /**
         * Tasdiqlangan to'lov: muddatni uzaytiradi va to'lovni yozadi.
         *
         * Yangi muddat bugundan yoki joriy muddat oxiridan — qaysi biri kechroq
         * bo'lsa. Ishonch muddati berilgan bo'lsa u hisobga OLINMAYDI: aks holda
         * har to'lovda mijoz bir necha kunni tekinga olardi.
         */
        async extend(clinicId: string, months: number, info: ExtendInfo): Promise<ExtendResult> {
            if (!ALLOWED_MONTHS.includes(months)) throw new Error("Muddat noto'g'ri");
            const actorName = info.actorName || `Yordam boti (tasdiqladi: ${info.approvedBy})`;
            const externalId = info.externalId || null;

            // Hammasi bitta tranzaksiyada: o'qish → hisoblash → SHARTLI yozish. Muddat o'qilgandan
            // beri o'zgargan bo'lsa (shu klinikaga parallel to'lov) yozuv bekor va qaytadan hisoblanadi —
            // aks holda ikki to'lovdan biri ikkinchisini bosib ketib, bir oy yo'qolardi.
            const attempt = (t: any): Promise<ExtendResult> => applyExtend(t, clinicId, months, info, externalId);
            const runOnce = () => withActor<Promise<ExtendResult>>({ name: actorName, role: 'SUPPORT_BOT', clinicId }, () =>
                typeof db.$transaction === 'function' ? db.$transaction((t: any) => attempt(t)) : attempt(db));

            for (let i = 0; ; i++) {
                try {
                    return await runOnce();
                } catch (e: any) {
                    if (e instanceof ConcurrentChange && i < MAX_EXTEND_RETRIES) continue;
                    // Bir xil to'lov parallel yozildi (externalId noyob) — o'sha yozuv natijasi qaytariladi
                    if (externalId && e?.code === 'P2002') {
                        const done = await db.subscriptionPayment.findFirst({ where: { externalId } });
                        const c = await clinicRow(clinicId);
                        if (done) return { toExpiry: done.toExpiry, amount: done.amount ?? null, clinicName: c?.name || '', alreadyApplied: true };
                    }
                    throw e instanceof ConcurrentChange ? new Error("Muddatni yangilab bo'lmadi, qayta urinib ko'ring") : e;
                }
            }
        },

        async payments(clinicId?: string, take = 100): Promise<any[]> {
            return db.subscriptionPayment.findMany({
                where: clinicId ? { clinicId } : undefined,
                orderBy: { createdAt: 'desc' },
                take,
            });
        },
    };
};

export type Billing = ReturnType<typeof createBilling>;
