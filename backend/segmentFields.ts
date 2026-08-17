/**
 * Segment maydonlari reyestri.
 *
 * Nega shunday: ilgari auditoriya filtri qat'iy maydonli obyekt edi va yangi
 * filtr qo'shish uchun kod besh joyda o'zgarardi (tip, komponent, resolveSegment,
 * fasetlar, API). Endi filtr — shu ro'yxatdagi bitta yozuv. UI ham shu
 * ro'yxatdan quriladi, ya'ni yangi maydon qo'shilganda forma o'zi yangilanadi.
 *
 * MUHIM: bu fayl BAZA SXEMASINI O'ZGARTIRMAYDI — faqat mavjud ustunlarni o'qiydi.
 *
 * Ikki yo'l:
 *   where     — shart to'g'ridan-to'g'ri Prisma so'roviga tushadi (tez yo'l).
 *   predicate — JSda tekshiriladi (SQLda ifodalab bo'lmaydiganlar uchun).
 * Hozir bemorlar soni kichik bo'lgani uchun ikkalasi ham ishlaydi; baza o'sganda
 * `where` bor maydonlar avtomatik tez yo'ldan ketadi va UI o'zgarmaydi.
 */

export type FieldType = 'enum' | 'bool' | 'number' | 'months_ago' | 'days_ago' | 'text' | 'month_of_year';

export interface FieldOption { value: string; label: string; }

export interface OperatorDef { id: string; label: string; /** qiymat nechta input talab qiladi */ arity: 0 | 1 | 2; }

/** Predikatga uzatiladigan kontekst (bazadan bir marta hisoblanadi) */
export interface FieldContext {
    debtMap: Map<string, number>;
    /** Telefon raqami Eskiz uchun yaroqlimi */
    isSendablePhone: (phone?: string | null) => boolean;
    now: Date;
}

export interface SegmentFieldDef {
    id: string;
    label: string;
    type: FieldType;
    /** Guruh — UI da maydonlarni tartiblash uchun */
    group: string;
    operators: OperatorDef[];
    /** enum uchun; doctorId kabi dinamiklari ish vaqtida to'ldiriladi */
    options?: FieldOption[];
    /** Sonli maydonlar uchun input yorlig'i */
    unit?: string;
    defaultOp: string;
    defaultValue?: any;
    /** Tez yo'l: Prisma where fragmenti (bo'lmasa predicate ishlatiladi) */
    where?: (op: string, value: any) => any | null;
    /** Zaxira yo'l: JSda tekshirish */
    predicate?: (patient: any, op: string, value: any, ctx: FieldContext) => boolean;
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────

const OP_EQ: OperatorDef[] = [
    { id: 'eq', label: 'teng', arity: 1 },
    { id: 'neq', label: 'teng emas', arity: 1 },
];

const OP_BOOL: OperatorDef[] = [
    { id: 'is_true', label: 'ha', arity: 0 },
    { id: 'is_false', label: "yo'q", arity: 0 },
];

const OP_NUM: OperatorDef[] = [
    { id: 'gte', label: 'kamida', arity: 1 },
    { id: 'lte', label: 'ko\'pi bilan', arity: 1 },
    { id: 'between', label: 'oralig\'ida', arity: 2 },
];

/** dob "YYYY-MM-DD" yoki "DD.MM.YYYY" bo'lishi mumkin */
function parseDob(dob?: string): { year: number; month: number; day: number } | null {
    if (!dob) return null;
    if (dob.includes('-')) {
        const [y, m, d] = dob.split('-').map(Number);
        if (!y || !m || !d) return null;
        return { year: y, month: m, day: d };
    }
    if (dob.includes('.')) {
        const [d, m, y] = dob.split('.').map(Number);
        if (!y || !m || !d) return null;
        return { year: y, month: m, day: d };
    }
    return null;
}

export function patientAge(dob: string | undefined, now: Date): number | null {
    const p = parseDob(dob);
    if (!p) return null;
    let age = now.getFullYear() - p.year;
    const beforeBirthday =
        now.getMonth() + 1 < p.month || (now.getMonth() + 1 === p.month && now.getDate() < p.day);
    if (beforeBirthday) age--;
    return age >= 0 && age < 130 ? age : null;
}

const parsedVisit = (lastVisit?: string): Date | null => {
    if (!lastVisit) return null;
    const d = new Date(lastVisit);
    return isNaN(d.getTime()) ? null : d;
};

const monthsAgoDate = (months: number, now: Date): Date => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d;
};

const numCompare = (val: number | null, op: string, value: any): boolean => {
    if (val === null) return false;
    if (op === 'gte') return val >= Number(value);
    if (op === 'lte') return val <= Number(value);
    if (op === 'between') {
        const [min, max] = Array.isArray(value) ? value : [value, value];
        return val >= Number(min) && val <= Number(max);
    }
    return false;
};

const MONTHS = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

// ─── Reyestr ─────────────────────────────────────────────────────────────────

export const SEGMENT_FIELDS: SegmentFieldDef[] = [

    // ── Bemor ma'lumotlari ──
    {
        id: 'status',
        label: 'Bemor holati',
        type: 'enum',
        group: "Bemor ma'lumotlari",
        operators: OP_EQ,
        options: [
            { value: 'Active', label: 'Faol' },
            { value: 'Archived', label: 'Arxivlangan' },
        ],
        defaultOp: 'eq',
        defaultValue: 'Active',
        where: (op, v) => (op === 'eq' ? { status: v } : { status: { not: v } }),
    },
    {
        id: 'gender',
        label: 'Jinsi',
        type: 'enum',
        group: "Bemor ma'lumotlari",
        operators: OP_EQ,
        options: [
            { value: 'Female', label: 'Ayol' },
            { value: 'Male', label: 'Erkak' },
        ],
        defaultOp: 'eq',
        defaultValue: 'Female',
        where: (op, v) => (op === 'eq' ? { gender: v } : { gender: { not: v } }),
    },
    {
        id: 'age',
        label: 'Yoshi',
        type: 'number',
        group: "Bemor ma'lumotlari",
        operators: OP_NUM,
        unit: 'yosh',
        defaultOp: 'between',
        defaultValue: [18, 45],
        // dob matn sifatida saqlangani uchun yoshni SQLda hisoblab bo'lmaydi
        predicate: (p, op, v, ctx) => numCompare(patientAge(p.dob, ctx.now), op, v),
    },
    {
        id: 'doctorId',
        label: 'Shifokori',
        type: 'enum',
        group: "Bemor ma'lumotlari",
        operators: OP_EQ,
        options: [], // ish vaqtida to'ldiriladi
        defaultOp: 'eq',
        where: (op, v) => (op === 'eq' ? { doctorId: v } : { doctorId: { not: v } }),
    },
    {
        id: 'address',
        label: 'Manzili',
        type: 'text',
        group: "Bemor ma'lumotlari",
        operators: [{ id: 'contains', label: 'ichida bor', arity: 1 }],
        defaultOp: 'contains',
        defaultValue: '',
        where: (_op, v) => (v ? { address: { contains: String(v), mode: 'insensitive' } } : null),
    },

    // ── Tug'ilgan kun ──
    {
        id: 'birthdayMonth',
        label: "Tug'ilgan oyi",
        type: 'month_of_year',
        group: "Tug'ilgan kun",
        operators: [{ id: 'eq', label: 'teng', arity: 1 }],
        options: [
            { value: 'current', label: 'Shu oy' },
            ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
        ],
        defaultOp: 'eq',
        defaultValue: 'current',
        predicate: (p, _op, v, ctx) => {
            const dob = parseDob(p.dob);
            if (!dob) return false;
            const target = v === 'current' ? ctx.now.getMonth() + 1 : Number(v);
            return dob.month === target;
        },
    },
    {
        id: 'birthdayToday',
        label: "Bugun tug'ilgan kuni",
        type: 'bool',
        group: "Tug'ilgan kun",
        operators: OP_BOOL,
        defaultOp: 'is_true',
        predicate: (p, op, _v, ctx) => {
            const dob = parseDob(p.dob);
            const match = !!dob && dob.month === ctx.now.getMonth() + 1 && dob.day === ctx.now.getDate();
            return op === 'is_true' ? match : !match;
        },
    },

    // ── Tashriflar ──
    {
        id: 'lastVisit',
        label: 'Oxirgi tashrif',
        type: 'months_ago',
        group: 'Tashriflar',
        operators: [
            { id: 'before', label: 'shundan oldin', arity: 1 },
            { id: 'before_or_never', label: 'shundan oldin yoki umuman kelmagan', arity: 1 },
            { id: 'within', label: 'oxirgi', arity: 1 },
        ],
        unit: 'oy',
        defaultOp: 'before',
        defaultValue: 6,
        predicate: (p, op, v, ctx) => {
            const visit = parsedVisit(p.lastVisit);
            const cutoff = monthsAgoDate(Number(v) || 0, ctx.now);
            if (!visit) return op === 'before_or_never';
            if (op === 'within') return visit > cutoff;
            return visit <= cutoff; // before / before_or_never
        },
    },
    {
        id: 'everVisited',
        label: 'Umuman kelganmi',
        type: 'bool',
        group: 'Tashriflar',
        operators: OP_BOOL,
        defaultOp: 'is_false',
        predicate: (p, op) => {
            const has = !!parsedVisit(p.lastVisit);
            return op === 'is_true' ? has : !has;
        },
    },
    {
        id: 'registered',
        label: "Ro'yxatdan o'tgan",
        type: 'days_ago',
        group: 'Tashriflar',
        operators: [
            { id: 'within', label: 'oxirgi', arity: 1 },
            { id: 'before', label: 'shundan oldin', arity: 1 },
        ],
        unit: 'kun',
        defaultOp: 'within',
        defaultValue: 30,
        where: (op, v) => {
            const days = Number(v) || 0;
            const cutoff = new Date(Date.now() - days * 86400000);
            return op === 'within' ? { createdAt: { gte: cutoff } } : { createdAt: { lt: cutoff } };
        },
    },

    // ── Moliya ──
    {
        id: 'hasDebt',
        label: 'Qarzi bor',
        type: 'bool',
        group: 'Moliya',
        operators: OP_BOOL,
        defaultOp: 'is_true',
        // Qarz = Pending tranzaksiyalar + faol bo'lib to'lash qoldig'i (segments.ts)
        predicate: (p, op, _v, ctx) => {
            const has = (ctx.debtMap.get(p.id) || 0) > 0;
            return op === 'is_true' ? has : !has;
        },
    },
    {
        id: 'debtAmount',
        label: 'Qarz miqdori',
        type: 'number',
        group: 'Moliya',
        operators: OP_NUM,
        unit: "so'm",
        defaultOp: 'gte',
        defaultValue: 1000000,
        predicate: (p, op, v, ctx) => numCompare(ctx.debtMap.get(p.id) || 0, op, v),
    },
    {
        id: 'balance',
        label: 'Hisobidagi mablag\'',
        type: 'number',
        group: 'Moliya',
        operators: OP_NUM,
        unit: "so'm",
        defaultOp: 'gte',
        defaultValue: 0,
        where: (op, v) => {
            const n = Number(v);
            if (op === 'gte') return { balance: { gte: n } };
            if (op === 'lte') return { balance: { lte: n } };
            const [min, max] = Array.isArray(v) ? v : [v, v];
            return { balance: { gte: Number(min), lte: Number(max) } };
        },
    },

    // ── Aloqa ──
    {
        id: 'hasTelegram',
        label: 'Telegram botga ulangan',
        type: 'bool',
        group: 'Aloqa',
        operators: OP_BOOL,
        defaultOp: 'is_true',
        where: (op) => (op === 'is_true' ? { telegramChatId: { not: null } } : { telegramChatId: null }),
    },
    {
        id: 'hasPhone',
        label: 'Telefon raqami yaroqli',
        type: 'bool',
        group: 'Aloqa',
        operators: OP_BOOL,
        defaultOp: 'is_false',
        // Format tekshiruvi SQLda ifodalab bo'lmaydi
        predicate: (p, op, _v, ctx) => {
            const ok = ctx.isSendablePhone(p.phone);
            return op === 'is_true' ? ok : !ok;
        },
    },
];

export const getField = (id: string) => SEGMENT_FIELDS.find(f => f.id === id);

/**
 * Frontendga yuboriladigan tavsif (funksiyalarsiz).
 * doctorId kabi dinamik variantlar shu yerda to'ldiriladi.
 */
export function fieldDescriptors(doctors: { id: string; firstName: string; lastName: string }[] = []) {
    return SEGMENT_FIELDS.map(f => ({
        id: f.id,
        label: f.label,
        type: f.type,
        group: f.group,
        operators: f.operators,
        unit: f.unit,
        defaultOp: f.defaultOp,
        defaultValue: f.defaultValue,
        options: f.id === 'doctorId'
            ? doctors.map(d => ({ value: d.id, label: `${d.lastName} ${d.firstName}` }))
            : f.options,
    }));
}
