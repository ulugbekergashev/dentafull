// ─── Xatolarga chidamli ism qidiruvi ──────────────────────────────────────────
//
// Aniq moslik yetarli emas va bu nazariy mulohaza emas — amalda shunday
// bo'ldi: foydalanuvchi "Осворов Самандар" deb yozdi, bazada "Asrorov
// Samandar" turibdi, javob esa "topilmadi" bo'ldi.
//
// Xato manbalari ko'p va ularning barchasi normal:
//   • qo'lda yozishda harf tushib qoladi yoki almashadi;
//   • ovoz tanish yaqin eshitilgan harfni beradi (Asrorov -> Osvorov);
//   • ismning o'zi turlicha yoziladi (Muhammad / Muxammad / Mukhammad);
//   • kirill va lotin aralashadi (ai/translit.ts buni alohida hal qiladi).
//
// Shifokor va administrator kuniga o'nlab ism yozadi. Ularning har bir
// harfni to'g'ri yozishini talab qilish — yordamchining vazifasini
// foydalanuvchiga yuklash demakdir.
//
// Shuning uchun aniq qidiruv natija bermasa, tahrirlash masofasi bo'yicha
// eng yaqin ismlar topiladi. Bu FAQAT ZAXIRA yo'l: aniq moslik bo'lsa,
// u har doim ustun turadi.

import { searchVariants } from './translit';

/**
 * Ikki so'z orasidagi tahrirlash masofasi (Levenshtein).
 *
 * `max` berilsa — undan oshgani aniqlangach hisob to'xtaydi. Bu muhim:
 * funksiya har bir bemor uchun chaqiriladi va aksariyat taqqoslashlar
 * birinchi qatorlardayoq chegaradan oshadi.
 */
export const editDistance = (a: string, b: string, max = Infinity): number => {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > max) return max + 1;
        const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[b.length];
};

/**
 * So'z uzunligiga qarab nechta xatoga yo'l qo'yiladi.
 *
 * Qisqa so'zda bitta xato ma'noni butunlay o'zgartiradi ("Ali" -> "Ali"
 * va "Oli" turli odamlar), uzun familiyada esa ikkita xato ham odatiy.
 * Shuning uchun chegara qat'iy emas, uzunlikka bog'liq.
 */
const allowedErrors = (len: number): number => {
    if (len <= 3) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    return 3;
};

/** Taqqoslash uchun so'zni soddalashtiradi. */
const normalize = (s: string): string =>
    String(s || '')
        .toLowerCase()
        .replace(/['`ʻʼ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export interface FuzzyCandidate {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
}

export interface FuzzyHit<T> {
    item: T;
    /** Umumiy masofa — kichik bo'lsa yaqinroq. */
    distance: number;
}

/**
 * Nomzodlar ichidan so'rovga eng yaqinlarini topadi.
 *
 * So'rovning HAR BIR so'zi nomzod ismining biror qismiga yaqin bo'lishi
 * kerak. "Samandar Osvorov" va "Osvorov Samandar" bir xil natija beradi —
 * odamlar ism va familiyani ikkala tartibda ham yozadi.
 */
export const fuzzyFind = <T extends FuzzyCandidate>(
    query: string,
    items: T[],
    limit = 5
): FuzzyHit<T>[] => {
    const queryTokens = normalize(query).split(' ').filter(t => t.length >= 2);
    if (!queryTokens.length) return [];

    // Har bir so'z uchun alifbo shakllari ham hisobga olinadi.
    const tokenVariants = queryTokens.map(t =>
        Array.from(new Set(searchVariants(t).map(normalize))).filter(Boolean)
    );

    const hits: FuzzyHit<T>[] = [];

    for (const item of items) {
        const nameTokens = normalize(`${item.firstName || ''} ${item.lastName || ''}`)
            .split(' ')
            .filter(Boolean);
        if (!nameTokens.length) continue;

        let total = 0;
        let ok = true;

        for (const variants of tokenVariants) {
            let best = Infinity;

            for (const v of variants) {
                const max = allowedErrors(v.length);
                for (const n of nameTokens) {
                    // Boshlanishi mos kelsa — bu aniq moslik, masofasi nol.
                    if (n.startsWith(v) || v.startsWith(n)) { best = 0; break; }
                    const d = editDistance(v, n, max);
                    if (d <= max && d < best) best = d;
                }
                if (best === 0) break;
            }

            if (best === Infinity) { ok = false; break; }
            total += best;
        }

        if (ok) hits.push({ item, distance: total });
    }

    return hits.sort((a, b) => a.distance - b.distance).slice(0, limit);
};

/**
 * Natija ishonchli yakkami?
 *
 * Bitta nomzod qolgan yoki eng yaqini boshqalardan sezilarli yaxshi
 * bo'lsa — uni tanlash mumkin. Aks holda foydalanuvchidan so'rash kerak:
 * noto'g'ri bemorga qarz yozib qo'yish jimgina yuz beradigan va keyin
 * topish qiyin bo'lgan xato.
 */
export const confidentPick = <T>(hits: FuzzyHit<T>[]): T | null => {
    if (!hits.length) return null;
    if (hits.length === 1) return hits[0].item;
    // Eng yaqini keyingisidan kamida ikki barobar aniqroq bo'lsin.
    if (hits[0].distance === 0 && hits[1].distance > 0) return hits[0].item;
    if (hits[1].distance - hits[0].distance >= 2) return hits[0].item;
    return null;
};
