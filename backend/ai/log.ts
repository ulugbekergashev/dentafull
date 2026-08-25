// ─── AI so'rovlari jurnali ────────────────────────────────────────────────────
//
// Ilgari har bir AI chaqiruvi haqidagi yagona iz — `console.log` edi. U
// Railway loglarida bir necha kunda yo'qoladi, ya'ni quyidagi savollarning
// birortasiga ham javob yo'q edi:
//
//   • qaysi savollar ko'p beriladi va qaysilari javobsiz qoladi?
//   • qaysi klinika AI ni haqiqatan ishlatadi?
//   • oyiga qancha token ketyapti va qaysi endpoint ko'p yeyapti?
//   • qaysi javoblar grounding tekshiruvidan yiqildi?
//
// Bu jadval — qolgan barcha yaxshilanishning yoqilg'isi. 👎 olgan savollar
// to'g'ridan-to'g'ri etalon to'plamga (ai/evals/questions.ts) yangi savol
// bo'lib tushadi, ya'ni test to'plami taxmindan emas, haqiqiy foydalanishdan
// o'sadi.
//
// MUHIM: yozuv HECH QACHON asosiy so'rovni yiqitmasligi kerak. Jurnal
// ikkilamchi — u ishlamay qolsa ham foydalanuvchi javobini olishi shart.
// Shuning uchun hamma narsa try/catch ichida va `await` qilinmaydi.

const { prisma } = require('../db');

export interface AiLogEntry {
    clinicId?: string | null;
    userId?: string | null;
    userName?: string | null;
    role?: string | null;
    /** 'ask' | 'report' | 'chat' | 'insights' | 'advisor' | 'digest' | 'action' */
    endpoint: string;
    lang?: string | null;
    question?: string | null;
    reply?: string | null;
    toolCalls?: any;
    provider?: string | null;
    model?: string | null;
    tokensIn?: number | null;
    tokensOut?: number | null;
    latencyMs?: number | null;
    rounds?: number | null;
    cached?: boolean;
    groundingOk?: boolean | null;
    groundingInfo?: string | null;
    error?: string | null;
    conversationId?: string | null;
}

/** Matnni jadval uchun qisqartiradi — javob juda uzun bo'lishi mumkin. */
const cut = (s: any, n: number): string | null => {
    if (s === null || s === undefined) return null;
    const str = String(s);
    return str.length > n ? str.slice(0, n) : str;
};

/**
 * Yozuvni saqlaydi va uning id'sini qaytaradi.
 *
 * id kerak, chunki UI shu id bilan 👍/👎 yuboradi. Shuning uchun bu funksiya
 * `await` qilinadi — lekin xatolik yuz bersa `null` qaytadi va chaqiruvchi
 * o'z ishini davom ettiraveradi.
 */
export const logAi = async (entry: AiLogEntry): Promise<string | null> => {
    try {
        const row = await prisma.aiLog.create({
            data: {
                clinicId: entry.clinicId || null,
                userId: entry.userId ? String(entry.userId) : null,
                userName: cut(entry.userName, 120),
                role: entry.role || null,
                endpoint: entry.endpoint,
                lang: entry.lang || null,
                question: cut(entry.question, 2000),
                reply: cut(entry.reply, 8000),
                toolCalls: entry.toolCalls ? cut(JSON.stringify(entry.toolCalls), 4000) : null,
                provider: entry.provider || null,
                model: entry.model || null,
                tokensIn: entry.tokensIn ?? null,
                tokensOut: entry.tokensOut ?? null,
                latencyMs: entry.latencyMs ?? null,
                rounds: entry.rounds ?? null,
                cached: !!entry.cached,
                groundingOk: entry.groundingOk ?? null,
                groundingInfo: cut(entry.groundingInfo, 500),
                error: cut(entry.error, 1000),
                conversationId: entry.conversationId || null,
            },
            select: { id: true },
        });
        return row.id;
    } catch (e: any) {
        // Jadval hali yaratilmagan bo'lishi mumkin (migratsiya o'tmagan deploy).
        // Bu holatda ham AI ishlashda davom etadi.
        console.warn('[AI:log] yozib bo\'lmadi:', e?.message);
        return null;
    }
};

/**
 * Foydalanuvchi bahosi. `rating`: 1 = foydali, -1 = foydasiz.
 *
 * Faqat o'z klinikasining yozuviga baho qo'yish mumkin — aks holda boshqa
 * klinikaning id'sini topib, uning jurnaliga yozib qo'yish mumkin bo'lardi.
 */
export const rateAiLog = async (
    id: string,
    rating: number,
    note: string | null,
    ctx: { clinicId?: string | null; role?: string }
): Promise<boolean> => {
    try {
        const where: any = { id };
        if (ctx.role !== 'SUPER_ADMIN') where.clinicId = ctx.clinicId || null;

        const res = await prisma.aiLog.updateMany({
            where,
            data: {
                rating: rating > 0 ? 1 : -1,
                ratingNote: note ? String(note).slice(0, 1000) : null,
            },
        });
        return res.count > 0;
    } catch (e: any) {
        console.warn('[AI:log] baho yozilmadi:', e?.message);
        return false;
    }
};

export interface AiUsageStats {
    davr_kun: number;
    jami_sorov: number;
    xatolar: number;
    keshdan: number;
    ortacha_ms: number;
    tokensIn: number;
    tokensOut: number;
    endpoint_kesimida: Record<string, number>;
    baho: { yoqdi: number; yoqmadi: number };
    grounding_yiqildi: number;
}

/**
 * Foydalanish statistikasi — Sozlamalardagi AI bo'limi va SuperAdmin uchun.
 * clinicId berilmasa (SUPER_ADMIN) — butun platforma bo'yicha.
 */
export const aiUsageStats = async (clinicId: string | null, days = 30): Promise<AiUsageStats> => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: any = { createdAt: { gte: since } };
    if (clinicId) where.clinicId = clinicId;

    const rows = await prisma.aiLog.findMany({
        where,
        select: {
            endpoint: true, error: true, cached: true, latencyMs: true,
            tokensIn: true, tokensOut: true, rating: true, groundingOk: true,
        },
    });

    const endpoint_kesimida: Record<string, number> = {};
    let xatolar = 0, keshdan = 0, msSum = 0, msCount = 0;
    let tokensIn = 0, tokensOut = 0, yoqdi = 0, yoqmadi = 0, groundingFail = 0;

    for (const r of rows) {
        endpoint_kesimida[r.endpoint] = (endpoint_kesimida[r.endpoint] || 0) + 1;
        if (r.error) xatolar++;
        if (r.cached) keshdan++;
        if (typeof r.latencyMs === 'number') { msSum += r.latencyMs; msCount++; }
        tokensIn += r.tokensIn || 0;
        tokensOut += r.tokensOut || 0;
        if (r.rating === 1) yoqdi++;
        if (r.rating === -1) yoqmadi++;
        if (r.groundingOk === false) groundingFail++;
    }

    return {
        davr_kun: days,
        jami_sorov: rows.length,
        xatolar,
        keshdan,
        ortacha_ms: msCount ? Math.round(msSum / msCount) : 0,
        tokensIn,
        tokensOut,
        endpoint_kesimida,
        baho: { yoqdi, yoqmadi },
        grounding_yiqildi: groundingFail,
    };
};

/**
 * 👎 olgan so'rovlar — etalon to'plamni to'ldirish uchun asosiy manba.
 * Faqat SUPER_ADMIN uchun: bu yerda barcha klinikalarning savollari ko'rinadi.
 */
export const negativeFeedback = async (limit = 50) => {
    const rows = await prisma.aiLog.findMany({
        where: { rating: -1 },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        select: {
            id: true, endpoint: true, role: true, question: true, reply: true,
            ratingNote: true, toolCalls: true, createdAt: true,
        },
    });
    return rows;
};
