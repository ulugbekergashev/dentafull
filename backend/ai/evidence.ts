// ─── Dalil kartochkalari ──────────────────────────────────────────────────────
//
// Model javob MATNINI yozadi. Lekin ro'yxat va raqamni matndan o'qish qiyin:
// "Aliyev S. — 1 200 000, Karimova D. — 850 000, ..." degan paragrafdan kerakli
// bemorni topib, uning kartasini ochish uchun baribir qidiruvga qaytish kerak.
//
// Shu sababli javob ostida kartochkalar chiqadi: qarzdorlar, qabullar, bo'sh
// vaqtlar, bemor kartasi. Ular MODELDAN EMAS — serverdan, model chaqirgan
// tool'lar asosida to'g'ridan-to'g'ri keladi. Uchta natija:
//
//   1. Kartochkadagi raqam to'qima bo'la olmaydi — u bazadan olingan.
//   2. Ismlar TO'LIQ va id bilan: bosilsa, bemor kartasi ochiladi. Modelga
//      esa ular avvalgidek maskalangan holda boradi — kartochka modelni
//      chetlab o'tadi (tanlash kartasidagi bilan bir xil qoida, ai/actions.ts).
//   3. Model ro'yxatni matnda takrorlamaydi — javob qisqa va arzonroq.
//
// Faqat HAQIQATAN chaqirilgan va xatosiz qaytgan tool'lar uchun quriladi, rol
// va shifokor doirasi tool'lardagi bilan aynan bir xil.

const { prisma } = require('../db');
import {
    ToolContext, findDebtors, searchPatients, loadPatientCard, resolveCardPatient,
    computeFreeSlots, PatientCardData, isoDay,
} from './tools';

type Lang = 'uz' | 'ru';
export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface PatientRow {
    id: string | null;
    name: string;
    detail?: string;
    amount?: number;
}

export type Evidence =
    | { kind: 'patient'; card: PatientCardData & { name: string } }
    | { kind: 'patients'; title: string; total: number; sum?: number; items: PatientRow[] }
    | {
        kind: 'appointments';
        title: string;
        total: number;
        items: {
            id: string; patientId: string; patientName: string; doctorName: string;
            date: string; time: string; status: string; type: string;
        }[];
    }
    | {
        kind: 'slots';
        title: string;
        date: string;
        duration: number;
        doctors: { id: string; name: string; start: string; end: string; free: string[] }[];
    }
    | { kind: 'metrics'; title: string; items: { label: string; value: number | string; unit?: string; tone?: Tone }[] }
    | { kind: 'stock'; title: string; total: number; items: { name: string; qty: number; min: number; unit: string }[] }
    | { kind: 'table'; title: string; columns: string[]; rows: (string | number)[][] };

export interface ToolCallRecord {
    name: string;
    args: any;
    result: any;
}

/** Bitta javob ostida ko'pi bilan shuncha kartochka — ko'prog'i shovqin. */
const MAX_CARDS = 3;

const TXT = {
    debtors: { uz: 'Qarzdorlar', ru: 'Должники' },
    found: { uz: 'Topilgan bemorlar', ru: 'Найденные пациенты' },
    choose: { uz: 'Qaysi bemor?', ru: 'Какой пациент?' },
    appts: { uz: 'Qabullar', ru: 'Приёмы' },
    slots: { uz: 'Bo\'sh vaqtlar', ru: 'Свободное время' },
    revenue: { uz: 'Moliya', ru: 'Финансы' },
    stock: { uz: 'Tugayotgan materiallar', ru: 'Заканчиваются' },
    doctors: { uz: 'Shifokorlar', ru: 'Врачи' },
    leads: { uz: 'Lidlar', ru: 'Лиды' },
    lastVisit: { uz: 'oxirgi tashrif', ru: 'последний визит' },
    inCash: { uz: 'Kassaga kirgan', ru: 'Поступило' },
    expense: { uz: 'Xarajat', ru: 'Расходы' },
    net: { uz: 'Sof', ru: 'Чистыми' },
    payments: { uz: 'To\'lovlar', ru: 'Платежей' },
    leadsAll: { uz: 'Jami lid', ru: 'Всего лидов' },
    leadsBooked: { uz: 'Bemorga aylandi', ru: 'Стали пациентами' },
    leadsStale: { uz: 'Javobsiz (7+ kun)', ru: 'Без ответа (7+ дн.)' },
    som: { uz: 'so\'m', ru: 'сум' },
    pcs: { uz: 'ta', ru: 'шт' },
    docCols: {
        uz: ['Shifokor', 'Qabul', 'Bajarilgan', 'Kelmagan', 'Tushum'],
        ru: ['Врач', 'Приёмы', 'Завершено', 'Неявки', 'Выручка'],
    },
} as const;

const fullName = (p: { firstName?: string | null; lastName?: string | null }): string =>
    `${p.lastName || ''} ${p.firstName || ''}`.trim() || '—';

const fmt = (n: number): string => Math.round(n).toLocaleString('ru-RU');

/** "oxirgi tashrif: 12.09.2026" — sana bo'lmasa ("Never") qator chiqmaydi. */
const visited = (v: unknown, lang: Lang): string | undefined => {
    const day = isoDay(v);
    return day ? `${TXT.lastVisit[lang]}: ${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : undefined;
};

/**
 * Qabullar kartochkasida birinchi navbatda ish talab qiladiganlari: klinikadagi,
 * hali keladigan va kelmaganlar. Faqat vaqt bo'yicha saralansa, gavjum kunda
 * ertalabki yakunlangan qabullar butun kartochkani egallab olardi.
 */
const APPT_PRIORITY: Record<string, number> = {
    'Checked-In': 0, Pending: 1, Confirmed: 1, 'No-Show': 2, Completed: 3, Cancelled: 4,
};

// ─── Har bir tool uchun quruvchi ─────────────────────────────────────────────

type Builder = (args: any, result: any, ctx: ToolContext, lang: Lang) => Promise<Evidence | null>;

const BUILDERS: Record<string, Builder> = {

    get_patient_card: async (args, _result, ctx, lang) => {
        const who = await resolveCardPatient(args?.query, ctx);
        if (who.candidates?.length) {
            return {
                kind: 'patients',
                title: TXT.choose[lang],
                total: who.candidates.length,
                items: who.candidates.map((p: any) => ({
                    id: p.id,
                    name: fullName(p),
                    detail: visited(p.lastVisit, lang),
                })),
            };
        }
        if (!who.id) return null;
        const card = await loadPatientCard(who.id, ctx);
        return card ? { kind: 'patient', card: { ...card, name: fullName(card) } } : null;
    },

    find_free_slots: async (args, _result, ctx, lang) => {
        const r = await computeFreeSlots(args, ctx);
        if ('xato' in r) return null;
        // Bo'sh vaqti bor shifokorlar oldinda — kartochkaning maqsadi shu.
        const doctors = [...r.doctors]
            .sort((a, b) => b.free.length - a.free.length)
            .slice(0, 6)
            .map(d => ({ id: d.id, name: d.name, start: d.start, end: d.end, free: d.free.slice(0, 16) }));
        return { kind: 'slots', title: TXT.slots[lang], date: r.date, duration: r.duration, doctors };
    },

    get_appointments: async (args, result, ctx, lang) => {
        const where: any = {
            clinicId: ctx.clinicId,
            date: { gte: String(args?.dateFrom || ''), lte: String(args?.dateTo || args?.dateFrom || '') },
        };
        if (args?.status) where.status = String(args.status);
        // Doira get_appointments dagi bilan AYNAN bir xil.
        if (ctx.role === 'DOCTOR' && ctx.doctorId) where.doctorId = ctx.doctorId;
        else if (args?.doctorName) where.doctorName = { contains: String(args.doctorName), mode: 'insensitive' };

        const found = await prisma.appointment.findMany({
            where,
            orderBy: [{ date: 'asc' }, { time: 'asc' }],
            take: 300,
            select: {
                id: true, patientId: true, patientName: true, doctorName: true,
                date: true, time: true, status: true, type: true,
            },
        });
        if (!found.length) return null;
        const rank = (s: string) => APPT_PRIORITY[s] ?? 3;
        // Array.sort barqaror: bir xil ustuvorlikda sana/vaqt tartibi saqlanadi.
        const rows = [...found].sort((a: any, b: any) => rank(a.status) - rank(b.status)).slice(0, 12);
        return {
            kind: 'appointments',
            title: TXT.appts[lang],
            total: typeof result?.jami === 'number' ? result.jami : found.length,
            items: rows.map((r: any) => ({
                id: r.id, patientId: r.patientId, patientName: r.patientName, doctorName: r.doctorName,
                date: r.date, time: r.time, status: r.status, type: r.type,
            })),
        };
    },

    get_debtors: async (_args, _result, ctx, lang) => {
        const list = await findDebtors(ctx);
        if (!list.length) return null;
        return {
            kind: 'patients',
            title: TXT.debtors[lang],
            total: list.length,
            sum: Math.round(list.reduce((s, d) => s + d.summa, 0)),
            items: list.slice(0, 8).map(d => ({
                id: d.patientId,
                name: d.patient ? fullName(d.patient) : d.ism,
                detail: visited(d.patient?.lastVisit, lang),
                amount: Math.round(d.summa),
            })),
        };
    },

    find_patient: async (args, _result, ctx, lang) => {
        const rows = await searchPatients(String(args?.query || ''), ctx, 6);
        if (!rows.length) return null;
        return {
            kind: 'patients',
            title: TXT.found[lang],
            total: rows.length,
            items: rows.map((r: any) => ({
                id: r.id,
                name: fullName(r),
                detail: visited(r.lastVisit, lang),
            })),
        };
    },

    // Quyidagilarda shaxsiy ma'lumot yo'q — tool natijasining o'zi ishlatiladi.

    get_revenue: async (_args, r, _ctx, lang) => {
        if (typeof r?.kassaga_kirgan !== 'number') return null;
        return {
            kind: 'metrics',
            title: TXT.revenue[lang],
            items: [
                { label: TXT.inCash[lang], value: fmt(r.kassaga_kirgan), unit: TXT.som[lang], tone: r.kassaga_kirgan > 0 ? 'good' : 'neutral' },
                { label: TXT.expense[lang], value: fmt(r.xarajat || 0), unit: TXT.som[lang], tone: r.xarajat > 0 ? 'bad' : 'neutral' },
                { label: TXT.net[lang], value: fmt(r.sof || 0), unit: TXT.som[lang], tone: (r.sof || 0) >= 0 ? 'good' : 'bad' },
                { label: TXT.payments[lang], value: r.tolovlar_soni || 0, unit: TXT.pcs[lang] },
            ],
        };
    },

    get_low_stock: async (_args, r, _ctx, lang) => {
        if (!r?.tugayotgan) return null;
        return {
            kind: 'stock',
            title: TXT.stock[lang],
            total: r.tugayotgan,
            items: (r.materiallar || []).slice(0, 8).map((m: any) => ({
                name: m.nom, qty: m.qoldiq, min: m.minimum, unit: m.olchov,
            })),
        };
    },

    get_doctor_stats: async (_args, r, _ctx, lang) => {
        const list = Array.isArray(r?.shifokorlar) ? r.shifokorlar : [];
        if (!list.length) return null;
        return {
            kind: 'table',
            title: TXT.doctors[lang],
            columns: [...TXT.docCols[lang]],
            rows: [...list]
                .sort((a: any, b: any) => (b.tushum || 0) - (a.tushum || 0))
                .slice(0, 10)
                .map((d: any) => [d.shifokor, d.qabullar, d.bajarilgan, d.kelmagan, fmt(d.tushum || 0)]),
        };
    },

    get_leads: async (_args, r, _ctx, lang) => {
        if (typeof r?.jami !== 'number' || r.jami === 0) return null;
        return {
            kind: 'metrics',
            title: TXT.leads[lang],
            items: [
                { label: TXT.leadsAll[lang], value: r.jami, unit: TXT.pcs[lang] },
                { label: TXT.leadsBooked[lang], value: r.status_kesimida?.Booked || 0, unit: TXT.pcs[lang], tone: r.status_kesimida?.Booked ? 'good' : 'neutral' },
                { label: TXT.leadsStale[lang], value: r.javobsiz_eski_lidlar || 0, unit: TXT.pcs[lang], tone: r.javobsiz_eski_lidlar ? 'warn' : 'neutral' },
            ],
        };
    },
};

/** Kartochkalar tartibi: eng aniq (bitta bemor) oldinda, umumiy raqamlar oxirida. */
const ORDER = [
    'get_patient_card', 'find_free_slots', 'get_appointments', 'get_debtors',
    'find_patient', 'get_revenue', 'get_low_stock', 'get_doctor_stats', 'get_leads',
];

/**
 * Model chaqirgan tool'lar asosida kartochkalarni quradi.
 *
 * Hech qachon xato tashlamaydi: kartochka — qo'shimcha qulaylik, javobning
 * o'zi usiz ham to'liq. Bittasi yiqilsa, qolganlari baribir qaytadi.
 */
export const buildEvidence = async (
    calls: ToolCallRecord[],
    ctx: ToolContext,
    lang: Lang
): Promise<Evidence[]> => {
    // Har bir tool'dan OXIRGI chaqiruv olinadi: model argumentni aniqlashtirib
    // qayta chaqirgan bo'lsa, javob o'sha oxirgisiga tayanadi.
    const last = new Map<string, ToolCallRecord>();
    for (const c of calls) {
        if (!c?.name || !BUILDERS[c.name]) continue;
        if (!c.result || c.result.xato || c.result.tasdiq_kutilmoqda) continue;
        last.set(c.name, c);
    }

    const picked = ORDER.filter(n => last.has(n)).slice(0, MAX_CARDS);
    const built = await Promise.all(picked.map(async name => {
        const c = last.get(name)!;
        try {
            return await BUILDERS[name](c.args || {}, c.result, ctx, lang);
        } catch (e: any) {
            console.warn(`[AI:evidence] ${name}:`, e?.message);
            return null;
        }
    }));
    return built.filter(Boolean) as Evidence[];
};
