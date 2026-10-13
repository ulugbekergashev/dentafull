// Yordam boti uchun matn yordamchilari: til va yozuvni aniqlash, qidiruv uchun
// bir xil ko'rinishga keltirish, Telegram chegarasiga bo'lish.

import type { SupportLang } from './productMap';

export type UzScript = 'latin' | 'cyrillic';

export const esc = (s: any): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Raqamning oxirgi 9 xonasi — "+998 90 123-45-67" va "901234567" bir xil */
export const phoneKey = (p?: string | null): string => String(p || '').replace(/\D/g, '').slice(-9);

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
export const todayTashkent = (offsetDays = 0): string =>
    new Date(Date.now() + TASHKENT_OFFSET_MS + offsetDays * 86400000).toISOString().slice(0, 10);
export const tashkentHour = (): number => new Date(Date.now() + TASHKENT_OFFSET_MS).getUTCHours();

/** "2026-10-12" -> "12.10.2026" */
export const ddmmyyyy = (iso?: string | null): string =>
    iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : String(iso || '');

/** Murojaat raqami: odam o'qiy oladigan qisqa kod */
export const ticketCode = (id: string): string => '#' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();

// Faqat o'zbek kirilida uchraydigan harflar
const UZ_CYR_LETTERS = /[ўқғҳЎҚҒҲ]/;
// Maxsus harfsiz ham o'zbekcha ekanini bildiradigan tez-tez uchraydigan so'zlar.
// Ko'p odam telefonda "ў" o'rniga "у", "қ" o'rniga "к" yozadi.
const UZ_CYR_WORDS = new Set([
    'салом', 'ассалому', 'алейкум', 'рахмат', 'илтимос', 'керак', 'эмас', 'учун', 'билан', 'нима', 'нега',
    'кандай', 'канака', 'каерда', 'каердан', 'булди', 'булмаяпти', 'йук', 'бор', 'ишламаяпти', 'ишламайди',
    'кетмаяпти', 'кирмаяпти', 'чикмаяпти', 'очилмаяпти', 'килиш', 'киламан', 'килай', 'бемор', 'беморни',
    'кабул', 'кабулга', 'тулов', 'туловни', 'ёрдам', 'менга', 'бизда', 'сизда', 'хабар', 'кушиш', 'кушаман',
    'узгартириш', 'учириш', 'парол', 'паролни', 'унутдим', 'шифокор', 'клиника', 'нарх', 'канча', 'буладими',
    'мумкинми', 'айтинг', 'курсатинг', 'тушунмадим', 'ишлаяпти', 'келмаяпти', 'бормаяпти', 'юборилмаяпти',
]);

/**
 * Xabar tili va (o'zbekcha bo'lsa) yozuvi.
 *
 * ai/prompts.ts dagi replyLang kirillni har doim ruscha deb oladi — ilova
 * ichida bu to'g'ri (u yerda o'zbekcha faqat lotinda). Telegramda esa ko'p
 * mijoz o'zbekchani kirillda yozadi; ularga ruscha javob berish — xato.
 * Juda qisqa yoki noaniq matnda oldingi qiymat saqlanadi.
 */
export const detectLang = (
    text: string,
    prev: { lang: SupportLang; script: UzScript } = { lang: 'uz', script: 'latin' }
): { lang: SupportLang; script: UzScript } => {
    const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
    const lat = (text.match(/[A-Za-z]/g) || []).length;
    if (cyr + lat < 4) return prev;
    if (lat > cyr * 2) return { lang: 'uz', script: 'latin' };
    if (cyr <= lat * 2) return prev;

    if (UZ_CYR_LETTERS.test(text)) return { lang: 'uz', script: 'cyrillic' };
    const words = text.toLowerCase().split(/[^Ѐ-ӿ]+/).filter(Boolean);
    const uzHits = words.filter(w => UZ_CYR_WORDS.has(w)).length;
    // Bitta "салом" ruscha gapda ham uchraydi — qisqa xabarda bitta, uzunida ikkita so'z kerak
    if (uzHits >= (words.length <= 4 ? 1 : 2)) return { lang: 'uz', script: 'cyrillic' };
    return { lang: 'ru', script: 'latin' };
};

const CYR_TO_LAT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
    м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh',
    щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/**
 * Qidiruv uchun bir xil ko'rinish: "Тўлов", "to'lov", "tolov", "TO`LOV" — hammasi "tolov".
 * Faqat solishtirish uchun, foydalanuvchiga ko'rsatilmaydi.
 */
export const normalizeForSearch = (s: string): string =>
    String(s || '')
        .toLowerCase()
        .replace(/[Ѐ-ӿ]/g, ch => CYR_TO_LAT[ch] ?? ch)
        .replace(/[`'ʻʼ‘’]/g, '')
        .replace(/q/g, 'k')
        .replace(/x/g, 'h')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

// Har savolda uchraydigan so'zlar (normalizeForSearch ko'rinishida) — ular mavzuni
// bildirmaydi: "ob-havo QANDAY" savoli "to'lovni QANDAY qabul qilaman" maqolasiga mos kelmasin.
const STOP_WORDS = new Set([
    'kanday', 'kanaka', 'kanakasiga', 'nima', 'nimaga', 'nega', 'kachon', 'kayerda', 'kayerdan', 'kaysi', 'kancha',
    'kilaman', 'kilamiz', 'kilish', 'kiladi', 'kilsam', 'kilay', 'kerak', 'uchun', 'bilan', 'mumkin', 'mumkinmi',
    'boladi', 'boladimi', 'bolsa', 'emas', 'yoki', 'ham', 'bor', 'yok', 'shu', 'bu', 'men', 'menga', 'bizda', 'siz',
    'iltimos', 'salom', 'rahmat', 'aytib', 'ayting', 'bering', 'yordam',
    'kak', 'chto', 'gde', 'pochemu', 'kogda', 'kakoy', 'nujno', 'mojno', 'dlya', 'eto', 'ili', 'net', 'est',
    'pojaluysta', 'zdravstvuyte', 'spasibo', 'pomogite', 'podskajite',
]);

export const searchTokens = (s: string): string[] =>
    normalizeForSearch(s).split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w));

/** Telegram xabari 4096 belgidan oshmaydi — abzas va qator chegarasidan bo'ladi */
export const chunkText = (text: string, limit = 3900): string[] => {
    if (text.length <= limit) return [text];
    const parts: string[] = [];
    let rest = text;
    while (rest.length > limit) {
        let at = rest.lastIndexOf('\n\n', limit);
        if (at < limit / 2) at = rest.lastIndexOf('\n', limit);
        if (at < limit / 2) at = rest.lastIndexOf(' ', limit);
        if (at <= 0) at = limit;
        parts.push(rest.slice(0, at).trimEnd());
        rest = rest.slice(at).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
};

export const cut = (s: any, n: number): string => {
    const str = String(s ?? '');
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
};

export const safeJson = <T = any>(raw: any, fallback: T): T => {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
        return JSON.parse(String(raw));
    } catch {
        return fallback;
    }
};
