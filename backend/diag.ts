// ─── Diagnostika qaydlari ────────────────────────────────────────────────────
// Mijoz "bot ishlamayapti", "SMS ketmadi", "kira olmayapman" deb yozganda
// sababni topish uchun ma'lumot kerak. Ilgari bu hodisalar faqat console'ga
// chiqardi va Railway loglarida bir necha kunda yo'qolardi:
//
//   • klinika boti ishga tushmadi yoki o'chib qoldi (token xato, 409)
//   • kimdir tizimga kira olmadi (login topilmadi, parol xato, bloklangan)
//   • avtomatik xabar ketmadi (shablon yo'q, qoida xato berdi)
//   • brauzerda yoki serverda xato chiqdi
//
// Endi ular DiagEvent jadvaliga tushadi. Yordam boti (support/tools.ts) shu
// jadvaldan o'qib, mijozga aniq sababni aytadi.
//
// MUHIM: yozuv HECH QACHON asosiy ishni yiqitmasligi kerak — jadval hali
// yaratilmagan deployda ham login, bot va avtomatika ishlashi shart. Shuning
// uchun hamma narsa try/catch ichida.

import { createHash, randomUUID } from 'crypto';

export interface DiagInput {
    clinicId?: string | null;
    /** bot_down | bot_up | bot_error | login_failed | automation_skip | client_error | server_error */
    kind: string;
    /** Nima haqida: qoida id, login, sahifa manzili */
    subject?: string | null;
    /** Odam o'qiydigan sabab — bot shuni mijozga aytadi */
    message: string;
    meta?: any;
}

const MESSAGE_MAX = 500;
const META_MAX = 2000;
const SUBJECT_MAX = 200;

// Telegram bot tokeni xato matnida (so'rov manzilida) kelib qolishi mumkin
const BOT_TOKEN_RE = /\d{6,}:[A-Za-z0-9_-]{30,}/g;
const redact = (s: string) => s.replace(BOT_TOKEN_RE, '***');

const cut = (s: any, n: number): string => {
    const str = redact(String(s ?? ''));
    return str.length > n ? str.slice(0, n) : str;
};

const metaText = (meta: any): string | null => {
    if (meta === undefined || meta === null) return null;
    try {
        return cut(typeof meta === 'string' ? meta : JSON.stringify(meta), META_MAX);
    } catch {
        return null;
    }
};

const tashkentDay = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const rowOf = (e: DiagInput) => ({
    clinicId: e.clinicId || null,
    kind: e.kind,
    subject: e.subject ? cut(e.subject, SUBJECT_MAX) : null,
    message: cut(e.message, MESSAGE_MAX),
    meta: metaText(e.meta),
    count: 1,
    lastAt: new Date(),
});

/** 409: shu token bilan boshqa joyda ham getUpdates ishlayapti */
export const BOT_CONFLICT_REASON = 'Bot boshqa joyda ham ishga tushirilgan (shu token ikki joyda ishlatilmoqda)';

/** Telegram xatosini mijozga aytsa bo'ladigan sababga aylantiradi */
export const botFailureReason = (err: any): string => {
    const code = err?.response?.error_code ?? err?.code;
    if (code === 401) return "Bot tokeni noto'g'ri yoki bekor qilingan";
    if (code === 409) return BOT_CONFLICT_REASON;
    return cut(err?.response?.description || err?.message || String(err), 200);
};

export const createDiag = (db: any) => ({
    /** Alohida hodisa: har chaqiruv — yangi qator */
    async record(e: DiagInput): Promise<void> {
        try {
            await db.diagEvent.create({ data: { id: randomUUID(), ...rowOf(e) } });
        } catch (err: any) {
            console.warn('[diag] yozib bo\'lmadi:', err?.message);
        }
    },

    /**
     * Takrorlanadigan hodisa: kuniga bitta qator, soni oshib boradi.
     *
     * Avtomatika har 10 daqiqada aylanadi — "shablon tanlanmagan" sababi
     * kuniga 144 marta yozilsa jadval bir oyda foydasiz axlatga to'lardi.
     * Kalit qatorning id'sida, shuning uchun server qayta ishga tushsa ham
     * takror yozilmaydi.
     */
    async recordDaily(e: DiagInput): Promise<void> {
        try {
            const row = rowOf(e);
            const id = createHash('sha1')
                .update([row.kind, row.clinicId, row.subject, row.message, tashkentDay()].join('|'))
                .digest('hex');
            await db.diagEvent.upsert({
                where: { id },
                create: { id, ...row },
                update: { count: { increment: 1 }, lastAt: new Date() },
            });
        } catch (err: any) {
            console.warn('[diag] yozib bo\'lmadi:', err?.message);
        }
    },

    /** Shu klinika bo'yicha ko'rsatilgan turlardagi eng oxirgi hodisa */
    async latest(clinicId: string, kinds: string[], subject?: string): Promise<any | null> {
        try {
            return await db.diagEvent.findFirst({
                where: { clinicId, kind: { in: kinds }, ...(subject ? { subject } : {}) },
                orderBy: { lastAt: 'desc' },
            });
        } catch {
            return null;
        }
    },

    async list(q: { clinicId?: string | null; kinds?: string[]; subject?: string; days?: number; take?: number }): Promise<any[]> {
        try {
            const since = new Date(Date.now() - (q.days ?? 7) * 24 * 60 * 60 * 1000);
            return await db.diagEvent.findMany({
                where: {
                    ...(q.clinicId ? { clinicId: q.clinicId } : {}),
                    ...(q.kinds?.length ? { kind: { in: q.kinds } } : {}),
                    ...(q.subject ? { subject: q.subject } : {}),
                    lastAt: { gte: since },
                },
                orderBy: { lastAt: 'desc' },
                take: q.take ?? 50,
            });
        } catch {
            return [];
        }
    },

    /** Eski qaydlarni o'chiradi (kunlik cron) */
    async prune(days = 30): Promise<void> {
        try {
            await db.diagEvent.deleteMany({ where: { lastAt: { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } } });
        } catch (err: any) {
            console.warn('[diag] tozalab bo\'lmadi:', err?.message);
        }
    },
});

export type Diag = ReturnType<typeof createDiag>;

// Umumiy nusxa. `require` funksiya ichida: bu fayl botManager'dan ham
// chaqiriladi va db moduli yuklanish tartibiga bog'lanib qolmasligi kerak.
let shared: Diag | null = null;
export const diag: Diag = new Proxy({} as Diag, {
    get(_t, prop: keyof Diag) {
        if (!shared) shared = createDiag(require('./db').prisma);
        return shared[prop];
    },
});
