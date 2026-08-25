// ─── Savol yo'naltirgichi va kesh ─────────────────────────────────────────────
//
// Muammo: har bir /ai/ask so'roviga BARCHA tool ta'riflari yuborilardi
// (~1200 token), tsikl esa kamida ikki raund. Bitta savol ~4000 token yeydi.
// Groq bepul tierida daqiqasiga 8000 token — ya'ni atigi 2 ta savol.
//
// Uch qatlamli yechim, har biri o'zidan keyingisini arzonlashtiradi:
//
//   1. TEZ YO'L    — shabloniy savol umuman modelsiz javob oladi.
//   2. YO'NALTIRISH — savol turiga qarab faqat kerakli 2-3 tool yuboriladi.
//   3. KESH        — bir xil tool + argument 60 soniya ichida qayta
//                    chaqirilmaydi (bir nechta xodim bir xil savol beradi).
//
// Yo'naltirish ATAYLAB kalit so'zga asoslangan, model chaqiruviga emas.
// Model bilan tasniflash mantiqan chiroyli ko'rinadi, lekin amalda: kalit
// so'z topilmagan savol — bu deyarli har doim KENG savol, va keng savolga
// baribir barcha tool'lar kerak. Ya'ni model chaqiruvi aynan o'zi foyda
// bermaydigan holatda qo'shimcha kechikish qo'shardi. Shuning uchun
// noaniqlikda "hamma tool" — bu xavfsiz va tekin standart.

import { TOOL_DEFS, toolsForRole } from './tools';

// ─── 2-qatlam: yo'naltirish ──────────────────────────────────────────────────

export type Intent =
    | 'qabul' | 'moliya' | 'qarz' | 'shifokor' | 'bemor' | 'ombor' | 'lid'
    | 'keng' | 'tizim';

/** Har bir yo'nalish uchun kerakli tool'lar. */
const INTENT_TOOLS: Record<Intent, string[]> = {
    qabul: ['get_appointments', 'find_patient'],
    moliya: ['get_revenue', 'get_appointments'],
    qarz: ['get_debtors', 'find_patient'],
    shifokor: ['get_doctor_stats', 'get_appointments'],
    bemor: ['find_patient', 'get_appointments'],
    ombor: ['get_low_stock'],
    lid: ['get_leads'],
    // Keng savolda model o'zi bir nechta manbadan yig'ishi kerak — cheklamaymiz.
    keng: TOOL_DEFS.map(t => t.name),
    // Tizimdan foydalanish haqidagi savolga ma'lumot kerak emas.
    tizim: [],
};

/**
 * Kalit so'zlar. Tartib MUHIM — birinchi mos kelgani yutadi, shuning uchun
 * keng savol namunalari eng oldinda turadi: "umumiy ahvol qanday, qarz ham
 * bormi?" savoli 'qarz' emas, 'keng' bo'lishi kerak.
 */
const RULES: { intent: Intent; re: RegExp }[] = [
    {
        intent: 'keng',
        re: /(umumiy|umuman|ahvol|holat qanday|ishlar qanday|muammo qayer|nimaga e'?tibor|qayerda yo'?qot|nima yaxshi|nima yomon|tahlil qil|xulosa ber|hisobot ber|как дела|общая картина|где проблем|проанализируй)/i,
    },
    {
        intent: 'tizim',
        re: /(qanday qo'?sh|qayerdan topa|qanday yoza|qanday o'?chir|qanday sozla|tugma qayer|bo'?limi qayer|как добавить|где найти|как настроить)/i,
    },
    { intent: 'qarz', re: /(qarz|qarzdor|to'?lamagan|balans manfiy|долг|должник|задолжен)/i },
    { intent: 'ombor', re: /(ombor|material|zaxira|tugay|qoldiq|склад|материал|заканчива)/i },
    { intent: 'lid', re: /(lid|lead|potensial bemor|manba|konversiya|instagram|marketing|реклам|лид|источник)/i },
    { intent: 'shifokor', re: /(shifokor|doktor|vrach|kim ko'?p ishla|solishtir|samaradorlik|врач|доктор|эффективност)/i },
    { intent: 'moliya', re: /(daromad|tushum|pul|kassa|moliya|xarajat|foyda|sof|aylanma|o'?rtacha chek|выручка|доход|расход|прибыл|касс)/i },
    { intent: 'qabul', re: /(qabul|yozilgan|band|jadval|kelmagan|no-?show|bekor|bugun nechta|ertaga|приём|прием|запис|расписан|неявк)/i },
    { intent: 'bemor', re: /(bemor|mijoz|pasient|telefon raqam|kim keldi|пациент|клиент)/i },
];

/**
 * Savol BUYRUQmi (ya'ni yozuvchi tool kerakmi)?
 *
 * Nega kerak: harakat tool'larining ta'rifi ~590 token. Ularni har bir
 * so'rovga qo'shish yo'naltirishdan olingan butun tejashni yeb qo'yardi —
 * o'lchov aniq ko'rsatdi: tor savolda 1217 -> 1475 token, ya'ni "tezlashtirish"
 * aslida sekinlashtirish edi. Groq bepul tierida daqiqasiga 8000 token
 * bo'lgani uchun bu nazariy emas, amaliy chegara.
 *
 * Chegara ATAYLAB kengroq qo'yilgan: noto'g'ri qo'shib yuborish faqat token
 * yeydi, noto'g'ri tushirib qoldirish esa foydalanuvchi so'ragan ishni
 * bajarib bo'lmasligiga olib keladi. Ikkinchisi ancha yomon.
 */
const ACTION_PATTERNS: RegExp[] = [
    // O'zbek tilida buyruq juda ko'p shaklda keladi va ularni sanab chiqish
    // mumkin emas: "yoz", "yozing", "yozib qo'y", "yozib qo'ying", "yozvor",
    // "yozib yubor". Shuning uchun O'ZAK bo'yicha qidiramiz va qo'shimchalarni
    // erkin qoldiramiz.
    //
    // Muammo shundaki, o'zak savol shaklida ham uchraydi: "kim YOZILGAN edi?",
    // "xabar YUBORILGANmi?". Bular buyruq emas. Ularni ajratish uchun majhul
    // nisbat qo'shimchasi `-il-` va harakat nomi `-uv` inkor qilinadi. Bu
    // grammatik belgi, so'zlar ro'yxati emas — shuning uchun yangi shakllar
    // ham avtomatik to'g'ri ishlaydi.
    //
    // Naqshlar ATAYLAB regex literali sifatida yozilgan, satr sifatida emas:
    // satrda har bir `\b` ni ikki marta ekranlash kerak bo'lardi va bitta
    // unutilgan teskari chiziq regexni jimgina boshqaruv belgisiga
    // aylantirib yuborardi.
    /\b(yubor|jo'nat|jonat)(?!il)\w*/i,
    /\byoz(?!il|uv|gi)\w*/i,
    /\b(qo'sh|qosh)(?!il)\w*/i,
    /\bkirit(?!il)\w*/i,
    /\b(o'zgartir|ozgartir|almashtir)(?!il)\w*/i,
    /\bbelgila(?!n)\w*/i,
    /\b(band qil|bekor qil)\w*/i,
    // Ot shaklidagi buyruqlar: "eslatma yuborish", "eslatib qo'y".
    /\beslat\w*/i,
    // Ruscha. `\b` va `\w` ATAYLAB ishlatilmagan: JavaScript'da ular faqat
    // ASCII harflarni so'z belgisi deb biladi, ya'ni kirill so'z oldida
    // chegara umuman hosil bo'lmaydi va "Отправь" hech qachon mos kelmasdi.
    /отправ|напомн|запиш|добав|измен|назнач|перенес/i,
];

export const isActionIntent = (question: string): boolean => {
    const q = String(question || '');
    return ACTION_PATTERNS.some(re => re.test(q));
};

export interface RouteResult {
    intent: Intent;
    /** Modelga beriladigan tool nomlari. */
    tools: string[];
    /** Kalit so'z topilmadi — barcha tool'lar berildi. */
    fallback: boolean;
}

/**
 * Savolni yo'naltiradi. Suhbat davomiy bo'lsa (oldingi savollar bor),
 * kontekst yo'qolmasligi uchun cheklov yumshatiladi.
 */
export const route = (question: string, isFollowUp = false): RouteResult => {
    const q = String(question || '');

    for (const r of RULES) {
        if (r.re.test(q)) {
            const tools = INTENT_TOOLS[r.intent];
            // Davomiy savolda ("va o'tgan oychi?") oldingi mavzu ham kerak
            // bo'lishi mumkin — tor cheklov javobni buzardi.
            if (isFollowUp && r.intent !== 'keng' && r.intent !== 'tizim') {
                return { intent: r.intent, tools: TOOL_DEFS.map(t => t.name), fallback: false };
            }
            return { intent: r.intent, tools, fallback: false };
        }
    }

    return { intent: 'keng', tools: TOOL_DEFS.map(t => t.name), fallback: true };
};

/**
 * Rol va yo'nalish kesishmasi. Rol filtri BIRINCHI o'ringa qo'yilgan —
 * yo'naltirish faqat ro'yxatni qisqartiradi, hech qachon kengaytirmaydi.
 */
export const toolsForRequest = (role: string, question: string, isFollowUp = false) => {
    const r = route(question, isFollowUp);
    const allowed = toolsForRole(role);
    if (r.intent === 'tizim') return { tools: [], route: r };

    const picked = allowed.filter((t: any) => r.tools.includes(t.function.name));
    // Yo'nalish tool'lari rolga ruxsat etilmagan bo'lsa, bo'sh ro'yxat qolardi
    // va model umuman ma'lumot ololmasdi. Bunday holatda rolga ruxsat etilgan
    // hamma narsani beramiz.
    return { tools: picked.length ? picked : allowed, route: r };
};

// ─── 3-qatlam: tool natijalari keshi ─────────────────────────────────────────
//
// Bir xil savolni ikki xodim ketma-ket bersa yoki model bitta tool'ni
// takroran chaqirsa — bazaga qayta bormaymiz. TTL qisqa: ma'lumot tez
// o'zgaradi va eskirgan raqam ko'rsatish — jimgina xato.

const CACHE_TTL_MS = Number(process.env.AI_TOOL_CACHE_MS || 60_000);
const CACHE_MAX = 500;

interface CacheEntry { value: any; expiresAt: number; }
const toolCache = new Map<string, CacheEntry>();

const cacheKey = (clinicId: string, role: string, name: string, args: any): string =>
    `${clinicId}|${role}|${name}|${JSON.stringify(args || {})}`;

/** Klinika ma'lumoti o'zgarganda keshni bo'shatadi (yozuvchi tool'lardan keyin). */
export const invalidateToolCache = (clinicId: string): void => {
    for (const k of Array.from(toolCache.keys())) {
        if (k.startsWith(`${clinicId}|`)) toolCache.delete(k);
    }
};

/**
 * Tool'ni kesh orqali bajaradi.
 *
 * @param runner keshda bo'lmasa chaqiriladigan haqiqiy bajaruvchi
 */
export const cachedTool = async (
    clinicId: string,
    role: string,
    name: string,
    args: any,
    runner: () => Promise<any>
): Promise<{ value: any; cached: boolean }> => {
    const key = cacheKey(clinicId, role, name, args);
    const hit = toolCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return { value: hit.value, cached: true };

    const value = await runner();

    // Xato natijani keshlamaymiz — vaqtinchalik nosozlik bir daqiqaga
    // muzlab qolardi.
    if (!value?.xato) {
        if (toolCache.size >= CACHE_MAX) {
            const oldest = toolCache.keys().next().value;
            if (oldest) toolCache.delete(oldest);
        }
        toolCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return { value, cached: false };
};

// Muddati o'tganlarni vaqti-vaqti bilan tozalaymiz.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of Array.from(toolCache.entries())) {
        if (now > v.expiresAt) toolCache.delete(k);
    }
}, 5 * 60 * 1000).unref?.();

// ─── 1-qatlam: tez yo'l ──────────────────────────────────────────────────────
//
// Eng ko'p beriladigan bir nechta savol modelni umuman talab qilmaydi.
// Ular uchun javobni o'zimiz yozamiz: bitta DB so'rovi, ~200ms, nol token
// va nol gallyutsinatsiya ehtimoli.
//
// Ro'yxat ATAYLAB juda tor. Shubha bo'lsa — modelga topshiramiz. Bu yerdagi
// har bir yozuv aniq bitta savol shakliga javob beradi, "o'xshash" savolga
// emas: noto'g'ri tez javob sekin javobdan yomonroq.

export interface FastAnswer {
    reply: string;
    sources: string[];
    toolResults: any[];
}

type FastRule = {
    re: RegExp;
    tool: string;
    args: (today: string) => any;
    render: (data: any, lang: 'uz' | 'ru') => string | null;
};

const FAST_RULES: FastRule[] = [
    {
        // "Bugun nechta qabul bor?" — eng ko'p beriladigan savol.
        re: /^\s*(bugun|сегодня)\s+(nechta|qancha|сколько)\s+(qabul|bemor|приём|прием|пациент)\w*\s*(bor|bormi|keladi|есть)?\s*\??\s*$/i,
        tool: 'get_appointments',
        args: today => ({ dateFrom: today, dateTo: today }),
        render: (d, lang) => {
            if (typeof d?.jami !== 'number') return null;
            const st = d.status_kesimida || {};
            const kelmagan = st['No-Show'] || 0;
            if (lang === 'ru') {
                return `Сегодня записано ${d.jami} приёмов.`
                    + (kelmagan ? ` Из них ${kelmagan} — неявка.` : '')
                    + `\nИсточник: расписание на сегодня.`;
            }
            return `Bugun ${d.jami} ta qabul yozilgan.`
                + (kelmagan ? ` Shundan ${kelmagan} tasi kelmagan.` : '')
                + `\nManba: bugungi jadval.`;
        },
    },
    {
        // "Nima tugayapti?" / "Ombor holati"
        re: /^\s*(nima\s+tugay\w*|ombor\s+holati|tugayotgan\s+material\w*|что\s+заканчива\w*|склад)\s*\??\s*$/i,
        tool: 'get_low_stock',
        args: () => ({}),
        render: (d, lang) => {
            if (typeof d?.tugayotgan !== 'number') return null;
            if (d.tugayotgan === 0) {
                return lang === 'ru'
                    ? 'Все материалы в достатке — ничего не заканчивается.\nИсточник: склад.'
                    : 'Hamma material yetarli — tugayotgani yo\'q.\nManba: ombor.';
            }
            const top = (d.materiallar || []).slice(0, 5)
                .map((m: any) => `${m.nom} (${m.qoldiq} ${m.olchov})`).join(', ');
            return lang === 'ru'
                ? `Заканчивается ${d.tugayotgan} позиций: ${top}.\nИсточник: склад.`
                : `${d.tugayotgan} ta material tugayapti: ${top}.\nManba: ombor.`;
        },
    },
];

/**
 * Savol tez yo'lga tushadimi? Tushsa — modelsiz javob qaytaradi.
 * Tushmasa `null`, ya'ni oddiy tool-calling tsikliga o'tiladi.
 */
export const tryFastPath = async (
    question: string,
    today: string,
    lang: 'uz' | 'ru',
    run: (name: string, args: any) => Promise<any>
): Promise<FastAnswer | null> => {
    const q = String(question || '').trim();
    for (const rule of FAST_RULES) {
        if (!rule.re.test(q)) continue;
        try {
            const data = await run(rule.tool, rule.args(today));
            if (data?.xato) return null;
            const reply = rule.render(data, lang);
            if (!reply) return null;
            return { reply, sources: [rule.tool], toolResults: [data] };
        } catch {
            return null;   // Tez yo'l yiqilsa — jimgina oddiy yo'lga o'tamiz.
        }
    }
    return null;
};
