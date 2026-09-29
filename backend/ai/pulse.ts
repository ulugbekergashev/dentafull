// ─── Kun pulsi ────────────────────────────────────────────────────────────────
//
// Panel ochilganda foydalanuvchi bo'sh maydon va "savol bering" degan yozuvni
// ko'rardi. Ya'ni AI dan foyda olish uchun avval to'g'ri savolni o'ylab topish
// kerak edi — ko'pchilik esa nima so'rashni bilmaydi.
//
// Puls buni teskari qiladi: panel ochilishi bilan klinikaning HOZIRGI holati
// ko'rinadi — bugungi qabullar, tushum odatdagiga nisbatan, qarz, javobsiz
// lidlar, tugayotgan material. Har bir plitka bosiladi va tegishli savol yoki
// hisobotga olib boradi.
//
// Model UMUMAN chaqirilmaydi: hammasi bitta so'rovdagi DB hisobi. Ya'ni puls
// tekin, bir zumda chiqadi va AI kaliti sozlanmagan klinikada ham ishlaydi.
// Rol cheklovlari tool'lardagi bilan aynan bir xil (ai/tools.ts).

const { prisma } = require('../db');
import { ToolContext, findDebtors, clinicClock } from './tools';
import { detectAnomalies } from './proactive';

type Lang = 'uz' | 'ru';
type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export type PulseAction =
    | { type: 'ask'; text: string }
    | { type: 'report'; report: string }
    | { type: 'open'; href: string };

export interface PulseTile {
    key: 'appts' | 'revenue' | 'debt' | 'leads' | 'stock' | 'tomorrow';
    label: string;
    value: string;
    unit?: string;
    sub?: string;
    tone: Tone;
    /** Odatdagiga nisbatan farq, foizda (faqat tushum uchun). */
    delta?: number;
    /** Oxirgi 7 kun (bugun oxirida) — kichik grafik uchun. */
    spark?: number[];
    action: PulseAction;
}

export interface Pulse {
    date: string;
    tiles: PulseTile[];
    /** Keyingi bemor — bugun, hali kelmagan. */
    next: { time: string; patientId: string; patientName: string; doctorName: string; type: string } | null;
    /** Hozir klinikada (kelgan, qabul tugamagan). */
    inClinic: number;
    alerts: { text: string; tone: Tone }[];
}

const FINANCE = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const FRONT_DESK = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'];

// 'Balance' — avansdan yechish, kassaga yangi pul kirmaydi (ai/tools.ts bilan bir xil).
const MONEY_IN = new Set(['Cash', 'CashCollection', 'Card', 'UzcardTerminal', 'HumoTerminal', 'Click', 'P2P', 'QrBank', 'QrUzcard', 'QrHumo', 'Transfer', 'Insurance']);

const fmt = (n: number): string => Math.round(n).toLocaleString('ru-RU');

const shiftDate = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

const T = {
    appts: { uz: 'Bugungi qabullar', ru: 'Приёмы сегодня' },
    revenue: { uz: 'Bugungi tushum', ru: 'Выручка сегодня' },
    debt: { uz: 'Qarzdorlar', ru: 'Должники' },
    leads: { uz: 'Javobsiz lidlar', ru: 'Лиды без ответа' },
    stock: { uz: 'Tugayotgan material', ru: 'Заканчивается' },
    tomorrow: { uz: 'Ertangi qabullar', ru: 'Приёмы завтра' },
    som: { uz: 'so\'m', ru: 'сум' },
    done: { uz: 'yakunlandi', ru: 'завершено' },
    here: { uz: 'klinikada', ru: 'в клинике' },
    waiting: { uz: 'kutilmoqda', ru: 'ожидается' },
    noshow: { uz: 'kelmadi', ru: 'не пришли' },
    avg: { uz: 'odatda', ru: 'обычно' },
    patients: { uz: 'nafar bemor', ru: 'пациентов' },
    fresh: { uz: 'yangi (7 kun)', ru: 'новых за 7 дней' },
    allGood: { uz: 'hammasi yetarli', ru: 'всё в норме' },
    unconfirmed: { uz: 'tasdiqlanmagan', ru: 'не подтверждены' },
    empty: { uz: 'jadval bo\'sh', ru: 'расписание пустое' },
    askAppts: {
        uz: 'Bugungi qabullar holati qanday? Kim keldi, kim kutilmoqda, kim kelmadi?',
        ru: 'Как идут приёмы сегодня? Кто пришёл, кого ждём, кто не пришёл?',
    },
    askRevenue: {
        uz: 'Bugungi tushum qancha va u odatdagidan qanchalik farq qiladi?',
        ru: 'Какая выручка сегодня и насколько она отличается от обычной?',
    },
    askStock: { uz: 'Nima tugayapti?', ru: 'Что заканчивается?' },
    askTomorrow: {
        uz: 'Ertangi qabullar ro\'yxatini ko\'rsat — kim tasdiqlanmagan?',
        ru: 'Покажи приёмы на завтра — кто не подтвердил?',
    },
} as const;

/** Anomaliya matni — proactive.ts faqat o'zbekcha yozadi, bu yerda ikki tilda. */
const anomalyText = (a: { metric: string; today: number; average: number; direction: string }, lang: Lang): string => {
    const pct = a.average ? Math.abs(Math.round(((a.today - a.average) / a.average) * 100)) : 0;
    const money = a.metric === 'tushum';
    const v = (n: number) => (money ? `${fmt(n)} ${T.som[lang]}` : `${n}`);
    const label = {
        tushum: { uz: 'Bugungi tushum', ru: 'Выручка сегодня' },
        qabul: { uz: 'Bugungi qabullar', ru: 'Приёмов сегодня' },
        kelmagan: { uz: 'Kelmagan bemorlar', ru: 'Неявок' },
    }[a.metric as 'tushum' | 'qabul' | 'kelmagan'] || { uz: a.metric, ru: a.metric };
    if (lang === 'ru') {
        return `${label.ru}: ${v(a.today)} — на ${pct}% ${a.direction === 'past' ? 'ниже' : 'выше'} обычного (${v(a.average)}).`;
    }
    return `${label.uz}: ${v(a.today)} — odatdagidan ${pct}% ${a.direction === 'past' ? 'past' : 'yuqori'} (${v(a.average)}).`;
};

// ─── Kesh ────────────────────────────────────────────────────────────────────
// Panel har ochilganda so'raladi. Bir daqiqalik kesh bir nechta xodim bir vaqtda
// ochganda bazaga qayta bormaslik uchun — raqamlar esa bir daqiqada eskirmaydi.

const TTL_MS = 60_000;
const cache = new Map<string, { value: Pulse; expiresAt: number }>();

export const invalidatePulse = (clinicId: string): void => {
    for (const k of Array.from(cache.keys())) if (k.startsWith(`${clinicId}|`)) cache.delete(k);
};

export const buildPulse = async (ctx: ToolContext, lang: Lang): Promise<Pulse> => {
    const key = `${ctx.clinicId}|${ctx.role}|${ctx.doctorId || ''}|${lang}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const value = await computePulse(ctx, lang);
    if (cache.size > 500) cache.clear();
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
};

const computePulse = async (ctx: ToolContext, lang: Lang): Promise<Pulse> => {
    const { date: today, time: now } = clinicClock();
    const weekAgo = shiftDate(today, -6);
    const tomorrow = shiftDate(today, 1);
    const finance = FINANCE.includes(ctx.role);
    const frontDesk = FRONT_DESK.includes(ctx.role);

    const apptWhere: any = { clinicId: ctx.clinicId, date: { gte: weekAgo, lte: tomorrow } };
    if (ctx.role === 'DOCTOR' && ctx.doctorId) apptWhere.doctorId = ctx.doctorId;

    const leadWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [appts, txs, debtors, stock, staleLeads, freshLeads, anomalies] = await Promise.all([
        prisma.appointment.findMany({
            where: apptWhere,
            select: { date: true, time: true, status: true, patientId: true, patientName: true, doctorName: true, type: true },
        }),
        finance
            ? prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, status: 'Paid', date: { gte: shiftDate(today, -30), lte: today } },
                select: { date: true, amount: true, type: true },
            })
            : Promise.resolve([]),
        frontDesk ? findDebtors(ctx).catch(() => []) : Promise.resolve([]),
        prisma.inventoryItem.findMany({
            where: { clinicId: ctx.clinicId },
            select: { name: true, quantity: true, minQuantity: true },
        }),
        frontDesk
            ? prisma.lead.count({ where: { clinicId: ctx.clinicId, status: 'New', createdAt: { lt: leadWeek } } })
            : Promise.resolve(0),
        frontDesk
            ? prisma.lead.count({ where: { clinicId: ctx.clinicId, createdAt: { gte: leadWeek } } })
            : Promise.resolve(0),
        finance ? detectAnomalies(ctx.clinicId, today).catch(() => []) : Promise.resolve([]),
    ]);

    const tiles: PulseTile[] = [];
    const live = appts.filter((a: any) => a.status !== 'Cancelled');

    // ── Bugungi qabullar
    const todays = live.filter((a: any) => a.date === today);
    const count = (s: string) => todays.filter((a: any) => a.status === s).length;
    const done = count('Completed');
    const here = count('Checked-In');
    const noShow = count('No-Show');
    const waiting = todays.length - done - here - noShow;
    const days7 = Array.from({ length: 7 }, (_, i) => shiftDate(weekAgo, i));
    tiles.push({
        key: 'appts',
        label: T.appts[lang],
        value: String(todays.length),
        sub: todays.length
            ? [
                done && `${done} ${T.done[lang]}`,
                here && `${here} ${T.here[lang]}`,
                waiting > 0 && `${waiting} ${T.waiting[lang]}`,
                noShow && `${noShow} ${T.noshow[lang]}`,
            ].filter(Boolean).join(' · ')
            : T.empty[lang],
        tone: noShow > 0 ? 'warn' : 'neutral',
        spark: days7.map(d => live.filter((a: any) => a.date === d).length),
        action: { type: 'ask', text: T.askAppts[lang] },
    });

    // ── Bugungi tushum (faqat moliya ko'radiganlar)
    if (finance) {
        const byDate = new Map<string, number>();
        for (const t of txs as any[]) {
            if (t.type && !MONEY_IN.has(t.type)) continue;
            byDate.set(t.date, (byDate.get(t.date) || 0) + (t.amount || 0));
        }
        const todayRev = byDate.get(today) || 0;
        // O'rtacha — faqat pul tushgan kunlar bo'yicha: dam olish kunlari
        // o'rtachani sun'iy pasaytirib, har qanday oddiy kunni "yuqori" qilardi.
        const past = Array.from(byDate.entries()).filter(([d, v]) => d < today && v > 0).map(([, v]) => v);
        const avg = past.length ? past.reduce((s, v) => s + v, 0) / past.length : 0;
        const delta = avg > 0 && todayRev > 0 ? Math.round(((todayRev - avg) / avg) * 100) : undefined;
        tiles.push({
            key: 'revenue',
            label: T.revenue[lang],
            value: fmt(todayRev),
            unit: T.som[lang],
            sub: avg > 0 ? `${T.avg[lang]} ${fmt(avg)}` : undefined,
            tone: todayRev > 0 ? 'good' : 'neutral',
            delta,
            spark: days7.map(d => Math.round(byDate.get(d) || 0)),
            action: { type: 'ask', text: T.askRevenue[lang] },
        });
    }

    // ── Qarzdorlar
    if (frontDesk) {
        const list = debtors as any[];
        const total = list.reduce((s, d) => s + (d.summa || 0), 0);
        tiles.push({
            key: 'debt',
            label: T.debt[lang],
            value: fmt(total),
            unit: T.som[lang],
            sub: `${list.length} ${T.patients[lang]}`,
            tone: total > 0 ? 'warn' : 'good',
            action: { type: 'report', report: 'debtors' },
        });
    }

    // ── Javobsiz lidlar
    if (frontDesk && (staleLeads > 0 || freshLeads > 0)) {
        tiles.push({
            key: 'leads',
            label: T.leads[lang],
            value: String(staleLeads),
            sub: `${freshLeads} ${T.fresh[lang]}`,
            tone: staleLeads > 0 ? 'warn' : 'good',
            action: { type: 'report', report: 'leads' },
        });
    }

    // ── Ertangi qabullar
    const tomorrows = live.filter((a: any) => a.date === tomorrow);
    const unconfirmed = tomorrows.filter((a: any) => a.status === 'Pending').length;
    tiles.push({
        key: 'tomorrow',
        label: T.tomorrow[lang],
        value: String(tomorrows.length),
        sub: unconfirmed ? `${unconfirmed} ${T.unconfirmed[lang]}` : undefined,
        tone: unconfirmed > 0 ? 'warn' : 'neutral',
        action: { type: 'ask', text: T.askTomorrow[lang] },
    });

    // ── Ombor (material qo'shilmagan klinikada plitka ko'rsatilmaydi)
    if ((stock as any[]).length) {
        const low = (stock as any[]).filter(i => i.minQuantity > 0 && i.quantity <= i.minQuantity);
        tiles.push({
            key: 'stock',
            label: T.stock[lang],
            value: String(low.length),
            sub: low.length ? low.slice(0, 2).map(i => i.name).join(', ') : T.allGood[lang],
            tone: low.length ? 'warn' : 'good',
            action: { type: 'ask', text: T.askStock[lang] },
        });
    }

    // ── Keyingi bemor
    const upcoming = todays
        .filter((a: any) => (a.status === 'Pending' || a.status === 'Confirmed') && a.time >= now)
        .sort((a: any, b: any) => a.time.localeCompare(b.time))[0];

    return {
        date: today,
        tiles,
        next: upcoming
            ? {
                time: upcoming.time,
                patientId: upcoming.patientId,
                patientName: upcoming.patientName,
                doctorName: upcoming.doctorName,
                type: upcoming.type,
            }
            : null,
        inClinic: here,
        alerts: (anomalies as any[])
            .filter(a => a.bad)
            .map(a => ({ text: anomalyText(a, lang), tone: 'bad' as Tone })),
    };
};
