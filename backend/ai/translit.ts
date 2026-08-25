// ─── O'zbek alifbolari o'rtasida o'tkazish ────────────────────────────────────
//
// O'zbek tili ikki alifboda yoziladi va foydalanuvchilar ikkalasini ham
// aralashtirib ishlatadi. Bazada ism "Asrorov Samandar" bo'lsa-yu,
// foydalanuvchi "асроров Самандар" deb yozsa, `contains` hech qachon mos
// kelmaydi — natija "bemor topilmadi", bemor esa ro'yxatda turadi.
//
// Ovoz kiritish bu holatni yanada tez-tez qiladi: rus tili tanish rejimi
// har doim kirill qaytaradi, klinikalarning bazasi esa odatda lotin.
//
// Yechim: qidiruv so'zining IKKALA shakli ham qidiriladi. Bu bazani
// o'zgartirmaydi va mavjud yozuvlarga tegmaydi.

/** Kirill -> lotin. Ko'p harfli almashinuvlar birinchi bo'lishi shart. */
const CYR_TO_LAT: [string, string][] = [
    ['ё', 'yo'], ['ж', 'j'], ['ц', 'ts'], ['ч', 'ch'], ['ш', 'sh'],
    ['щ', 'sh'], ['ю', 'yu'], ['я', 'ya'], ['ў', "o'"], ['ғ', "g'"],
    ['қ', 'q'], ['ҳ', 'h'], ['ъ', "'"], ['ь', ''],
    ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['д', 'd'],
    ['е', 'e'], ['з', 'z'], ['и', 'i'], ['й', 'y'], ['к', 'k'],
    ['л', 'l'], ['м', 'm'], ['н', 'n'], ['о', 'o'], ['п', 'p'],
    ['р', 'r'], ['с', 's'], ['т', 't'], ['у', 'u'], ['ф', 'f'],
    ['х', 'x'], ['ы', 'i'], ['э', 'e'],
];

/** Lotin -> kirill. Digraflar (sh, ch, yo...) birinchi. */
const LAT_TO_CYR: [string, string][] = [
    ["o'", 'ў'], ['o`', 'ў'], ['oʻ', 'ў'],
    ["g'", 'ғ'], ['g`', 'ғ'], ['gʻ', 'ғ'],
    ['sh', 'ш'], ['ch', 'ч'], ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'],
    ['ts', 'ц'],
    ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'],
    ['e', 'е'], ['j', 'ж'], ['z', 'з'], ['i', 'и'], ['y', 'й'],
    ['k', 'к'], ['q', 'қ'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
    ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'],
    ['u', 'у'], ['f', 'ф'], ['x', 'х'], ['h', 'ҳ'], ['c', 'к'],
];

const CYRILLIC_RE = new RegExp('[\\u0400-\\u04FF]');

export const hasCyrillic = (s: string): boolean => CYRILLIC_RE.test(s);

const apply = (text: string, table: [string, string][]): string => {
    let out = text.toLowerCase();
    for (const [from, to] of table) out = out.split(from).join(to);
    return out;
};

export const cyrToLat = (s: string): string => apply(s, CYR_TO_LAT);
export const latToCyr = (s: string): string => apply(s, LAT_TO_CYR);

/**
 * Qidiruv uchun so'zning barcha ehtimoliy shakllari.
 *
 * Har doim asl so'z ham qaytadi: baza aralash bo'lishi mumkin va
 * o'tkazish har doim ham aniq bo'lavermaydi.
 *
 * Apostrof shakllari ataylab olib tashlanadi ("o'" -> "o"): foydalanuvchi
 * uni turlicha yozadi (o', oʻ, o`) yoki umuman yozmaydi, bazada esa
 * bittasi turadi. Qisqartirilgan shakl `contains` uchun baribir mos
 * keladi va bu farqni butunlay yo'q qiladi.
 */
export const searchVariants = (token: string): string[] => {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return [];

    const out = new Set<string>([t]);

    if (hasCyrillic(t)) {
        const lat = cyrToLat(t);
        out.add(lat);
        out.add(lat.replace(/['`ʻ]/g, ''));
    } else {
        out.add(latToCyr(t));
        out.add(t.replace(/['`ʻ]/g, ''));
    }

    // Juda qisqa bo'laklar qidiruvni ma'nosiz kengaytiradi.
    return Array.from(out).filter(v => v.length >= 2);
};
