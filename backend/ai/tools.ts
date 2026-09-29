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
import { fuzzyFind, confidentPick } from './fuzzy';
import { resolveDoctor } from './context';

export interface ToolContext {
    clinicId: string;
    role: string;
    /** DOCTOR roli uchun — o'z bemorlari bilan cheklash. */
    doctorId?: string;
    /**
     * Foydalanuvchi ochib turgan bemor kartasi (sahifa konteksti).
     *
     * Mijozdan keladi, lekin server uni klinika va shifokor doirasi bo'yicha
     * TEKSHIRGANDAN keyingina shu yerga tushadi (server.ts, resolvePageContext).
     * Model bu id ni hech qachon ko'rmaydi va almashtira olmaydi.
     */
    patientId?: string;
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
const MONEY_IN_METHODS = new Set(['Cash', 'CashCollection', 'Card', 'UzcardTerminal', 'HumoTerminal', 'Click', 'P2P', 'QrBank', 'QrUzcard', 'QrHumo', 'Transfer', 'Insurance']);
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
            "Qarzdor bemorlar — eng katta qarzdan boshlab. Qarz = to'lanmagan " +
            "hisoblar va bo'lib-bo'lib to'lashning qolgan qismi. " +
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
    // Quyidagi ikkitasi "qo'shimcha" tool'lar: ular faqat kerak bo'lganda
    // yuboriladi (router.ts, EXTRA_TOOLS). Keng savolga har safar qo'shilsa,
    // ~200 token hech narsa bermasdan yeyilardi.
    {
        name: 'get_patient_card',
        description:
            'BITTA bemorning kartasi: yoshi, shifokori, tashriflar va kelmaganlar ' +
            'soni, oxirgi va keyingi qabul, bajarilgan ishlar (tish raqami bilan), ' +
            'tish xaritasi, qarz va avans, nazorat ko\'rigi. "Bu bemor haqida xulosa", ' +
            '"qanday davolangan?", "keyingi qabuli qachon?" kabi savollar uchun. ' +
            'Bemor kartasi ochiq bo\'lsa query BERMA — ochiq bemor olinadi.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Bemor ismi yoki telefoni. Ochiq kartadagi bemor haqida bo\'lsa — berilmaydi.',
                },
            },
            required: [],
        },
        roles: ALL,
    },
    {
        name: 'find_free_slots',
        description:
            'Berilgan kunda shifokorlarning BO\'SH vaqtlari: ish vaqti va band ' +
            'qabullar hisobga olinadi. "Ertaga bo\'sh joy bormi?", "Rahimovda ' +
            'qachon bo\'sh?" kabi savollar uchun, qabulga yozishdan oldin.',
        parameters: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Sana, YYYY-MM-DD' },
                doctorName: { type: 'string', description: 'Shifokor familiyasi yoki ismi. Berilmasa — barcha shifokorlar.' },
                duration: { type: 'integer', description: 'Qabul davomiyligi, daqiqa (standart 30)' },
            },
            required: ['date'],
        },
        roles: ALL,
    },
];

/**
 * Faqat kerak bo'lganda yuboriladigan tool'lar. Keng savol va tanilmagan
 * savolga ular qo'shilmaydi — batafsil: router.ts.
 */
export const EXTRA_TOOLS = new Set(['get_patient_card', 'find_free_slots']);

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
 * Qarzdor bemorlar ro'yxati.
 *
 * ILOVANING O'Z mantiqi (pages/Finance.tsx): qarz = to'lanmagan
 * ("Pending") to'lovlar + bo'lib-bo'lib to'lashning qolgan qismi.
 *
 * NEGA ALOHIDA FUNKSIYA: bu mantiq ikki joyda kerak — "kim qarzdor?"
 * savolida va "qarzdorlarga eslatma yubor" buyrug'ida. Ilgari ular
 * alohida yozilgan edi va aynan shu narsa productionda bilinmay
 * qoldi: get_debtors to'g'rilangan, send_reminder esa eskicha
 * `balance < 0` bo'yicha qidiraverdi. `balance` — bu avans qoldig'i,
 * qarz daftari emas; u deyarli har doim nol. Natijada "qarzdorlarga
 * xabar yubor" buyrug'iga "qarzdor topilmadi" javobi kelardi,
 * Moliya sahifasida esa qarzdorlar ro'yxati turardi.
 *
 * Endi bitta manba: ikkalasi ham shu funksiyani chaqiradi.
 */
export interface Debtor {
    patientId: string | null;
    ism: string;
    summa: number;
    /** Eng eski qarz sanasi. */
    sana: string;
    patient?: any;
}

export const findDebtors = async (ctx: ToolContext): Promise<Debtor[]> => {
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

    // Bemorlar FAQAT qarzi borlari bo'yicha olinadi. Ilgari bu yerda
    // klinikaning BARCHA bemorlari yuklanardi — bir necha ming yozuv, har
    // bir savolda, AI so'rovining kritik yo'lida.
    const ids = Array.from(new Set([
        ...pending.map((t: any) => t.patientId).filter(Boolean),
        ...plans.map((p: any) => p.patientId).filter(Boolean),
    ])) as string[];

    const patients = ids.length
        ? await prisma.patient.findMany({
            where: { id: { in: ids }, clinicId: ctx.clinicId },
            select: {
                id: true, firstName: true, lastName: true, phone: true,
                lastVisit: true, telegramChatId: true,
            },
        })
        : [];

    const byId = new Map<string, any>(patients.map((p: any) => [p.id, p]));
    const debts = new Map<string, Debtor>();

    const add = (key: string, patientId: string | null, ism: string, summa: number, sana: string, patient?: any) => {
        const cur = debts.get(key);
        if (cur) {
            cur.summa += summa;
            if (sana && (!cur.sana || sana < cur.sana)) cur.sana = sana;
        } else {
            debts.set(key, { patientId, ism, summa, sana, patient });
        }
    };

    for (const t of pending) {
        const p = t.patientId ? byId.get(t.patientId) : undefined;
        add(
            t.patientId || `nom:${t.patientName}`,
            t.patientId || null,
            p ? maskName(p.firstName, p.lastName) : maskName(t.patientName, ''),
            t.amount || 0, t.date || '', p
        );
    }

    for (const pl of plans) {
        const qoldiq = (pl.totalAmount || 0) - (pl.totalPaid || 0);
        if (qoldiq <= 0) continue;
        const p = byId.get(pl.patientId);
        add(pl.patientId, pl.patientId,
            p ? maskName(p.firstName, p.lastName) : 'Noma\'lum', qoldiq, '', p);
    }

    return Array.from(debts.values())
        .filter(d => d.summa > 0)
        .sort((a, b) => b.summa - a.summa);
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

    // 2-bosqich: XATOLARGA CHIDAMLI qidiruv.
    //
    // Bu bosqich "kamida bitta so'z mos keladi" dan OLDIN turadi va bu
    // tartib ataylab shunday.
    //
    // Sabab productionda ko'rindi: "asror kamolov" so'roviga ikkita bemor
    // chiqdi — "Asror Kamol" (to'g'ri) va "Asrorov Samandar" (faqat
    // birinchi so'z mos kelgani uchun). Foydalanuvchiga esa keraksiz
    // tanlash kartasi ko'rsatildi.
    //
    // Xatolarga chidamli qidiruv ANIQROQ: u HAR BIR so'z mos kelishini
    // talab qiladi, faqat xatolarga yon beradi. "Kamida bittasi" esa eng
    // keng va eng shovqinli — u haqiqatan oxirgi chora bo'lishi kerak.
    const pool = await prisma.patient.findMany({
        where: scope,
        select: { id: true, firstName: true, lastName: true },
        take: FUZZY_POOL_LIMIT,
    });

    const hits = fuzzyFind(q, pool, take);

    if (hits.length) {
        // Eng yaqini boshqalardan sezilarli aniqroq bo'lsa — tanlash
        // kartasini ko'rsatishning hojati yo'q, javob allaqachon aniq.
        const sure = confidentPick(hits);
        const chosen = sure ? [sure] : hits.map(h => h.item);

        const found = await prisma.patient.findMany({
            where: { ...scope, id: { in: chosen.map(c => c.id) } },
            select,
        });
        const order = new Map(chosen.map((c, i) => [c.id, i]));
        return found.sort((a: any, b: any) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    }

    // 3-bosqich: kamida bitta so'z mos kelsa ham bo'ladi. Eng keng va eng
    // shovqinli, shuning uchun oxirgi.
    if (tokens.length > 1) {
        return prisma.patient.findMany({
            where: { ...scope, OR: tokens.map(byName) }, take, select,
        });
    }

    return [];

};

// ─── Klinika soati ───────────────────────────────────────────────────────────
// Server UTC'da ishlaydi, klinikalar esa UTC+5 da. "Keyingi qabul" va "bugun
// qolgan bo'sh vaqt" aynan shu soatga nisbatan hisoblanishi shart.
export const clinicClock = (): { date: string; time: string } => {
    const iso = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

const toMinutes = (hhmm: string): number => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const toHHMM = (min: number): string =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ─── Bemor kartasi ───────────────────────────────────────────────────────────
//
// Ma'lumot BIR MARTA yig'iladi va ikki shaklga keltiriladi:
//   • modelga (get_patient_card) — maskalangan: ism qisqartirilgan, telefon,
//     manzil va anamnez umuman yo'q;
//   • UI ga (ai/evidence.ts) — to'liq ism va id bilan, bosiladigan karta.
// Ikkalasi bitta yuklovchidan olingani uchun bir-biridan farq qila olmaydi.

/**
 * "shu bemor", "bu bemor", "joriy bemor" — ochiq kartadagi bemorga ishora.
 *
 * Bo'sh qiymat ham shunday hisoblanadi: model kartani ochiq bemor uchun
 * so'raganda argumentni umuman bermaydi.
 */
export const refersToCurrentPatient = (q: unknown): boolean => {
    const s = String(q ?? '')
        .toLowerCase()
        .replace(/['ʻʼ`’]/g, '')
        .replace(/[.,!?«»"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return true;
    return [
        /^(shu|bu|ushbu|joriy|ochiq|hozirgi|mana shu|osha)( bemor[a-z]*)?$/,
        /^(bemor[a-z]*|пациент[а-яё]*|patient|current( patient)?)$/,
        /^(этот|эта|этого|этой|этому|текущ[а-яё]*|данн[а-яё]*|открыт[а-яё]*)( пациент[а-яё]*)?$/,
        /^(u|uni|unga|uning|его|её|ее|ему|ей)$/,
    ].some(re => re.test(s));
};

export interface PatientCardData {
    id: string;
    firstName: string;
    lastName: string;
    age: number | null;
    gender: string;
    status: string;
    /** Bemor klinikada ro'yxatga olingan sana. */
    since: string;
    lastVisit: string;
    doctor: { id: string; name: string } | null;
    visits: number;
    noShows: number;
    cancelled: number;
    next: { date: string; time: string; doctorName: string; type: string } | null;
    recent: { date: string; type: string; status: string; doctorName: string }[];
    procedures: { date: string; name: string; tooth: number | null; price: number }[];
    /** Tish xaritasi: holat -> tishlar soni. */
    teeth: Record<string, number>;
    debt: number;
    advance: number;
    recall: { date: string; reason: string } | null;
    diagnoses: { code: string; name: string; date: string }[];
}

/**
 * Sanani "YYYY-MM-DD" ga keltiradi, sana bo'lmasa — bo'sh satr.
 *
 * `Patient.lastVisit` ga ishonib bo'lmaydi: bazada ko'p bemorda u "Never",
 * qolganlarida to'liq ISO vaqt ("2026-09-12T08:30:00.000Z"). Kartada
 * "oxirgi tashrif: Never" chiqmasligi uchun faqat haqiqiy sana olinadi.
 */
export const isoDay = (v: unknown): string => {
    const m = String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
};

/**
 * Tug'ilgan sanadan yosh. Bazada ikki format uchraydi: "1990-05-14" va
 * "14.05.1990". Boshqasi bo'lsa — null (taxmin qilinmaydi).
 */
const ageFrom = (dob: string, today: string): number | null => {
    const s = String(dob || '').trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const [y, mo, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
    if (!y) return null;
    let age = Number(today.slice(0, 4)) - Number(y);
    if (today.slice(5) < `${mo}-${d}`) age--;
    return age >= 0 && age < 120 ? age : null;
};

/**
 * Qabul izohidagi protsedura qatorlari.
 *
 * Format ilovaning O'Z formati (pages/PatientDetails.tsx, ProceduresSection):
 *   "- Plomba (Tish #16) [300 000 UZS]"
 * AI ning add_procedure harakati ham xuddi shu formatda yozadi.
 */
const parseProcedures = (notes: string | null | undefined, date: string) => {
    const out: { date: string; name: string; tooth: number | null; price: number }[] = [];
    for (const raw of String(notes || '').split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('-')) continue;
        // Nom — "(Tish #..)", "(Umumiy)" yoki "[.. UZS]" dan oldingi qism. Bitta
        // regex bilan olinmaydi: nomning o'zida qavs bo'lishi mumkin
        // ("Koronka (metallokeramika)") va u holda butun qator tushib qolardi.
        let name = line.replace(/^-\s*/, '');
        const cut = name.search(/\s*(\((?:Tish #\d+|Umumiy)\)|\[[\d\s]+UZS\])/i);
        if (cut > 0) name = name.slice(0, cut);
        name = name.trim();
        if (!name) continue;
        const tooth = line.match(/\(Tish #(\d+)\)/i);
        const price = line.match(/\[([\d\s]+)UZS\]/i);
        out.push({
            date,
            name: name.slice(0, 120),
            tooth: tooth ? Number(tooth[1]) : null,
            price: price ? Number(price[1].replace(/\D/g, '')) || 0 : 0,
        });
    }
    return out;
};

/**
 * Bemor kartasi uchun barcha ma'lumotni yuklaydi.
 * Bemor topilmasa yoki boshqa klinikaniki bo'lsa — null.
 */
export const loadPatientCard = async (
    patientId: string,
    ctx: ToolContext
): Promise<PatientCardData | null> => {
    const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: ctx.clinicId },
        select: {
            id: true, firstName: true, lastName: true, dob: true, gender: true, status: true,
            createdAt: true, lastVisit: true, balance: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!patient) return null;

    const { date: today, time: now } = clinicClock();

    const [appts, pending, plans, teeth, recall, diagnoses] = await Promise.all([
        prisma.appointment.findMany({
            where: { clinicId: ctx.clinicId, patientId },
            orderBy: [{ date: 'desc' }, { time: 'desc' }],
            take: 80,
            select: { date: true, time: true, status: true, type: true, doctorName: true, notes: true },
        }),
        prisma.transaction.findMany({
            where: { clinicId: ctx.clinicId, patientId, status: 'Pending' },
            select: { amount: true },
        }),
        prisma.installmentPlan.findMany({
            where: { clinicId: ctx.clinicId, patientId, status: 'Active' },
            select: { totalAmount: true, totalPaid: true },
        }),
        prisma.toothData.findMany({
            where: { patientId },
            select: { conditions: true },
        }),
        prisma.recall.findFirst({
            where: { clinicId: ctx.clinicId, patientId, status: { in: ['planned', 'reminded'] } },
            orderBy: { dueDate: 'asc' },
            select: { dueDate: true, reason: true },
        }),
        prisma.patientDiagnosis.findMany({
            where: { clinicId: ctx.clinicId, patientId },
            orderBy: { date: 'desc' },
            take: 5,
            select: { code: true, date: true, icd10: { select: { name: true } } },
        }),
    ]);

    const upcoming = appts
        .filter((a: any) => ['Pending', 'Confirmed'].includes(a.status)
            && (a.date > today || (a.date === today && a.time >= now)))
        .sort((a: any, b: any) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const past = appts.filter((a: any) => a.date < today || (a.date === today && a.time < now));

    // Tish xaritasi: har bir tishdagi holatlar JSON massiv sifatida saqlanadi.
    const teethSummary: Record<string, number> = {};
    for (const t of teeth) {
        let list: string[] = [];
        try {
            const o = JSON.parse(t.conditions || '[]');
            if (Array.isArray(o)) list = o.map((x: any) => (typeof x === 'string' ? x : x?.type || x?.condition)).filter(Boolean);
        } catch { /* buzuq yozuv — o'tkazib yuboramiz */ }
        for (const c of list) teethSummary[c] = (teethSummary[c] || 0) + 1;
    }

    const debt = pending.reduce((s: number, t: any) => s + (t.amount || 0), 0)
        + plans.reduce((s: number, p: any) => s + Math.max(0, (p.totalAmount || 0) - (p.totalPaid || 0)), 0);

    return {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        age: ageFrom(patient.dob, today),
        gender: patient.gender,
        status: patient.status,
        since: patient.createdAt ? new Date(patient.createdAt).toISOString().slice(0, 10) : '',
        // Yakunlangan qabul — eng ishonchli manba; lastVisit maydoni faqat zaxira.
        lastVisit: past.find((a: any) => a.status === 'Completed')?.date
            || isoDay(patient.lastVisit),
        doctor: patient.doctor
            ? { id: patient.doctor.id, name: `${patient.doctor.lastName} ${patient.doctor.firstName}`.trim() }
            : null,
        visits: appts.filter((a: any) => a.status === 'Completed').length,
        noShows: appts.filter((a: any) => a.status === 'No-Show').length,
        cancelled: appts.filter((a: any) => a.status === 'Cancelled').length,
        next: upcoming[0]
            ? { date: upcoming[0].date, time: upcoming[0].time, doctorName: upcoming[0].doctorName, type: upcoming[0].type }
            : null,
        recent: past.slice(0, 5).map((a: any) => ({
            date: a.date, type: a.type, status: a.status, doctorName: a.doctorName,
        })),
        procedures: appts
            .filter((a: any) => a.status === 'Completed' || a.status === 'Checked-In')
            .flatMap((a: any) => parseProcedures(a.notes, a.date))
            .slice(0, 12),
        teeth: teethSummary,
        debt: Math.round(debt),
        advance: Math.max(0, Math.round(patient.balance || 0)),
        recall: recall ? { date: recall.dueDate, reason: recall.reason || '' } : null,
        diagnoses: diagnoses.map((d: any) => ({ code: d.code, name: d.icd10?.name || '', date: d.date })),
    };
};

/**
 * Karta qaysi bemor uchun ekanini aniqlaydi.
 *
 * Ochiq karta (ctx.patientId) ustun turadi: shifokor kartani ochib "qanday
 * davolangan?" deb so'raganda model ism aytmaydi va aytishi ham shart emas.
 */
export const resolveCardPatient = async (
    query: unknown,
    ctx: ToolContext
): Promise<{ id?: string; candidates?: any[]; xato?: string }> => {
    if (ctx.patientId && refersToCurrentPatient(query)) return { id: ctx.patientId };
    const q = String(query ?? '').trim();
    if (q.length < 2) {
        return { xato: 'Qaysi bemor haqida ekani aniq emas — ismini ayting yoki bemor kartasini oching.' };
    }
    const rows = await searchPatients(q, ctx, 5);
    if (!rows.length) return { xato: `"${q}" bo'yicha bemor topilmadi.` };
    if (rows.length > 1) return { candidates: rows };
    return { id: rows[0].id };
};

// ─── Bo'sh vaqtlar ───────────────────────────────────────────────────────────
//
// Kalendar ilgari AI uchun faqat "nechta qabul bor" edi. "Ertaga Rahimovda
// bo'sh joy bormi?" — resepshnning eng ko'p savoli — javobsiz qolardi yoki
// model ro'yxatga qarab o'zi taxmin qilardi. Hisob endi deterministik:
// ish vaqti − band qabullar, 30 daqiqalik qadam bilan.

export interface SlotsData {
    date: string;
    duration: number;
    doctors: { id: string; name: string; start: string; end: string; free: string[]; busy: number }[];
}

const SLOT_STEP = 30;

export const computeFreeSlots = async (
    args: any,
    ctx: ToolContext
): Promise<SlotsData | { xato: string }> => {
    const date = String(args?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { xato: 'Sana YYYY-MM-DD ko\'rinishida bo\'lishi kerak.' };

    const { date: today, time: now } = clinicClock();
    if (date < today) return { xato: 'Bu sana o\'tib ketgan — bo\'sh vaqt faqat bugun va keyingi kunlar uchun.' };

    const duration = clampLimit(args?.duration, 30, 180);

    const where: any = { clinicId: ctx.clinicId, status: 'Active' };
    // Shifokor faqat O'Z jadvalini ko'radi — boshqa tool'lardagi kabi.
    if (ctx.role === 'DOCTOR' && ctx.doctorId) {
        where.id = ctx.doctorId;
    } else if (args?.doctorName) {
        const found = await resolveDoctor(ctx.clinicId, String(args.doctorName));
        if (!found) return { xato: `"${args.doctorName}" ismli shifokor topilmadi.` };
        where.id = found.id;
    }

    const [clinic, doctors] = await Promise.all([
        prisma.clinic.findUnique({ where: { id: ctx.clinicId }, select: { startHour: true, endHour: true } }),
        prisma.doctor.findMany({
            where,
            select: { id: true, firstName: true, lastName: true, startHour: true, endHour: true },
            take: 20,
        }),
    ]);
    if (!doctors.length) return { xato: 'Faol shifokor topilmadi.' };

    const appts = await prisma.appointment.findMany({
        where: {
            clinicId: ctx.clinicId,
            date,
            doctorId: { in: doctors.map((d: any) => d.id) },
            status: { notIn: ['Cancelled'] },
        },
        select: { doctorId: true, time: true, duration: true },
    });

    // Bugun bo'lsa — o'tib ketgan vaqtlar taklif qilinmaydi.
    const earliest = date === today ? Math.ceil(toMinutes(now) / SLOT_STEP) * SLOT_STEP : 0;

    return {
        date,
        duration,
        doctors: doctors.map((d: any) => {
            const start = (d.startHour ?? clinic?.startHour ?? 8) * 60;
            const end = (d.endHour ?? clinic?.endHour ?? 20) * 60;
            const busy = appts
                .filter((a: any) => a.doctorId === d.id)
                .map((a: any) => {
                    const s = toMinutes(a.time);
                    return { s, e: s + (a.duration > 0 ? a.duration : 30) };
                });
            const free: string[] = [];
            for (let t = Math.max(start, earliest); t + duration <= end; t += SLOT_STEP) {
                if (!busy.some((b: { s: number; e: number }) => t < b.e && t + duration > b.s)) free.push(toHHMM(t));
            }
            return {
                id: d.id,
                name: `${d.lastName} ${d.firstName}`.trim(),
                start: toHHMM(start),
                end: toHHMM(end),
                free,
                busy: busy.length,
            };
        }),
    };
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
        const list = await findDebtors(ctx);
        const jami = list.reduce((s, d) => s + d.summa, 0);

        return {
            topildi: list.length,
            jami_qarz: fmt(jami),
            bemorlar: list.slice(0, limit).map(d => ({
                bemor: d.ism,
                telefon: maskPhone(d.patient?.phone),
                qarz: fmt(d.summa),
                eng_eski_qarz_sanasi: d.sana || undefined,
                oxirgi_tashrif: d.patient?.lastVisit,
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

    get_patient_card: async (args, ctx) => {
        const who = await resolveCardPatient(args.query, ctx);
        if (who.xato) return { xato: who.xato };
        if (who.candidates) {
            return {
                topildi: who.candidates.length,
                bemorlar: who.candidates.map((r: any) => ({
                    bemor: maskName(r.firstName, r.lastName),
                    oxirgi_tashrif: r.lastVisit,
                })),
                izoh: 'Bir nechta bemor mos keldi — qaysi biri ekanini familiyasi va ismi bilan so\'ra.',
            };
        }
        const c = await loadPatientCard(who.id as string, ctx);
        if (!c) return { xato: 'Bemor topilmadi.' };

        return {
            bemor: maskName(c.firstName, c.lastName),
            yosh: c.age ?? undefined,
            jins: c.gender || undefined,
            holat: c.status,
            shifokor: c.doctor?.name || '-',
            bemor_bolgan_sana: c.since || undefined,
            oxirgi_tashrif: c.lastVisit || undefined,
            tashriflar: c.visits,
            kelmagan: c.noShows,
            bekor_qilingan: c.cancelled,
            keyingi_qabul: c.next
                ? { sana: c.next.date, vaqt: c.next.time, shifokor: c.next.doctorName, turi: c.next.type }
                : 'yo\'q',
            oxirgi_qabullar: c.recent.map(r => ({ sana: r.date, turi: r.type, status: r.status })),
            bajarilgan_ishlar: c.procedures.map(p => ({
                sana: p.date, ish: p.name, tish: p.tooth ?? undefined, narx: p.price || undefined,
            })),
            tish_xaritasi: Object.keys(c.teeth).length ? c.teeth : undefined,
            qarz: c.debt,
            avans: c.advance,
            nazorat_korigi: c.recall ? { sana: c.recall.date, sabab: c.recall.reason || undefined } : undefined,
            tashxislar: c.diagnoses.length
                ? c.diagnoses.map(d => `${d.code}${d.name ? ` ${d.name}` : ''}`)
                : undefined,
            izoh: 'Summalar so\'mda. qarz — to\'lanmagan hisoblar va bo\'lib-bo\'lib to\'lash qoldig\'i; '
                + 'avans — oldindan to\'langan qoldiq. Ism maxfiylik uchun qisqartirilgan.',
        };
    },

    find_free_slots: async (args, ctx) => {
        const r = await computeFreeSlots(args, ctx);
        if ('xato' in r) return r;
        // Barcha bo'sh vaqtlar foydalanuvchiga kartochkada chiqadi (ai/evidence.ts).
        // Modelga hammasi berilsa, u ularni matnda qatorlab sanab chiqardi —
        // kartochkaning takrori va ortiqcha token. Bitta shifokor so'ralganda esa
        // to'liq ro'yxat kerak: "soat 15:00 bo'shmi?" degan savolga javob shunda.
        const perDoctor = args?.doctorName || r.doctors.length === 1 ? 24 : 4;
        return {
            sana: r.date,
            davomiylik_daqiqa: r.duration,
            shifokorlar: r.doctors.map(d => ({
                shifokor: d.name,
                ish_vaqti: `${d.start}–${d.end}`,
                band_qabullar: d.busy,
                bosh_vaqtlar: d.free.slice(0, perDoctor),
                jami_bosh: d.free.length,
            })),
            izoh: 'Vaqtlar klinika soati bo\'yicha, har biri — qabul boshlanishi. '
                + 'jami_bosh — shu kundagi barcha bo\'sh vaqtlar soni. To\'liq ro\'yxat '
                + 'foydalanuvchiga kartochkada ko\'rsatiladi: matnda har shifokor uchun '
                + 'eng yaqin 1-2 vaqtni va jami sonini ayt.',
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
