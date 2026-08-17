/**
 * Segment uchun jamlanma ma'lumotlar (to'lovlar summasi, tashriflar soni ...).
 *
 * Bular bemor jadvalidagi oddiy ustun emas — boshqa jadvallardan hisoblanadi.
 * Shuning uchun ular alohida: FAQAT shartlarda ishlatilgan jamlanmalar
 * hisoblanadi. Agar foydalanuvchi "to'lovlar summasi" filtrini qo'ymagan bo'lsa,
 * tranzaksiyalar jadvaliga umuman murojaat qilinmaydi.
 *
 * MUHIM: BAZA SXEMASINI O'ZGARTIRMAYDI — faqat mavjud jadvallarni o'qiydi.
 */

import { prisma } from './db';

export type AggregateKey =
    | 'totalSpent'
    | 'visitCount'
    | 'noShowCount'
    | 'activeInstallment'
    | 'upcomingAppointment'
    | 'lastApptType';

export interface Aggregates {
    /** Bemor bo'yicha to'langan summa (status: Paid) */
    totalSpent?: Map<string, number>;
    /** Tashriflar soni */
    visitCount?: Map<string, number>;
    /** Kelmagan qabullar soni */
    noShowCount?: Map<string, number>;
    /** Faol bo'lib to'lash rejasi bor bemorlar */
    activeInstallment?: Set<string>;
    /** Kelgusida qabuli bor bemorlar */
    upcomingAppointment?: Set<string>;
    /** Oxirgi qabul turi */
    lastApptType?: Map<string, string>;
}

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Kerakli jamlanmalarni hisoblaydi. Kerak bo'lmaganiga so'rov ketmaydi.
 */
export async function buildAggregates(clinicId: string, needed: Set<AggregateKey>): Promise<Aggregates> {
    const agg: Aggregates = {};
    const jobs: Promise<void>[] = [];

    if (needed.has('totalSpent')) {
        jobs.push((async () => {
            const rows = await prisma.transaction.groupBy({
                by: ['patientId'],
                where: { clinicId, status: 'Paid', patientId: { not: null } },
                _sum: { amount: true },
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) {
                if (r.patientId) m.set(r.patientId, r._sum.amount || 0);
            }
            agg.totalSpent = m;
        })());
    }

    if (needed.has('visitCount')) {
        jobs.push((async () => {
            const rows = await prisma.visit.groupBy({
                by: ['patientId'],
                where: { clinicId },
                _count: true,
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) m.set(r.patientId, r._count || 0);
            agg.visitCount = m;
        })());
    }

    if (needed.has('noShowCount')) {
        jobs.push((async () => {
            const rows = await prisma.appointment.groupBy({
                by: ['patientId'],
                where: { clinicId, status: 'No-Show' },
                _count: true,
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) m.set(r.patientId, r._count || 0);
            agg.noShowCount = m;
        })());
    }

    if (needed.has('activeInstallment')) {
        jobs.push((async () => {
            const rows = await prisma.installmentPlan.findMany({
                where: { clinicId, status: 'Active' },
                select: { patientId: true },
            });
            agg.activeInstallment = new Set((rows as any[]).map(r => r.patientId));
        })());
    }

    if (needed.has('upcomingAppointment')) {
        jobs.push((async () => {
            const rows = await prisma.appointment.findMany({
                where: { clinicId, date: { gte: todayStr() }, status: { in: ['Confirmed', 'Pending'] } },
                select: { patientId: true },
            });
            agg.upcomingAppointment = new Set((rows as any[]).map(r => r.patientId));
        })());
    }

    if (needed.has('lastApptType')) {
        jobs.push((async () => {
            // Eng oxirgi qabul turi: sana bo'yicha kamayish tartibida birinchi uchragani
            const rows = await prisma.appointment.findMany({
                where: { clinicId },
                select: { patientId: true, type: true, date: true },
                orderBy: [{ date: 'desc' }, { time: 'desc' }],
            });
            const m = new Map<string, string>();
            for (const r of rows as any[]) {
                if (!m.has(r.patientId)) m.set(r.patientId, r.type || '');
            }
            agg.lastApptType = m;
        })());
    }

    await Promise.all(jobs);
    return agg;
}

/** Qabul turlari ro'yxati — filtr variantlari uchun */
export async function listAppointmentTypes(clinicId: string): Promise<string[]> {
    try {
        const rows = await prisma.appointment.findMany({
            where: { clinicId },
            select: { type: true },
            distinct: ['type'],
        });
        return (rows as any[]).map(r => r.type).filter(Boolean).sort();
    } catch {
        return [];
    }
}
