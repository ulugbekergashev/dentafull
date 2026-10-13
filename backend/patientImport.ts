// Bemorlar ro'yxatini fayldan (Excel/CSV) yuklash — sof mantiq.
// Express ham, Prisma ham bu yerda yo'q: baza `db` sifatida tashqaridan beriladi,
// shuning uchun soxta baza bilan to'liq sinaladi (tests/patient-import.test.cjs).
//
// Qoidalar:
//  • ism va telefon shart, qolgani ixtiyoriy;
//  • takror — shu klinikada telefonning oxirgi 9 raqami VA ism bir xil bo'lgan bemor.
//    Faqat telefon bo'yicha emas: bolalar ko'pincha onasining raqami bilan yoziladi.
//    Takror o'tkazib yuboriladi — mavjud bemor kartasi hech qachon o'zgartirilmaydi;
//  • tushunarsiz tug'ilgan sana bemorni to'xtatmaydi — sana bo'sh qoladi (keyin
//    "Ma'lumoti to'liq emas" filtri orqali to'ldiriladi). Sanani o'ylab topmaymiz:
//    soxta 1-yanvar tug'ilgan kun tabrigi bo'lib ketardi.
import { randomUUID } from 'crypto';

export interface ImportRow {
    firstName?: string;
    lastName?: string;
    phone?: string;
    secondaryPhone?: string;
    dob?: string;
    gender?: string;
    address?: string;
    note?: string;
}

/** Bazaga yoziladigan ko'rinishdagi qator (klinika va boshlang'ich qiymatlarsiz) */
export interface NormalizedRow {
    firstName: string;
    lastName: string;
    phone: string;
    secondaryPhone: string | null;
    /** YYYY-MM-DD yoki bo'sh — bemor kartasidagi sana maydoni ham shunday saqlaydi */
    dob: string;
    gender: 'Male' | 'Female';
    address: string | null;
    medicalHistory: string;
}

export interface ImportResult {
    created: number;
    duplicates: number;
    /** `index` — yuborilgan `rows` ro'yxatidagi o'rni (0 dan) */
    invalid: { index: number; reason: string }[];
    createdIds: string[];
}

export type NormalizeResult = { ok: true; row: NormalizedRow } | { ok: false; reason: string };

export const MAX_IMPORT_ROWS = 1000;

/** Rad etish sabablari — foydalanuvchiga shu matn ko'rsatiladi */
export const IMPORT_REASONS = {
    emptyRow: "Qator bo'sh",
    noName: "Ism yo'q",
    noPhone: "Telefon raqami yo'q",
    badPhone: "Telefon raqami noto'g'ri",
};

const CREATE_CHUNK_SIZE = 200;
const MAX_NAME_LENGTH = 60;
const MAX_PHONE_LENGTH = 32;
const MAX_ADDRESS_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;
/** Tozalashdan oldin xom matn ruxsat etilgan uzunlikning shuncha barobarigacha kesiladi */
const RAW_INPUT_FACTOR = 4;
/** Telefon katagidan o'qiladigan eng ko'p belgi (bir nechta raqam yozilgan bo'lishi mumkin) */
const MAX_PHONE_CELL_LENGTH = 200;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;
const DUPLICATE_PHONE_DIGITS = 9;
const MIN_BIRTH_YEAR = 1900;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bitta katakdagi bir nechta raqamni ajratuvchi belgilar: "90 123 45 67, 91 765 43 21" */
const PHONE_SEPARATORS = /[,;/\\|\n\r]+/;
/** Ismdagi tutuq belgisining barcha ko'rinishlari: ' ’ ‘ ʻ ʼ ` ´ */
const APOSTROPHES = /['’‘ʻʼ`´]/g;

const MALE_EXACT = ['m', 'e', 'м', 'э', 'е'];
const MALE_PREFIXES = ['erk', 'эрк', 'male', 'муж', 'man'];
const FEMALE_EXACT = ['f', 'a', 'w', 'ж', 'а'];
const FEMALE_PREFIXES = ['ayo', 'аё', 'ае', 'fem', 'жен', 'wom'];
/** Ayol familiyasi va otasining ismi qo'shimchalari: Karimova, Алиева, Olimovna */
const FEMALE_NAME_ENDING = /(ova|eva|ovna|evna|ова|ева|ёва|овна|евна)$/;
const FEMALE_NAME_WORDS = ['qizi', 'kizi', 'қизи', 'кизи'];

const isText = (value: unknown): value is string | number =>
    typeof value === 'string' || (typeof value === 'number' && isFinite(value));

/** Juftini yo'qotgan surrogat (kesilgan emoji bo'lagi) olib tashlanadi — baza bunday satrni qabul qilmasligi mumkin */
const dropLoneSurrogates = (text: string): string =>
    text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) => (match.length === 2 ? match : ''));

/**
 * Matnni tozalaydi: HTML teglari va boshqaruv belgilarisiz, bitta bo'shliq bilan, cheklangan uzunlikda.
 * Xom matn AVVAL kesiladi va teg qidiruvi chiziqli (`[^<>]`): megabaytli "<<<<…" satri
 * serverni daqiqalarga qotirib qo'ymasligi kerak (so'rov hajmi 2 MB gacha bo'lishi mumkin).
 */
function cleanText(value: unknown, maxLength: number): string {
    if (!isText(value)) return '';
    const cleaned = String(value)
        .slice(0, maxLength * RAW_INPUT_FACTOR)
        .replace(/<[^<>]*>/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return dropLoneSurrogates(cleaned).trim();
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * ⚠️ `smsService.ts` dagi `normalizeUzPhone` bilan bir xil qoida (u yerdan import qilinmaydi:
 * u Prisma va axios'ni tortib keladi). Testda ikkalasi solishtiriladi.
 */
function uzPhoneDigits(digits: string): string | null {
    if (digits.length === 12 && digits.startsWith('998')) return digits;
    if (digits.length === 13 && digits.startsWith('0998')) return digits.slice(1);
    if (digits.length === 9) return `998${digits}`;
    if (digits.length === 10 && (digits.startsWith('0') || digits.startsWith('8'))) return `998${digits.slice(1)}`;
    return null;
}

/**
 * Saqlanadigan telefon: O'zbekiston raqami → +998XXXXXXXXX; boshqa davlat yoki shahar
 * raqami yozilganicha qoladi; raqamga o'xshamasa — null.
 */
function normalizePhone(value: string): string | null {
    const text = cleanText(value, MAX_PHONE_LENGTH * 2);
    const digits = text.replace(/\D/g, '');
    const uz = uzPhoneDigits(digits);
    if (uz) return `+${uz}`;
    if (digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS) return text.slice(0, MAX_PHONE_LENGTH).trim();
    return null;
}

/** Katakdagi yaroqli raqamlar (yozilgan tartibda). Bo'laklab tanilmasa — butun matn bitta raqam deb qaraladi */
function phonesFromCell(value: unknown): string[] {
    if (!isText(value)) return [];
    const whole = String(value).slice(0, MAX_PHONE_CELL_LENGTH);
    const found = whole.split(PHONE_SEPARATORS).map(normalizePhone).filter((p): p is string => p !== null);
    if (found.length > 0) return found;
    const single = normalizePhone(whole);
    return single ? [single] : [];
}

/** Takrorni aniqlash uchun: telefonning oxirgi 9 raqami */
export function phoneKey(phone: unknown): string {
    return isText(phone) ? String(phone).replace(/\D/g, '').slice(-DUPLICATE_PHONE_DIGITS) : '';
}

/** Takrorni aniqlash uchun: harf kattaligi, bo'shliq, tutuq belgisi va so'zlar tartibiga bog'liq bo'lmagan ism */
export function nameKey(firstName: unknown, lastName: unknown): string {
    return `${isText(lastName) ? lastName : ''} ${isText(firstName) ? firstName : ''}`
        .toLowerCase()
        .replace(APOSTROPHES, '')
        .replace(/ё/g, 'е')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

const duplicateKey = (p: { firstName?: unknown; lastName?: unknown; phone?: unknown }): string =>
    `${phoneKey(p.phone)}|${nameKey(p.firstName, p.lastName)}`;

function isRealBirthDate(year: number, month: number, day: number): boolean {
    if (year < MIN_BIRTH_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
    // Kelajakdagi sana tug'ilgan kun bo'la olmaydi (soat mintaqasi uchun bir kun zaxira)
    return time <= Date.now() + DAY_MS;
}

/** YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY (va DD-MM-YYYY) → YYYY-MM-DD. Tushunarsiz bo'lsa bo'sh satr */
function normalizeDob(value: unknown): string {
    const text = cleanText(value, 40).replace(/[^\d]+$/, '');
    if (!text) return '';
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
    // Vaqt qo'shilib kelgan sana ham o'qiladi: "12.04.1985 0:00:00"
    const local = iso ? null : /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T]\d{1,2}:\d{2}.*)?$/.exec(text);
    const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : null;
    if (!parts) return '';
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    return isRealBirthDate(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : '';
}

const startsWithAny = (text: string, prefixes: string[]): boolean => prefixes.some((p) => text.startsWith(p));

/** Familiya yoki otasining ismi ayolnikiga o'xshaydimi (ism — birinchi so'z — hisobga olinmaydi) */
function looksFemale(firstName: string, lastName: string): boolean {
    const words = `${lastName} ${firstName.split(' ').slice(1).join(' ')}`.toLowerCase().split(' ').filter(Boolean);
    return words.some((w) => FEMALE_NAME_ENDING.test(w) || FEMALE_NAME_WORDS.indexOf(w) !== -1);
}

/**
 * erkak/ayol/м/ж/male/female → Male/Female. Yozilmagan bo'lsa familiyadan olinadi
 * (Karimova → Female); bo'lmasa bemor qo'shishdagi kabi Male.
 */
function normalizeGender(value: unknown, firstName: string, lastName: string): 'Male' | 'Female' {
    const text = cleanText(value, 20).toLowerCase().replace(/[^a-zа-яё]/g, '');
    if (MALE_EXACT.indexOf(text) !== -1 || startsWithAny(text, MALE_PREFIXES)) return 'Male';
    if (FEMALE_EXACT.indexOf(text) !== -1 || startsWithAny(text, FEMALE_PREFIXES)) return 'Female';
    return looksFemale(firstName, lastName) ? 'Female' : 'Male';
}

const hasLetter = (text: string): boolean => text.toLowerCase() !== text.toUpperCase();

/** Fayldagi bitta qatorni tekshiradi va bazadagi ko'rinishga keltiradi */
export function normalizeImportRow(raw: ImportRow): NormalizeResult {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: IMPORT_REASONS.emptyRow };

    let firstName = cleanText(raw.firstName, MAX_NAME_LENGTH);
    let lastName = cleanText(raw.lastName, MAX_NAME_LENGTH);
    if (!firstName && lastName) {
        // Faqat familiya ustuni to'ldirilgan: "Karimov Aziz" → familiya + ism, bitta so'z → ism
        const words = lastName.split(' ');
        lastName = words.length > 1 ? words[0] : '';
        firstName = words.length > 1 ? words.slice(1).join(' ') : words[0];
    }
    if (!firstName || !hasLetter(`${firstName}${lastName}`)) return { ok: false, reason: IMPORT_REASONS.noName };

    if (!cleanText(raw.phone, MAX_PHONE_LENGTH * 2)) return { ok: false, reason: IMPORT_REASONS.noPhone };
    const phones = phonesFromCell(raw.phone);
    if (phones.length === 0) return { ok: false, reason: IMPORT_REASONS.badPhone };
    const phone = phones[0];
    const secondaryPhone = phonesFromCell(raw.secondaryPhone).concat(phones.slice(1))
        .filter((p) => phoneKey(p) !== phoneKey(phone))[0] || null;

    return {
        ok: true,
        row: {
            firstName,
            lastName,
            phone,
            secondaryPhone,
            dob: normalizeDob(raw.dob),
            gender: normalizeGender(raw.gender, firstName, lastName),
            address: cleanText(raw.address, MAX_ADDRESS_LENGTH) || null,
            medicalHistory: cleanText(raw.note, MAX_NOTE_LENGTH),
        },
    };
}

/**
 * Qatorlarni klinikaga yuklaydi. `dryRun` — hech narsa yozmasdan, haqiqiy yuklashdagi
 * bilan bir xil sonlarni qaytaradi (foydalanuvchi natijani oldindan ko'radi).
 * `db` — Prisma klienti yoki testdagi soxta baza: `patient.findMany` va `patient.createMany`.
 */
export async function importPatients(
    db: any,
    clinicId: string,
    rows: ImportRow[],
    opts: { dryRun?: boolean; branchId?: string | null } = {},
): Promise<ImportResult> {
    if (typeof clinicId !== 'string' || !clinicId) throw new Error('Klinika aniqlanmadi');
    if (!Array.isArray(rows)) throw new Error('Yuklanadigan qatorlar topilmadi');
    if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Bir martada ko'pi bilan ${MAX_IMPORT_ROWS} ta qator yuklash mumkin`);
    }

    const invalid: ImportResult['invalid'] = [];
    const valid: NormalizedRow[] = [];
    rows.forEach((raw, index) => {
        const result = normalizeImportRow(raw);
        // `in` — asosiy (qat'iy bo'lmagan) tsconfig ham turni to'g'ri toraytirishi uchun
        if ('row' in result) valid.push(result.row);
        else invalid.push({ index, reason: result.reason });
    });
    if (valid.length === 0) return { created: 0, duplicates: 0, invalid, createdIds: [] };

    // Faqat shu klinika bemorlari: boshqa klinikadagi bir xil telefon takror emas
    const existing: { firstName?: string; lastName?: string; phone?: string }[] = await db.patient.findMany({
        where: { clinicId },
        select: { firstName: true, lastName: true, phone: true },
    });
    const seen = new Set<string>(existing.map(duplicateKey));

    const branchId = typeof opts.branchId === 'string' && opts.branchId ? opts.branchId : null;
    const fresh: Record<string, unknown>[] = [];
    let duplicates = 0;
    for (const row of valid) {
        const key = duplicateKey(row);
        if (seen.has(key)) {
            duplicates += 1;
            continue;
        }
        seen.add(key);
        // POST /api/patients bilan bir xil boshlang'ich qiymatlar
        fresh.push({
            id: randomUUID(),
            ...row,
            clinicId,
            branchId,
            status: 'Active',
            lastVisit: 'Never',
            doctorId: null,
            pinfl: '',
            passport: null,
            regionCode: null,
            districtCode: null,
        });
    }

    if (opts.dryRun) return { created: fresh.length, duplicates, invalid, createdIds: [] };

    const chunks: Record<string, unknown>[][] = [];
    for (let start = 0; start < fresh.length; start += CREATE_CHUNK_SIZE) chunks.push(fresh.slice(start, start + CREATE_CHUNK_SIZE));
    if (typeof db.$transaction === 'function') {
        // Bitta tranzaksiya: o'rtada xato bo'lsa so'rovdan hech narsa yozilmaydi — qayta urinish
        // "yarmi yozilgan" holatga tushmaydi va natija sonlari aniq qoladi
        await db.$transaction(chunks.map((data) => db.patient.createMany({ data })));
    } else {
        for (const data of chunks) await db.patient.createMany({ data });
    }
    return { created: fresh.length, duplicates, invalid, createdIds: fresh.map((p) => String(p.id)) };
}
