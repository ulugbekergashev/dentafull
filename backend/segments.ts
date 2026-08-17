/**
 * Auditoriya segmenti — "kimga yuborish" savoliga YAGONA javob.
 *
 * Nega kerak: ilgari qo'lda yuborishda bemorlarni frontend o'zi filtrlardi,
 * backend esa {qarz} ni boshqacha hisoblardi (frontend faqat Pending
 * tranzaksiyalarni, backend esa Pending + faol bo'lib to'lash qoldig'ini).
 * Ya'ni "qarzdorlar" ro'yxati va xabardagi qarz summasi ikki xil haqiqat edi.
 * Endi segmentni faqat shu fayl hal qiladi — UI ham, avtomatika ham shu yerga
 * murojaat qiladi.
 *
 * MUHIM: bu fayl BAZA SXEMASINI O'ZGARTIRMAYDI — faqat mavjud jadvallardan
 * o'qiydi (Patient, Transaction, InstallmentPlan).
 */

import { prisma } from './db';

export interface AudienceSegment {
    /** Bitta shifokorning bemorlari ('' yoki null — hammasi) */
    doctorId?: string | null;
    /** 'Active' — faqat faol bemorlar (sukut), 'All' — hammasi */
    status?: 'Active' | 'All';
    /** Shuncha oydan beri kelmaganlar (null — filtr yo'q) */
    inactiveMonths?: number | null;
    /** Hech qachon kelmaganlar ham kirsinmi (sukut: yo'q) */
    includeNeverVisited?: boolean;
    /** Faqat qarzi borlar */
    debtors?: boolean;
    /** Bugun tug'ilgan kuni bo'lganlar */
    birthdayToday?: boolean;
    /** Shu oyda tug'ilgan kuni bo'lganlar */
    birthdayMonth?: boolean;
}

export const EMPTY_SEGMENT: AudienceSegment = { status: 'Active' };

/** Bemor tug'ilgan kunini MM-DD ga keltirish (YYYY-MM-DD yoki DD.MM.YYYY) */
function dobToMonthDay(dob: string): string {
    if (!dob) return '';
    if (dob.includes('-')) {
        const parts = dob.split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
    } else if (dob.includes('.')) {
        const parts = dob.split('.');
        if (parts.length >= 2) return `${parts[1]}-${parts[0]}`;
    }
    return '';
}

/**
 * Klinikaning qarz xaritasi: Pending tranzaksiyalar + faol bo'lib to'lash
 * qoldiqlari. {qarz} o'zgaruvchisi ham, "qarzdorlar" filtri ham SHU hisobdan
 * foydalanadi — ikkisi hech qachon ajralib ketmasligi uchun.
 */
export async function buildDebtMap(clinicId: string, patientIds?: string[]): Promise<Map<string, number>> {
    const scope = patientIds && patientIds.length > 0 ? { patientId: { in: patientIds } } : {};

    const [pendingTx, activePlans] = await Promise.all([
        prisma.transaction.findMany({
            where: { clinicId, status: 'Pending', ...scope },
            select: { patientId: true, amount: true },
        }),
        prisma.installmentPlan.findMany({
            where: { clinicId, status: 'Active', ...scope },
            select: { patientId: true, totalAmount: true, totalPaid: true },
        }),
    ]);

    const debtMap = new Map<string, number>();
    for (const t of pendingTx as any[]) {
        if (!t.patientId) continue;
        debtMap.set(t.patientId, (debtMap.get(t.patientId) || 0) + t.amount);
    }
    for (const p of activePlans as any[]) {
        const remaining = Math.max(0, p.totalAmount - p.totalPaid);
        if (remaining <= 0) continue;
        debtMap.set(p.patientId, (debtMap.get(p.patientId) || 0) + remaining);
    }
    return debtMap;
}

export interface ResolvedAudience {
    patients: any[];
    /** Har bemorning qarzi — {qarz} uchun */
    debtMap: Map<string, number>;
}

/**
 * Segmentni haqiqiy bemorlar ro'yxatiga aylantiradi.
 * Filtrlar VA mantiqi bilan birlashtiriladi.
 */
export async function resolveSegment(clinicId: string, segment?: AudienceSegment | null): Promise<ResolvedAudience> {
    const seg: AudienceSegment = { ...EMPTY_SEGMENT, ...(segment || {}) };

    // Bazadan tortib olinadigan qism
    const patients = await prisma.patient.findMany({
        where: {
            clinicId,
            ...(seg.status !== 'All' ? { status: 'Active' } : {}),
            ...(seg.doctorId ? { doctorId: seg.doctorId } : {}),
        },
    });

    const debtMap = await buildDebtMap(clinicId);

    const now = new Date();
    const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

    let cutoff: Date | null = null;
    if (seg.inactiveMonths) {
        cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - seg.inactiveMonths);
    }

    const filtered = (patients as any[]).filter(p => {
        if (cutoff) {
            const visit = p.lastVisit ? new Date(p.lastVisit) : null;
            const hasVisit = !!visit && !isNaN(visit.getTime());
            if (!hasVisit) {
                // Sanasi yo'q yoki o'qib bo'lmaydi — ataylab qaror
                if (!seg.includeNeverVisited) return false;
            } else if (visit! > cutoff) {
                return false;
            }
        }

        if (seg.debtors && !((debtMap.get(p.id) || 0) > 0)) return false;
        if (seg.birthdayToday && dobToMonthDay(p.dob) !== todayMonthDay) return false;
        if (seg.birthdayMonth && !dobToMonthDay(p.dob).startsWith(`${thisMonth}-`)) return false;

        return true;
    });

    return { patients: filtered, debtMap };
}

/** Segment tavsifini odam o'qiy oladigan matnga aylantiradi (UI va loglar uchun) */
export function describeSegment(seg?: AudienceSegment | null, doctorName?: string): string {
    if (!seg) return 'Barcha faol bemorlar';
    const parts: string[] = [];
    parts.push(seg.status === 'All' ? 'Barcha bemorlar' : 'Faol bemorlar');
    if (seg.doctorId) parts.push(doctorName ? `shifokor: ${doctorName}` : 'bitta shifokor');
    if (seg.inactiveMonths) {
        parts.push(`${seg.inactiveMonths} oydan beri kelmagan${seg.includeNeverVisited ? ' (umuman kelmaganlar ham)' : ''}`);
    }
    if (seg.debtors) parts.push('qarzi bor');
    if (seg.birthdayToday) parts.push("bugun tug'ilgan kun");
    if (seg.birthdayMonth) parts.push("shu oyda tug'ilgan kun");
    return parts.join(' · ');
}
