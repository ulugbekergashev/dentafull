// ─── AI tool qatlami (2-bosqich) ──────────────────────────────────────────────
// AI klinika ma'lumotini SHU FAYL orqali va faqat O'QISH uchun ko'radi.
//
// Uchta qat'iy qoida:
//
//  1. clinicId HECH QACHON tool parametri emas. U chaqiruv kontekstidan
//     (tokendan) keladi. Aks holda model boshqa klinikaning id'sini o'ylab
//     topib, tenant chegarasidan chiqib ketishi mumkin.
//
//  2. Text-to-SQL yo'q. Har bir savol turi uchun alohida, tipizatsiyalangan
//     funksiya. Model faqat argument beradi, so'rovni biz yozamiz.
//
//  3. Rol filtri tool RO'YXATIDA amalga oshadi — mavjud bo'lmagan tool
//     modelga umuman ko'rsatilmaydi va bajarilishda ham qayta tekshiriladi.

const { prisma } = require('../db');
import { sanitizeToolResult } from './guard';
import { searchVariants } from './translit';
import { fuzzyFind } from './fuzzy';

export interface ToolContext {
    clinicId: string;
    role: string;
    /** DOCTOR roli uchun — o'z bemorlari bilan cheklash. */
    doctorId?: string;
}

// ─── Maxfiylik ───────────────────────────────────────────────────────────────
// Bepul AI tier'lari so'rovlarni model o'qitishiga ishlatishi mumkin, shuning
// uchun to'liq shaxsiy ma'lumot yuborilmaydi. Foydalanuvchi kimligini tanishi
// uchun familiya + ism bosh harfi yetarli. PINFL va manzil umuman yuborilmaydi.

const maskName = (first?: string | null, last?: string | null): string => {
    const f = (first || '').trim();
    const l = (last || '').trim();
    if (!f && !l) return 'Noma\'lum';
    return l ? `${l} ${f.charAt(0).toUpperCase()}.`.trim() : f;
};

const maskPhone = (phone?: string | null): string => {
    const p = (phone || '').replace(/\D/g, '');
    return p.length >= 4 ? `***${p.slice(-4)}` : '***';
};

// ─── To'lov mantiqidan nusxa ─────────────────────────────────────────────────
// Manba: utils/paymentMethods.ts (frontend). U yerdagi ro'yxat o'zgarsa,
// bu yerni ham yangilang. Backend frontend'dagi util'ni import qila olmaydi
// (tsconfig chegarasi), shuning uchun ataylab takrorlangan.
// 'Balance' — avansdan yechish: pul ilgari tushgan, kassaga yangi pul kirmaydi.
const MONEY_IN_METHODS = new Set(['Cash', 'Card', 'Click', 'Transfer', 'Insurance']);
const isMoneyIn = (method?: string | null): boolean =>
    !method ? true : MONEY_IN_METHODS.has(method);

const fmt = (n: number): number => Math.round(n);

/**
 * Xatolarga chidamli qidiruvda nechta bemor xotiraga olinadi.
 *
 * Faqat id, ism va familiya olinadi — bitta yozuv ~60 bayt, ya'ni 5000
 * bemor ham 300 KB atrofida. Bu bosqich aniq qidiruv natija bermaganda
 * ishlaydi, ya'ni kam uchraydi.
 */
const FUZZY_POOL_LIMIT = 5000;

// ─── Tool ta'riflari (OpenAI-compatible) ─────────────────────────────────────

export interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
    /** Shu tool'ni ko'ra oladigan rollar. */
    roles: string[];
}

const ALL = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];
const FINANCE = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const FRONT_DESK = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'];

export const TOOL_DEFS: ToolDef[] = [
    {
        name: 'get_appointments',
        description:
            'Qabullar ro\'yxati va soni. Sana yoki sana oralig\'i bo\'yicha, ' +
            'ixtiyoriy ravishda shifokor va status bo\'yicha filtrlanadi. ' +
            '"Bugun nechta qabul bor?" kabi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD. Bir kun uchun dateFrom bilan bir xil.' },
                doctorName: { type: 'string', description: 'Shifokor familiyasi yoki ismi (qisman moslik)' },
                status: {
                    type: 'string',
                    enum: ['Confirmed', 'Pending', 'Completed', 'Cancelled', 'No-Show', 'Checked-In'],
                },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: ALL,
    },
    {
        name: 'get_revenue',
        description:
            'Berilgan davr uchun moliyaviy xulosa: kassaga kirgan pul, umumiy ' +
            'aylanma, to\'lov usullari bo\'yicha taqsimot va xarajatlar. ' +
            '"Shu oy daromad qancha?" kabi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD' },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: FINANCE,
    },
    {
        name: 'get_debtors',
        description:
            'Qarzdor bemorlar (balansi manfiy) — eng katta qarzdan boshlab. ' +
            '"Kim qarzdor?" savoli uchun.',
        parameters: {
            type: 'object',
            properties: {
                limit: { type: 'integer', description: 'Nechta bemor qaytarilsin (standart 10, maksimum 50)' },
            },
            required: [],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'get_doctor_stats',
        description:
            'Shifokorlar kesimida ko\'rsatkichlar: qabullar soni, bajarilgan ' +
            'qabullar, kelmaganlar (no-show) va tushum. Shifokorlarni ' +
            'solishtirish uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD' },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: FINANCE,
    },
    {
        name: 'find_patient',
        description:
            'Bemorni ism yoki telefon bo\'yicha qidiradi va qisqacha ' +
            'ma\'lumotini qaytaradi: oxirgi tashrif, balans, biriktirilgan shifokor.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Ism, familiya yoki telefon raqamining bir qismi' },
            },
            required: ['query'],
        },
        roles: ALL,
    },
    {
        name: 'get_low_stock',
        description:
            'Zaxirasi minimal darajadan tushgan materiallar ro\'yxati. ' +
            '"Nima tugayapti?" savoli uchun.',
        parameters: { type: 'object', properties: {}, required: [] },
        roles: ALL,
    },
    {
        name: 'get_leads',
        description:
            'Lidlar (potensial bemorlar) bo\'yicha xulosa. Qaytaradi: jami soni, ' +
            'STATUS kesimida taqsimot (New, Contacted, Thinking, Booked — ya\'ni ' +
            'nechtasi bemorga aylandi, Cancelled), MANBA kesimida taqsimot ' +
            '(Instagram, Telegram, tavsiya va h.k. — qaysi kanal ko\'p lid keltiryapti) ' +
            'va 7 kundan beri javobsiz qolgan eski lidlar soni. ' +
            'Lid manbasi, konversiya va marketing samaradorligi haqidagi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                days: { type: 'integer', description: 'Oxirgi necha kun (standart 30)' },
            },
            required: [],
        },
        roles: FRONT_DESK,
    },
];

/** Rolga ko'ra ko'rinadigan tool ta'riflari (OpenAI `tools` formatida). */
export const toolsForRole = (role: string) =>
    TOOL_DEFS
        .filter(t => t.roles.includes(role))
        .map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
        }));

// ─── Implementatsiyalar ──────────────────────────────────────────────────────
// Har birida `where` ichida clinicId ctx dan keladi — args dan EMAS.

const clampLimit = (n: any, def: number, max: number): number => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(Math.floor(v), max);
};

/**
 * Bemorni ism yoki telefon bo'yicha qidiradi.
 *
 * NEGA ALOHIDA FUNKSIYA: ilgari qidiruv `firstName contains q OR lastName
 * contains q` edi va bu KO'P SO'ZLI so'rovda hech qachon ishlamasdi. Ism va
 * familiya alohida ustunlarda — "asror kamolov" satri ikkalasining ham
 * ichida yo'q. Foydalanuvchi esa odatda to'liq ism aytadi, ayniqsa ovoz
 * bilan. Natijada AI "bemor topilmadi" derdi, bemor esa bazada turardi.
 *
 * Endi so'rov so'zlarga bo'linadi va HAR BIR so'z ism yoki familiyada
 * bo'lishi talab qilinadi. Hech narsa topilmasa — yumshoqroq qidiruv:
 * kamida bitta so'z mos kelsa yetarli. Ikkinchi bosqich ayni ovoz uchun
 * muhim: u ba'zan bitta so'zni buzadi ("Asror" -> "Asrar"), ikkinchisi
 * esa to'g'ri qoladi.
 */
export const searchPatients = async (
    query: string,
    ctx: ToolContext,
    take = 10
): Promise<any[]> => {
    const q = String(query || '').trim();
    if (q.length < 2) return [];

    const scope: any = { clinicId: ctx.clinicId };
    if (ctx.role === 'DOCTOR' && ctx.doctorId) scope.doctorId = ctx.doctorId;

    const select = {
        id: true, firstName: true, lastName: true, phone: true, balance: true,
        lastVisit: true, status: true,
        // Patient jadvalida `doctorName` USTUNI YO'Q — faqat `doctorId` va
        // bog'lanish bor. Ilgari bu yerda `doctorName: true` turardi va
        // Prisma har bir chaqiruvda xato tashlardi. Xatoni runTool ushlab,
        // "Ma'lumotni olishda xatolik" deb qaytarardi, AI esa uni
        // "ma'lumot yo'q" deb talqin qilardi — ya'ni bemor qidiruvi
        // BOSHIDAN ishlamagan, lekin buzilgani hech qayerda ko'rinmagan.
        doctor: { select: { firstName: true, lastName: true } },
    };

    // Telefon bo'yicha — kamida 4 raqam bo'lsa.
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 4) {
        const byPhone = await prisma.patient.findMany({
            where: { ...scope, phone: { contains: digits } }, take, select,
        });
        if (byPhone.length) return byPhone;
    }

    // Har bir so'z ikkala alifboda ham qidiriladi. Foydalanuvchi
    // "асроров" deb yozsa-yu, bazada "Asrorov" bo'lsa, `contains` hech
    // qachon mos kelmasdi va javob "bemor topilmadi" bo'lardi — bemor
    // esa ro'yxatda turardi. Ovoz kiritish bu holatni tez-tez qiladi:
    // rus tanish rejimi har doim kirill qaytaradi.
    const byName = (t: string) => ({
        OR: searchVariants(t).flatMap(v => [
            { firstName: { contains: v, mode: 'insensitive' } },
            { lastName: { contains: v, mode: 'insensitive' } },
        ]),
    });

    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    if (!tokens.length) return [];

    // 1-bosqich: barcha so'zlar mos kelsin.
    const strict = await prisma.patient.findMany({
        where: { ...scope, AND: tokens.map(byName) }, take, select,
    });
    if (strict.length) return strict;

    // 2-bosqich: kamida bittasi mos kelsa ham bo'ladi.
    if (tokens.length > 1) {
        const loose = await prisma.patient.findMany({
            where: { ...scope, OR: tokens.map(byName) }, take, select,
        });
        if (loose.length) return loose;
    }

    // 3-bosqich: XATOLARGA CHIDAMLI qidiruv.
    //
    // Yuqoridagi ikkala bosqich ham ANIQ moslikni talab qiladi: bitta
    // harf tushib qolsa yoki almashsa, natija bo'sh bo'ladi. Shifokor va
    // administrator esa kuniga o'nlab ism yozadi, ovoz tanish ham yaqin
    // eshitilgan harfni beradi ("Asrorov" -> "Osvorov"). Har bir harfni
    // to'g'ri yozishni talab qilish — yordamchining ishini foydalanuvchiga
    // yuklash demakdir.
    //
    // Bu bosqich faqat shu yerda, oxirida turadi: aniq moslik topilganda
    // u umuman ishga tushmaydi va odatiy qidiruvga sekinlik qo'shmaydi.
    const pool = await prisma.patient.findMany({
        where: scope,
        select: { id: true, firstName: true, lastName: true },
        take: FUZZY_POOL_LIMIT,
    });

    const hits = fuzzyFind(q, pool, take);
    if (!hits.length) return [];

    // Faqat mos kelganlarning to'liq yozuvi olinadi — ro'yxatning o'zi
    // yengil maydonlar bilan yuklangan edi.
    const found = await prisma.patient.findMany({
        where: { ...scope, id: { in: hits.map(h => h.item.id) } },
        select,
    });

    // Tartib yaqinlik bo'yicha saqlanadi: eng yaqini birinchi bo'lsin.
    const order = new Map(hits.map((h, i) => [h.item.id, i]));
    return found.sort((a: any, b: any) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
};

const IMPL: Record<string, (args: any, ctx: ToolContext) => Promise<any>> = {

    get_appointments: async (args, ctx) => {
        const where: any = {
            clinicId: ctx.clinicId,
            date: { gte: String(args.dateFrom), lte: String(args.dateTo) },
        };
        if (args.status) where.status = String(args.status);
        // DOCTOR faqat o'z qabullarini ko'radi.
        if (ctx.role === 'DOCTOR' && ctx.doctorId) where.doctorId = ctx.doctorId;
        else if (args.doctorName) where.doctorName = { contains: String(args.doctorName), mode: 'insensitive' };

        const rows = await prisma.appointment.findMany({
            where,
            orderBy: [{ date: 'asc' }, { time: 'asc' }],
            take: 100,
            select: { date: true, time: true, doctorName: true, type: true, status: true, patientName: true },
        });

        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

        return {
            jami: rows.length,
            status_kesimida: byStatus,
            qabullar: rows.slice(0, 40).map((r: any) => ({
                sana: r.date,
                vaqt: r.time,
                shifokor: r.doctorName,
                bemor: maskName(r.patientName?.split(' ')[0], r.patientName?.split(' ').slice(1).join(' ')),
                turi: r.type,
                status: r.status,
            })),
            izoh: rows.length > 40 ? 'Faqat birinchi 40 tasi ko\'rsatildi.' : undefined,
        };
    },

    get_revenue: async (args, ctx) => {
        const range = { gte: String(args.dateFrom), lte: String(args.dateTo) };

        const [txs, expenses] = await Promise.all([
            prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, date: range, status: 'Paid' },
                select: { amount: true, type: true, service: true },
            }),
            prisma.expense.findMany({
                where: { clinicId: ctx.clinicId, date: range },
                select: { amount: true, category: true },
            }),
        ]);

        let kassaga_kirgan = 0;   // haqiqiy pul oqimi
        let umumiy_aylanma = 0;   // ko'rsatilgan xizmatlar hajmi
        const usul_kesimida: Record<string, number> = {};

        for (const t of txs) {
            umumiy_aylanma += t.amount;
            if (isMoneyIn(t.type)) kassaga_kirgan += t.amount;
            usul_kesimida[t.type || 'Noma\'lum'] = fmt((usul_kesimida[t.type || 'Noma\'lum'] || 0) + t.amount);
        }

        let xarajat = 0;
        const xarajat_kesimida: Record<string, number> = {};
        for (const e of expenses) {
            xarajat += e.amount;
            xarajat_kesimida[e.category] = fmt((xarajat_kesimida[e.category] || 0) + e.amount);
        }

        return {
            davr: `${args.dateFrom} — ${args.dateTo}`,
            kassaga_kirgan: fmt(kassaga_kirgan),
            umumiy_aylanma: fmt(umumiy_aylanma),
            xarajat: fmt(xarajat),
            sof: fmt(kassaga_kirgan - xarajat),
            tolovlar_soni: txs.length,
            usul_kesimida,
            xarajat_kesimida,
            izoh:
                'kassaga_kirgan — haqiqatda tushgan pul. umumiy_aylanma bunga qo\'shimcha ' +
                'ravishda avansdan yechilgan (Balance) to\'lovlarni ham o\'z ichiga oladi, ' +
                'ular kassaga yangi pul keltirmaydi. Summalar so\'mda.',
        };
    },

    // Qarzdorlar ILOVANING O'Z mantiqi bo'yicha hisoblanadi (pages/Finance.tsx):
    // qarz = to'lanmagan ("Pending") to'lovlar + bo'lib-bo'lib to'lashning
    // qolgan qismi.
    //
    // Ilgari bu yerda `Patient.balance < 0` ishlatilardi va bu XATO edi:
    // `balance` — bu avans (oldindan to'lov) qoldig'i, qarz daftari emas.
    // U faqat 'Avans' kiritmalar va 'Balance' turidagi to'lovlardan
    // hosil bo'ladi (server.ts, recalculate-balances), ya'ni oddiy
    // to'lanmagan xizmat unga umuman ta'sir qilmaydi. Natijada AI Moliya
    // sahifasidagidan BOSHQA ro'yxat ko'rsatardi — va ikkalasi ham
    // ishonchli ohangda.
    get_debtors: async (args, ctx) => {
        const limit = clampLimit(args.limit, 10, 50);

        const [pending, plans] = await Promise.all([
            prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, status: 'Pending' },
                select: { patientId: true, patientName: true, amount: true, date: true },
                take: 2000,
            }),
            prisma.installmentPlan.findMany({
                where: { clinicId: ctx.clinicId, status: 'Active' },
                select: { patientId: true, totalAmount: true, totalPaid: true },
                take: 2000,
            }),
        ]);

        // Bemorlar FAQAT qarzi borlari bo'yicha olinadi.
        //
        // Ilgari bu yerda klinikaning BARCHA bemorlari yuklanardi — bir necha
        // ming yozuv, har bir "kim qarzdor?" savolida. Qarzdorlar esa odatda
        // o'nlab. Bu tool AI so'rovining kritik yo'lida turgani uchun bunday
        // so'rov butun javobni sekinlashtirardi.
        const ids = Array.from(new Set([
            ...pending.map((t: any) => t.patientId).filter(Boolean),
            ...plans.map((p: any) => p.patientId).filter(Boolean),
        ])) as string[];

        const patients = ids.length
            ? await prisma.patient.findMany({
                where: { id: { in: ids }, clinicId: ctx.clinicId },
                select: { id: true, firstName: true, lastName: true, phone: true, lastVisit: true },
            })
            : [];

        const byId = new Map<string, any>(patients.map((p: any) => [p.id, p]));

        // Guruhlash kaliti — patientId. Eski yozuvlarda u bo'lmasligi mumkin,
        // shunda ismga qaytamiz (Finance.tsx ham shunday qiladi).
        const debts = new Map<string, { ism: string; summa: number; sana: string; p?: any }>();

        const add = (key: string, ism: string, summa: number, sana: string, p?: any) => {
            const cur = debts.get(key);
            if (cur) {
                cur.summa += summa;
                if (sana && sana < cur.sana) cur.sana = sana;
            } else {
                debts.set(key, { ism, summa, sana, p });
            }
        };

        for (const t of pending) {
            const p = t.patientId ? byId.get(t.patientId) : undefined;
            add(t.patientId || `nom:${t.patientName}`,
                p ? maskName(p.firstName, p.lastName) : maskName(t.patientName, ''),
                t.amount || 0, t.date || '', p);
        }

        for (const pl of plans) {
            const qoldiq = (pl.totalAmount || 0) - (pl.totalPaid || 0);
            if (qoldiq <= 0) continue;
            const p = byId.get(pl.patientId);
            add(pl.patientId, p ? maskName(p.firstName, p.lastName) : 'Noma\'lum', qoldiq, '', p);
        }

        const list = Array.from(debts.values())
            .filter(d => d.summa > 0)
            .sort((a, b) => b.summa - a.summa);

        const jami = list.reduce((s, d) => s + d.summa, 0);

        return {
            topildi: list.length,
            jami_qarz: fmt(jami),
            bemorlar: list.slice(0, limit).map(d => ({
                bemor: d.ism,
                telefon: maskPhone(d.p?.phone),
                qarz: fmt(d.summa),
                eng_eski_qarz_sanasi: d.sana || undefined,
                oxirgi_tashrif: d.p?.lastVisit,
            })),
            izoh: list.length > limit
                ? `Summalar so'mda. Jami ${list.length} ta qarzdordan eng kattalari ko'rsatildi.`
                : 'Summalar so\'mda. Qarz = to\'lanmagan to\'lovlar va bo\'lib-bo\'lib to\'lashning qolgan qismi.',
        };
    },

    get_doctor_stats: async (args, ctx) => {
        const range = { gte: String(args.dateFrom), lte: String(args.dateTo) };
        const [doctors, appts, txs] = await Promise.all([
            prisma.doctor.findMany({
                where: { clinicId: ctx.clinicId },
                select: { id: true, firstName: true, lastName: true, specialty: true },
            }),
            prisma.appointment.findMany({
                where: { clinicId: ctx.clinicId, date: range },
                select: { doctorId: true, status: true },
            }),
            prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, date: range, status: 'Paid' },
                select: { doctorId: true, amount: true, type: true },
            }),
        ]);

        return {
            davr: `${args.dateFrom} — ${args.dateTo}`,
            shifokorlar: doctors.map((d: any) => {
                const mine = appts.filter((a: any) => a.doctorId === d.id);
                const tushum = txs
                    .filter((t: any) => t.doctorId === d.id && isMoneyIn(t.type))
                    .reduce((s: number, t: any) => s + t.amount, 0);
                return {
                    shifokor: maskName(d.firstName, d.lastName),
                    yonalish: d.specialty,
                    qabullar: mine.length,
                    bajarilgan: mine.filter((a: any) => a.status === 'Completed').length,
                    kelmagan: mine.filter((a: any) => a.status === 'No-Show').length,
                    bekor: mine.filter((a: any) => a.status === 'Cancelled').length,
                    tushum: fmt(tushum),
                };
            }),
            izoh: 'tushum — shifokorga biriktirilgan to\'lovlar, so\'mda. Eski yozuvlarda shifokor ko\'rsatilmagan bo\'lishi mumkin.',
        };
    },

    find_patient: async (args, ctx) => {
        const q = String(args.query || '').trim();
        if (q.length < 2) return { xato: 'Qidiruv so\'rovi juda qisqa (kamida 2 belgi).' };

        const rows = await searchPatients(q, ctx, 10);

        return {
            topildi: rows.length,
            bemorlar: rows.map((r: any) => ({
                bemor: maskName(r.firstName, r.lastName),
                telefon: maskPhone(r.phone),
                balans: fmt(r.balance || 0),
                oxirgi_tashrif: r.lastVisit,
                shifokor: r.doctor ? `${r.doctor.lastName} ${r.doctor.firstName}`.trim() : '-',
                holat: r.status,
            })),
            izoh: rows.length === 0
                ? 'Bemor topilmadi. Ism boshqacha yozilgan bo\'lishi mumkin.'
                : 'Manfiy balans — qarz. Ismlar maxfiylik uchun qisqartirilgan.',
        };
    },

    get_low_stock: async (_args, ctx) => {
        const rows = await prisma.inventoryItem.findMany({
            where: { clinicId: ctx.clinicId },
            select: { name: true, quantity: true, minQuantity: true, unit: true },
        });
        const low = rows.filter((r: any) => r.minQuantity > 0 && r.quantity <= r.minQuantity);
        return {
            jami_pozitsiya: rows.length,
            tugayotgan: low.length,
            materiallar: low
                .sort((a: any, b: any) => (a.quantity / (a.minQuantity || 1)) - (b.quantity / (b.minQuantity || 1)))
                .slice(0, 30)
                .map((r: any) => ({
                    nom: r.name,
                    qoldiq: r.quantity,
                    minimum: r.minQuantity,
                    olchov: r.unit,
                })),
            izoh: low.length === 0 ? 'Hamma material yetarli.' : undefined,
        };
    },

    get_leads: async (args, ctx) => {
        const days = clampLimit(args.days, 30, 365);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const rows = await prisma.lead.findMany({
            where: { clinicId: ctx.clinicId, createdAt: { gte: since } },
            select: { status: true, source: true, createdAt: true, service: true },
        });

        const status_kesimida: Record<string, number> = {};
        const manba_kesimida: Record<string, number> = {};
        for (const r of rows) {
            status_kesimida[r.status] = (status_kesimida[r.status] || 0) + 1;
            manba_kesimida[r.source || 'Noma\'lum'] = (manba_kesimida[r.source || 'Noma\'lum'] || 0) + 1;
        }

        // 7 kundan oshgan va hali "New" holatidagilar — e'tiborsiz qolgan lidlar.
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sovigan = rows.filter((r: any) => r.status === 'New' && r.createdAt < weekAgo).length;

        return {
            davr_kun: days,
            jami: rows.length,
            status_kesimida,
            manba_kesimida,
            javobsiz_eski_lidlar: sovigan,
            izoh: sovigan > 0
                ? `${sovigan} ta lid 7 kundan beri "New" holatida — ular bilan bog'lanilmagan.`
                : undefined,
        };
    },
};

/**
 * Tool'ni bajaradi. Rol tekshiruvi bu yerda QAYTA amalga oshiriladi —
 * ro'yxatdagi filtrga tayanib qolmaymiz, chunki model mavjud bo'lmagan
 * tool nomini o'ylab topishi mumkin.
 */
export const runTool = async (
    name: string,
    args: any,
    ctx: ToolContext
): Promise<any> => {
    const def = TOOL_DEFS.find(t => t.name === name);
    if (!def) return { xato: `Noma'lum tool: ${name}` };
    if (!def.roles.includes(ctx.role)) {
        return { xato: 'Bu ma\'lumotga sizning rolingizda ruxsat yo\'q.' };
    }
    if (!ctx.clinicId) {
        return { xato: 'Klinika aniqlanmadi.' };
    }
    try {
        const raw = await IMPL[name](args || {}, ctx);
        // Bazadagi matn modelga ko'rsatma bo'lib yetib bormasligi uchun
        // tozalanadi. Batafsil sabab: ai/guard.ts, 2-qism.
        return sanitizeToolResult(raw);
    } catch (e: any) {
        console.error(`[AI:tool] ${name} xatolik:`, e.message);
        return { xato: 'Ma\'lumotni olishda xatolik yuz berdi.' };
    }
};
