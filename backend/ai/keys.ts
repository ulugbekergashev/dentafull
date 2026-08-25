// ─── Klinikaning o'z AI kaliti ────────────────────────────────────────────────
//
// Muammo: API kaliti serverning bitta `.env` qiymati edi, ya'ni BARCHA
// klinikalarga umumiy. Limitlar esa kalitga biriktirilgan, klinikaga emas —
// Groq bepul tierida daqiqasiga 8000 token. Natijada bitta faol klinika
// ertalab hisobotlarni ko'p so'rasa, qolganlari "xizmat band" xabarini
// olardi. Klinikalar soni ortgan sari bu yomonlashaveradi.
//
// Yechim: har bir klinika o'z kalitini Sozlamalarda kiritadi — xuddi
// Telegram bot tokeni va Eskiz SMS kalitini kiritganday. Shunda har
// klinikada o'z chelagi bo'ladi va sig'im klinikalar soniga qarab chiziqli
// o'sadi.
//
// Klinika kaliti bo'lmasa — platforma kaliti zaxira sifatida ishlaydi,
// ya'ni hech narsa buzilmaydi va mavjud klinikalar hech qanday
// o'zgarishni sezmaydi.

const { prisma } = require('../db');

export interface ClinicKey {
    /** 'gemini' | 'groq' | 'openrouter' */
    provider: string;
    apiKey: string;
}

/**
 * Kesh. Kalit deyarli hech qachon o'zgarmaydi, lekin u HAR BIR AI
 * so'rovidan oldin kerak bo'ladi — keshsiz bu qo'shimcha DB borishi
 * bo'lardi va u javob vaqtiga to'g'ridan-to'g'ri qo'shilardi.
 */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: ClinicKey | null; expiresAt: number }>();

/** Sozlamalarda kalit o'zgarganda chaqiriladi. */
export const invalidateClinicKey = (clinicId: string): void => {
    cache.delete(clinicId);
};

/** Qo'llab-quvvatlanadigan provayderlar — Sozlamalardagi ro'yxat shundan. */
export const SUPPORTED_PROVIDERS = ['gemini', 'groq', 'openrouter'] as const;

export const isSupportedProvider = (name: any): boolean =>
    typeof name === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(name);

/**
 * Klinikaning kalitini qaytaradi (keshdan yoki bazadan).
 * Xatolik yuz bersa `null` — AI platforma kaliti bilan ishlashda davom etadi.
 */
export const getClinicKey = async (clinicId: string | null | undefined): Promise<ClinicKey | null> => {
    if (!clinicId) return null;

    const hit = cache.get(clinicId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    try {
        const row = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { aiProvider: true, aiApiKey: true },
        });

        const value: ClinicKey | null =
            row?.aiApiKey && isSupportedProvider(row.aiProvider)
                ? { provider: row.aiProvider, apiKey: row.aiApiKey }
                : null;

        cache.set(clinicId, { value, expiresAt: Date.now() + TTL_MS });
        return value;
    } catch (e: any) {
        console.warn('[AI:keys] kalit o\'qilmadi:', e?.message);
        return null;
    }
};

/**
 * Kalitni haqiqiy so'rov bilan tekshiradi.
 *
 * Saqlashdan OLDIN chaqiriladi: noto'g'ri kalit saqlanib qolsa, klinika
 * buni faqat birinchi savolida — ya'ni eng noqulay paytda — bilardi.
 * Eskiz SMS sozlamalari ham aynan shunday ishlaydi (server.ts).
 */
export const verifyClinicKey = async (
    provider: string,
    apiKey: string,
    model?: string
): Promise<{ ok: boolean; error?: string }> => {
    const endpoints: Record<string, string> = {
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    };
    const defaults: Record<string, string> = {
        gemini: process.env.GEMINI_MODEL_CHEAP || 'gemini-2.5-flash-lite',
        groq: process.env.GROQ_MODEL_CHEAP || 'openai/gpt-oss-20b',
        openrouter: process.env.OPENROUTER_MODEL_CHEAP || 'meta-llama/llama-3.1-8b-instruct:free',
    };

    const url = endpoints[provider];
    if (!url) return { ok: false, error: 'Noma\'lum provayder.' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model || defaults[provider],
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 5,
            }),
            signal: controller.signal,
        });

        if (res.ok) return { ok: true };

        // 429 — kalit TO'G'RI, shunchaki hozir band. Uni "noto'g'ri kalit"
        // deb rad etish xato bo'lardi: klinika to'g'ri kalitni kiritolmay
        // qolardi.
        if (res.status === 429) return { ok: true };

        const body = await res.text().catch(() => '');

        // Har bir provayder noto'g'ri kalit haqida boshqacha xabar beradi:
        // Groq 401 qaytaradi, Gemini esa 400 va matn ichida "valid API key"
        // deydi. Statusga tayanib qolsak, Gemini foydalanuvchisi xom JSON
        // ko'rardi va nima qilishni bilmasdi.
        const looksLikeBadKey = /api[_ -]?key|API_KEY_INVALID|unauthorized|invalid.*credential/i.test(body);
        if (res.status === 401 || res.status === 403 || looksLikeBadKey) {
            return { ok: false, error: 'Kalit noto\'g\'ri yoki bekor qilingan. Nusxalashda xato bo\'lmadimi?' };
        }

        // Model nomi eskirgan bo'lishi mumkin — bu kalitning aybi emas,
        // shuning uchun sabab alohida aytiladi.
        if (/model.*(not found|does not exist)/i.test(body)) {
            return { ok: false, error: 'Provayderda bu model mavjud emas. Administratorga xabar bering.' };
        }

        return { ok: false, error: `Provayder xatosi (${res.status}): ${body.slice(0, 160)}` };
    } catch (e: any) {
        if (e?.name === 'AbortError') return { ok: false, error: 'Provayder javob bermadi (15s).' };
        return { ok: false, error: e?.message || 'Tarmoq xatosi.' };
    } finally {
        clearTimeout(timer);
    }
};
