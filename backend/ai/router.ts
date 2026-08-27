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
 * Qaysi ANIQ harakat so'ralayotganini aniqlaydi.
 *
 * Nega kerak: harakat tool'lari ikkala raundda ham yuboriladi, ya'ni
 * ularning hajmi ikki barobar hisoblanadi. Beshtasini berish o'rniga
 * bittasini berish buyruq narxini sezilarli tushiradi. Groq bepul
 * tierida chegara daqiqasiga 8000 token (o'lchangan), bitta buyruq esa
 * ~3800 token yeydi — ya'ni har bir yuz token sanaladi.
 *
 * Aniqlab bo'lmasa — hammasi beriladi. Noto'g'ri cheklash foydalanuvchi
 * so'ragan ishni bajarib bo'lmasligiga olib keladi, bu esa token
 * tejashdan ancha qimmatga tushadi.
 */
// Tartib MUHIM va u ATAYLAB shunday: birinchi mos kelgani yutadi.
//
// Eng aniq signal — HARAKAT nomi ("eslatma", "xarajat"), eng chalg'ituvchisi
// esa OBYEKT nomi. "Qarzdorlarga eslatma yubor" da "qarz" so'zi bor, lekin
// bu qarz yozish emas — eslatma yuborish. Shuning uchun `send_reminder`
// `add_charge` dan oldin turadi: aks holda obyekt fe'ldan ustun kelardi.
const ACTION_ROUTES: { name: string | string[]; re: RegExp }[] = [
    // Shifokorga tegishlilar eng oldinda: "shifokor" so'zi bo'lsa, gap
    // deyarli har doim u haqida, hatto "qarz" yoki "to'lov" so'zi bilan
    // birga kelsa ham.
    { name: 'update_doctor_pay', re: /(foiz|protsent|stavka|ish haqi|oyligini.*(qil|o'?zgart)|процент|ставк)/i },
    // `oyli[gk]` — o'zbek tilida k undoshi qo'shimcha oldida g ga aylanadi:
    // oylik -> oyligi -> oyligini. "oylik" deb yozsak, aynan tabiiy
    // shakllar mos kelmasdi.
    { name: 'pay_doctor', re: /(shifokorga|doktorga|vrachga|oyli[gk]|maosh|ulush|врачу|доктору|зарплат)/i },
    // Xabar: bitta bemorga ham, guruhga ham bo'lishi mumkin. Ikkalasini
    // beramiz — model gapda aniq ism bor-yo'qligiga qarab o'zi tanlaydi.
    { name: ['send_message', 'send_reminder'], re: /(eslat|xabar|sms|telegram|напом|сообщ|уведом)/i },
    { name: 'create_expense', re: /(xarajat|ijara|kommunal|elektr|arenda|расход|аренда)/i },
    // To'lov va qarz bir-biriga yaqin — ikkalasini birga beramiz, model
    // "to'ladi" bilan "qarzi bor" ni o'zi ajratadi.
    // Kassa harakati XARAJATDAN KEYIN turadi va bu ataylab: "kassadan
    // ijara to'ladik" — bu xarajat, kassa harakati emas. Xarajat so'zlari
    // aniqroq signal, shuning uchun ular birinchi tekshiriladi.
    //
    // To'lovdan esa OLDIN turadi: "bemorga 300 ming qaytardik" da "qaytar"
    // bor, lekin bu to'lov qabul qilish emas — kassadan pul chiqishi.
    { name: 'add_cash', re: /(kassaga|kassadan|kassa\s*(ga|dan)|inkassa|pul qaytar|qaytarib berdik|касс|инкассац|вернул|возврат|сдач)/i },
    // Protsedura: faqat ANIQ klinik so'zlar. "qo'ydik" kabi umumiy fe'l
    // ataylab yo'q — "qarz yozib qo'ydik" ham unga mos kelardi va pul
    // buyrug'i protsedura deb talqin qilinardi.
    { name: 'add_procedure', re: /(plomba|plomb|koronka|kanal davola|tozalash|protsedura|implant|ekstraksiya|davolad|пломб|коронк|канал|чистк|процедур|имплант|удалил|удален|лечил|лечен)/i },
    { name: ['record_payment', 'add_charge'], re: /(to'?la|qarz|hisob|тўла|оплат|долг|счёт|счет)/i },
    { name: 'book_appointment', re: /(qabul|band|navbat|приём|прием|запис)/i },
    { name: 'update_lead_status', re: /(lid|lead|holatini|status|лид|статус)/i },
];

/** Rol va savolga mos harakat tool'lari (OpenAI formatida). */
export const actionsForQuestion = (
    role: string,
    question: string,
    all: (role: string) => any[]
): any[] => {
    const q = String(question || '');
    const allowed = all(role);
    if (!allowed.length) return [];

    for (const r of ACTION_ROUTES) {
        if (!r.re.test(q)) continue;
        const names = Array.isArray(r.name) ? r.name : [r.name];
        const picked = allowed.filter((t: any) => names.includes(t.function.name));
        if (picked.length) return picked;
    }
    return allowed;
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
