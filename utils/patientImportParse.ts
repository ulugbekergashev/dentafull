/**
 * Bemorlarni Excel/CSV fayldan yuklash — brauzerdagi sof mantiq: sarlavha qatorini topish,
 * ustunlarni tanish, F.I.O ni familiya va ismga ajratish, Excel sanalarini o'qish.
 * Faylni o'qish (xlsx) va serverga yuborish — `services/patientImport.ts` da.
 * Bu faylda import yo'q: `backend/tests/patient-import-parse.test.cjs` uni brauzersiz sinaydi.
 *
 * ⚠️ `rowKey` (takror kaliti) va bir katakdagi telefonlarni ajratish qoidasi
 * `backend/patientImport.ts` dagi bilan bir xil bo'lishi shart — test ikkalasini solishtiradi.
 * Asosiy tekshiruv serverda: bu yerdagi kalit faqat katta fayl bo'laklarga bo'linganda
 * "oldindan ko'rish" sonlari haqiqiy natija bilan bir xil chiqishi uchun kerak.
 */

export type Cell = string | number | boolean | Date | null | undefined;

export interface SheetData {
    name: string;
    /** Fayldagi qatorlar: 0-indeks — Excel'dagi 1-qator (bo'sh qatorlar ham joyida) */
    rows: Cell[][];
}

export type ImportField = 'fullName' | 'lastName' | 'firstName' | 'phone' | 'secondaryPhone' | 'dob' | 'gender' | 'address' | 'note';
export const IMPORT_FIELDS: ImportField[] = ['fullName', 'lastName', 'firstName', 'phone', 'secondaryPhone', 'dob', 'gender', 'address', 'note'];

/** Maydon → fayldagi ustun indeksi */
export type ColumnMapping = Partial<Record<ImportField, number>>;
export type NameOrder = 'lastFirst' | 'firstLast';

/** Serverga yuboriladigan qator (`backend/patientImport.ts` dagi ImportRow) */
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

export interface TableColumn { index: number; letter: string; header: string; sample: string }
export interface TableRow { sheet: string; fileRow: number; cells: Cell[] }
export interface ImportTable { columns: TableColumn[]; rows: TableRow[]; hasHeader: boolean; sheetCount: number }
export interface PreparedRow { sheet: string; fileRow: number; row: ImportRow; dobUnclear: boolean; cells: Cell[] }
export interface PreparedRows {
    /** Serverga yuboriladigan qatorlar (xato qatorlar ham — sababini server aytadi) */
    rows: PreparedRow[];
    /** Faylning o'zida ikkinchi marta uchragan bemorlar — yuborilmaydi */
    repeated: PreparedRow[];
    dobUnclear: number;
}

/** Bir faylda ko'pi bilan shuncha bemor: undan kattasi brauzerni qotiradi */
export const MAX_FILE_ROWS = 20000;

/**
 * Yuboriladigan maydon uzunligi. Server baribir o'zi kesadi (backend/patientImport.ts) —
 * bu yerda kesishdan maqsad: Excel katagi 32 ming belgigacha bo'lishi mumkin, 500 ta shunday
 * qator esa serverning so'rov hajmi chegarasidan oshib ketardi.
 */
const FIELD_LIMITS: Record<keyof ImportRow, number> = {
    firstName: 60, lastName: 60, phone: 100, secondaryPhone: 100, dob: 10, gender: 20, address: 200, note: 1000,
};

const HEADER_SCAN_ROWS = 15;
const SAMPLE_ROWS = 50;
const SAMPLE_LENGTH = 28;
const CONTENT_MATCH_SHARE = 0.6;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;
const DUPLICATE_PHONE_DIGITS = 9;
const MIN_BIRTH_YEAR = 1900;
const MAX_YEAR_ONLY = 2100;
const MAX_EXCEL_SERIAL = 80000;
/** Excel kun raqami 25569 = 1970-01-01 */
const EXCEL_EPOCH_OFFSET = 25569;
const DAY_MS = 24 * 60 * 60 * 1000;

const APOSTROPHES = /['’‘ʻʼ`´]/g;
const PHONE_SEPARATORS = /[,;/\\|\n\r]+/;
/** Familiya qo'shimchalari: Karimov, Алиева. Otasining ismi (Olimovich, Алишеровна) bunga tushmaydi */
const SURNAME_ENDING = /(ov|ova|ev|eva|ов|ова|ев|ева|ёв|ёва)$/;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
const hasLetter = (text: string): boolean => text.toLowerCase() !== text.toUpperCase();
const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Katak qiymati matn sifatida: son — o'zi, bo'shliqlar bitta, chetlari kesilgan */
export function cellText(cell: Cell): string {
    if (cell === null || cell === undefined || typeof cell === 'boolean') return '';
    if (cell instanceof Date) {
        return isNaN(cell.getTime()) ? '' : `${cell.getFullYear()}-${pad2(cell.getMonth() + 1)}-${pad2(cell.getDate())}`;
    }
    if (typeof cell === 'number') return isFinite(cell) ? String(cell) : '';
    return String(cell).replace(/\s+/g, ' ').trim();
}

/** Telefon katagi: yangi qatordan yozilgan ikkinchi raqam yo'qolmasligi uchun qator uzilishi vergulga aylanadi */
const phoneText = (cell: Cell): string => (typeof cell === 'string' ? cellText(cell.replace(/[\r\n]+/g, ', ')) : cellText(cell));

export const columnLetter = (index: number): string => {
    let n = index + 1;
    let letters = '';
    while (n > 0) {
        letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
};

const normalizeHeader = (text: string): string => text
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/ў/g, 'у').replace(/қ/g, 'к').replace(/ғ/g, 'г').replace(/ҳ/g, 'х').replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .trim();

const MAX_HEADER_WORDS = 7;
const FIO_HEADER = /(^| )(f i o|f i sh|ф и о|ф и ш|fio|fish|фио|фиш)( |$)/;
/** Shifokor haqidagi ustun (ismi, telefoni) — bemorniki emas */
const DOCTOR_STEMS = ['shifokor', 'doktor', 'vrach', 'doctor', 'шифокор', 'доктор', 'врач'];
/** Qarindosh haqidagi ustun: ismi bemorniki emas, telefoni esa bemor bilan bog'lanish raqami */
const RELATIVE_STEMS = ['onasi', 'otasi', 'qarindosh', 'vasiy', 'mother', 'father', 'parent', 'guardian', 'матер', 'мам', 'отц', 'пап', 'родител', 'опекун', 'онаси', 'отаси'];
const RELATIVE_WORDS = ['ona', 'ota', 'мать', 'отец', 'она', 'ота'];
/** "Bemor", "Patient name" — odamning o'zi. "Bemor yoshi", "Карта пациента" — boshqa ma'lumot */
const PERSON_WORDS = ['bemor', 'bemorning', 'mijoz', 'patient', 'бемор', 'мижоз', 'пациент', 'пациента', 'клиент', 'клиента'];
const NAME_WORDS = ['name', 'full', 'nomi', 'ism', 'ismi', 'имя'];

/**
 * Sarlavha matni qaysi maydonga to'g'ri keladi (o'zbekcha, ruscha, inglizcha). Tanilmasa null.
 * So'zlar butunligicha solishtiriladi: "Ismoilov" — "Ism" emas, "Telman" — "Tel" emas
 * (bu funksiya sarlavha qatorini topishda bemor qatorlariga ham qo'llanadi).
 */
export function matchHeader(header: string): ImportField | null {
    const normalized = normalizeHeader(header || '');
    const list = words(normalized);
    if (list.length === 0 || list.length > MAX_HEADER_WORDS) return null;
    const joined = list.join('');
    const starts = (...stems: string[]) => list.some(w => stems.some(s => w.startsWith(s)));
    const isWord = (...options: string[]) => list.some(w => options.includes(w));
    if (starts(...DOCTOR_STEMS)) return null;

    const phoneWord = list.some(w => ['tel', 'тел', 'mob', 'моб'].includes(w)
        || ['telefon', 'телефон', 'phone', 'mobil', 'мобил'].some(s => w.startsWith(s)));
    if (phoneWord) {
        const second = starts('qoshimcha', 'ikkinchi', 'zaxira', 'кушимча', 'иккинчи', 'доп', 'втор', 'second') || isWord('2');
        return second ? 'secondaryPhone' : 'phone';
    }
    const firstWord = isWord('ism', 'ismi', 'исм', 'исми', 'имя', 'firstname') || (isWord('first') && isWord('name'));
    const lastWord = starts('familiya', 'фамили', 'surname', 'lastname') || (isWord('last') && isWord('name'));
    // "Familiyasi, ismi, otasining ismi" — bu to'liq ism; familiyasiz "Onasining ismi" esa qarindosh
    if (!lastWord && (starts(...RELATIVE_STEMS) || isWord(...RELATIVE_WORDS))) return null;

    // "Tug'ilgan joyi" / "Место рождения" — sana emas
    const birthPlace = starts('joy', 'жой', 'мест', 'place');
    if (!birthPlace && (starts('tugil', 'тугил', 'рожд', 'birth') || isWord('dob', 'др', 'tug', 'туг') || joined === 'др')) return 'dob';
    if (starts('jins', 'жинс', 'gender') || isWord('пол', 'sex')) return 'gender';
    if (starts('manzil', 'манзил', 'адрес', 'address')) return 'address';
    if (starts('izoh', 'изох', 'примеч', 'коммент', 'замет', 'note', 'comment', 'eslatma', 'эслатма')) return 'note';

    // Otasining ismi uchun alohida maydon yo'q — bunday ustun o'tkazib yuboriladi
    if (!lastWord && starts('отчеств', 'patronym', 'middle')) return null;
    if (FIO_HEADER.test(normalized)) return 'fullName';
    if (firstWord && (lastWord || starts('sharif', 'шариф') || isWord('full', 'toliq', 'тулик', 'полное'))) return 'fullName';
    if (lastWord) return 'lastName';
    if (firstWord) return 'firstName';
    // "Bemor №" tartib raqami; "Bemorlar ro'yxati" — jadval nomi (faqat birlikdagi so'z olinadi)
    const personOnly = !/[№#]/.test(header) && list.every(w => PERSON_WORDS.includes(w) || NAME_WORDS.includes(w));
    return personOnly ? 'fullName' : null;
}

const isRealBirthDate = (year: number, month: number, day: number): boolean => {
    if (year < MIN_BIRTH_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day && time <= Date.now() + DAY_MS;
};

const toIso = (year: number, month: number, day: number): string =>
    (isRealBirthDate(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : '');

/**
 * Excel sanasi (1899-12-30 dan beri o'tgan kunlar) → YYYY-MM-DD. Soat mintaqasiga bog'liq emas.
 * Sana bo'la olmaydigan son (masalan sana formati berilgan telefon raqami) — bo'sh satr.
 */
export function excelSerialToISO(serial: number): string {
    if (!(serial >= 1 && serial < MAX_EXCEL_SERIAL)) return '';
    const date = new Date((Math.floor(serial) - EXCEL_EPOCH_OFFSET) * DAY_MS);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** "85" → 1985, "05" → 2005: tug'ilgan yil kelajakda bo'lmaydi */
const expandYear = (yy: number): number => (yy <= new Date().getFullYear() % 100 ? 2000 + yy : 1900 + yy);

function dobFromNumber(value: number): string {
    // Faqat yil (1985) yoki sana bo'lmagan son — tug'ilgan kunni o'ylab topmaymiz
    if (value <= MAX_YEAR_ONLY || value >= MAX_EXCEL_SERIAL) return '';
    const [year, month, day] = excelSerialToISO(value).split('-').map(Number);
    return toIso(year, month, day);
}

function dobFromText(text: string): string {
    if (/^\d+(\.\d+)?$/.test(text)) return dobFromNumber(Number(text));
    const core = text.replace(/[^\d]+$/, '');
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(core);
    if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    // Boshqa dasturdan chiqarilgan faylda sana yonida vaqt ham bo'ladi: "12.04.1985 0:00:00"
    const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[ T]\d{1,2}:\d{2}.*)?$/.exec(core);
    if (!local) return '';
    const year = local[3].length === 2 ? expandYear(Number(local[3])) : Number(local[3]);
    return toIso(year, Number(local[2]), Number(local[1]));
}

/**
 * Tug'ilgan sana katagi → YYYY-MM-DD. `unclear` — katakda nimadir yozilgan, lekin sana
 * sifatida o'qib bo'lmadi (bemor baribir qo'shiladi, sanasi bo'sh qoladi).
 */
export function parseDob(cell: Cell): { iso: string; unclear: boolean } {
    let iso = '';
    if (cell instanceof Date) {
        if (isNaN(cell.getTime())) return { iso: '', unclear: true };
        iso = toIso(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
    } else if (typeof cell === 'number') {
        iso = dobFromNumber(cell);
    } else {
        const text = cellText(cell);
        if (!text) return { iso: '', unclear: false };
        iso = dobFromText(text);
    }
    return { iso, unclear: !iso };
}

const isSurname = (word: string): boolean => SURNAME_ENDING.test(word.toLowerCase());

/** Ismlar ro'yxatida qaysi tartib ko'p: "Familiya Ism" (odatdagi) yoki "Ism Familiya" */
export function detectNameOrder(names: string[]): NameOrder {
    let lastFirst = 0;
    let firstLast = 0;
    for (const name of names) {
        const list = words(name);
        if (list.length < 2) continue;
        const head = isSurname(list[0]);
        const tail = isSurname(list[list.length - 1]);
        if (head && !tail) lastFirst += 1;
        else if (tail && !head) firstLast += 1;
    }
    return firstLast > lastFirst ? 'firstLast' : 'lastFirst';
}

/**
 * To'liq ism → familiya + ism (otasining ismi ism bilan qoladi). Familiyasi aniq ko'rinib
 * turgan qator ("…ov", "…ова") o'zi hal qiladi, qolganlari `order` bo'yicha ajratiladi.
 */
export function splitFullName(text: string, order: NameOrder): { firstName: string; lastName: string } {
    const list = words(text);
    if (list.length < 2) return { firstName: list[0] || '', lastName: '' };
    const head = isSurname(list[0]);
    const tail = isSurname(list[list.length - 1]);
    const rowOrder: NameOrder = head && !tail ? 'lastFirst' : tail && !head ? 'firstLast' : order;
    return rowOrder === 'lastFirst'
        ? { lastName: list[0], firstName: list.slice(1).join(' ') }
        : { lastName: list[list.length - 1], firstName: list.slice(0, -1).join(' ') };
}

const isEmptyRow = (cells: Cell[] | undefined): boolean => !cells || cells.every(c => cellText(c) === '');
const phoneDigits = (text: string): string => text.replace(/\D/g, '');

const looksLikePhone = (cell: Cell): boolean => {
    const digits = phoneDigits(cellText(cell));
    return digits.length >= 9 && digits.length <= 13 && !parseDob(cell).iso;
};
const looksLikeFullName = (cell: Cell): boolean => {
    if (typeof cell !== 'string') return false;
    const list = words(cell);
    return list.length >= 2 && list.length <= 6 && !/\d/.test(cell) && list.every(hasLetter);
};

/**
 * Sarlavha qatori indeksi: ichida son, telefon yoki sana yo'q va kamida ikkita tanish nom bor
 * (bo'lmasa — bitta nomli birinchi shunday qator). Topilmasa -1.
 * Son/telefon/sana bor qator — bemor qatori: izohida "telefon" so'zi uchrasa ham sarlavha emas,
 * aks holda uning ustidagi bemorlar jimgina tashlab ketilardi.
 */
export function detectHeaderRow(rows: Cell[][]): number {
    let fallback = -1;
    for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i += 1) {
        const cells = rows[i] || [];
        if (cells.some(c => typeof c === 'number' || looksLikePhone(c) || !!parseDob(c).iso)) continue;
        const fields = new Set(cells.map(c => (typeof c === 'string' ? matchHeader(c) : null)).filter(Boolean));
        if (fields.size >= 2) return i;
        if (fields.size === 1 && fallback < 0) fallback = i;
    }
    return fallback;
}

const headerSignature = (sheet: SheetData): string => {
    const index = detectHeaderRow(sheet.rows);
    if (index < 0) return 'sarlavhasiz';
    return sheet.rows[index].map(c => matchHeader(cellText(c)) || '').join('|').replace(/\|+$/, '');
};

/** Varaqlarni bitta ro'yxat qilib yuklash mumkinmi: ustunlari bir xil tartibda bo'lsa */
export function sheetsCompatible(sheets: SheetData[]): boolean {
    return new Set(sheets.map(headerSignature)).size <= 1;
}

/** Tanlangan varaq(lar)dan jadval: ustunlar (nomi, namunasi) va bemor qatorlari (fayldagi raqami bilan) */
export function buildTable(sheets: SheetData[]): ImportTable {
    let headerCells: Cell[] | null = null;
    const rows: TableRow[] = [];
    for (const sheet of sheets) {
        const headerIndex = detectHeaderRow(sheet.rows);
        if (headerIndex >= 0 && !headerCells) headerCells = sheet.rows[headerIndex];
        sheet.rows.forEach((cells, i) => {
            if (i > headerIndex && !isEmptyRow(cells)) rows.push({ sheet: sheet.name, fileRow: i + 1, cells });
        });
    }
    const width = rows.reduce((max, r) => Math.max(max, r.cells.length), headerCells ? headerCells.length : 0);
    const sampleRows = rows.slice(0, SAMPLE_ROWS);
    const columns: TableColumn[] = Array.from({ length: width }, (_, index) => ({
        index,
        letter: columnLetter(index),
        header: headerCells ? cellText(headerCells[index]) : '',
        sample: (sampleRows.map(r => cellText(r.cells[index])).find(Boolean) || '').slice(0, SAMPLE_LENGTH),
    }));
    return { columns, rows, hasHeader: !!headerCells, sheetCount: sheets.length };
}

/**
 * Ustunlarni o'zi tanlaydi: avval sarlavha bo'yicha, topilmagan ism va telefonni — ustun ichidagi
 * yozuvga qarab. Tug'ilgan sana faqat sarlavhadan olinadi: sanali ustun tashrif sanasi ham
 * bo'lishi mumkin, uni tug'ilgan kun deb yozib qo'yish xatosini keyin topish qiyin.
 */
export function autoMapColumns(table: ImportTable): ColumnMapping {
    const byHeader: ColumnMapping = {};
    for (const col of table.hasHeader ? table.columns : []) {
        const field = matchHeader(col.header);
        if (!field) continue;
        if (byHeader[field] === undefined) byHeader[field] = col.index;
        else if (field === 'phone' && byHeader.secondaryPhone === undefined) byHeader.secondaryPhone = col.index;
    }
    // To'liq ism ustuni topilgan bo'lsa, alohida "Ism"/"Familiya" ustuni uni bosib ketmaydi (kerak bo'lsa
    // foydalanuvchi o'zi tanlaydi). "Ism" ustuni bor-u familiya ustuni yo'q — unda odatda to'liq ism yozilgan.
    const { firstName, lastName, ...others } = byHeader;
    const onlyFirstName = firstName !== undefined && lastName === undefined;
    const nameFixed: ColumnMapping = others.fullName !== undefined ? others
        : onlyFirstName ? { ...others, fullName: firstName }
        : byHeader;

    const sample = table.rows.slice(0, SAMPLE_ROWS);
    const guess = (taken: ColumnMapping, test: (cell: Cell) => boolean): number | undefined => {
        const used = new Set(Object.values(taken));
        return table.columns.find(col => {
            if (used.has(col.index)) return false;
            const filled = sample.map(r => r.cells[col.index]).filter(c => cellText(c) !== '');
            return filled.length > 0 && filled.filter(test).length / filled.length >= CONTENT_MATCH_SHARE;
        })?.index;
    };
    const guessedPhone = nameFixed.phone === undefined ? guess(nameFixed, looksLikePhone) : undefined;
    const withPhone: ColumnMapping = guessedPhone === undefined ? nameFixed : { ...nameFixed, phone: guessedPhone };
    const needsName = withPhone.fullName === undefined && withPhone.firstName === undefined;
    const guessedName = needsName ? guess(withPhone, looksLikeFullName) : undefined;
    return guessedName === undefined ? withPhone : { ...withPhone, fullName: guessedName };
}

/** Yuklash uchun yetarlimi: ism (to'liq yoki alohida) va telefon ustuni tanlangan */
export const isMappingReady = (mapping: ColumnMapping): boolean =>
    mapping.phone !== undefined && (mapping.fullName !== undefined || mapping.firstName !== undefined);

/** Takror kaliti: telefonning oxirgi 9 raqami + ism (harf kattaligi, tutuq belgisi, so'zlar tartibisiz). Ism yoki telefon yaroqsiz bo'lsa bo'sh */
export function rowKey(row: { firstName?: unknown; lastName?: unknown; phone?: unknown }): string {
    const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
    const name = `${text(row.lastName)} ${text(row.firstName)}`;
    if (!hasLetter(name)) return '';
    const isPhone = (part: string): boolean => {
        const n = phoneDigits(part).length;
        return n >= MIN_PHONE_DIGITS && n <= MAX_PHONE_DIGITS;
    };
    const phone = text(row.phone);
    const first = phone.split(PHONE_SEPARATORS).find(isPhone) || (isPhone(phone) ? phone : '');
    if (!first) return '';
    const nameKey = words(name.toLowerCase().replace(APOSTROPHES, '').replace(/ё/g, 'е')).sort().join(' ');
    return `${phoneDigits(first).slice(-DUPLICATE_PHONE_DIGITS)}|${nameKey}`;
}

/** Jadval qatorlaridan serverga yuboriladigan qatorlar. Tanlangan ustunlari bo'sh qatorlar tashlab ketiladi */
export function prepareRows(table: ImportTable, mapping: ColumnMapping, nameOrder: NameOrder): PreparedRows {
    const rows: PreparedRow[] = [];
    const repeated: PreparedRow[] = [];
    const seen = new Set<string>();
    let dobUnclear = 0;
    for (const source of table.rows) {
        const cell = (field: ImportField): Cell => (mapping[field] === undefined ? undefined : source.cells[mapping[field] as number]);
        const separate = { firstName: cellText(cell('firstName')), lastName: cellText(cell('lastName')) };
        const name = separate.firstName || separate.lastName ? separate : splitFullName(cellText(cell('fullName')), nameOrder);
        const dob = parseDob(cell('dob'));
        const values: [keyof ImportRow, string][] = [
            ['firstName', name.firstName], ['lastName', name.lastName],
            ['phone', phoneText(cell('phone'))], ['secondaryPhone', phoneText(cell('secondaryPhone'))],
            ['dob', dob.iso], ['gender', cellText(cell('gender'))],
            ['address', cellText(cell('address'))], ['note', cellText(cell('note'))],
        ];
        const filled = values
            .map(([field, value]): [keyof ImportRow, string] => [field, value.slice(0, FIELD_LIMITS[field]).trim()])
            .filter(([, value]) => value !== '');
        if (filled.length === 0) continue;
        const row: ImportRow = Object.fromEntries(filled);
        const prepared: PreparedRow = { sheet: source.sheet, fileRow: source.fileRow, row, dobUnclear: dob.unclear, cells: source.cells };
        const key = rowKey(row);
        if (key && seen.has(key)) {
            repeated.push(prepared);
            continue;
        }
        if (key) seen.add(key);
        if (dob.unclear) dobUnclear += 1;
        rows.push(prepared);
    }
    return { rows, repeated, dobUnclear };
}

/** Qator raqami foydalanuvchiga: bitta varaqda — raqam, bir nechta varaqda — "Varaq: raqam" */
export const rowLabel = (table: ImportTable, row: { sheet: string; fileRow: number }): string | number =>
    (table.sheetCount > 1 ? `${row.sheet}: ${row.fileRow}` : row.fileRow);

/** YYYY-MM-DD → DD.MM.YYYY (odam o'qiydigan ko'rinish) */
export const isoToLocal = (iso: string): string => iso.split('-').reverse().join('.');

/**
 * Xato qatorlar fayli: asl ustunlar + qator raqami va sababi. Tuzatib, shu faylning o'zini
 * qayta yuklash mumkin. `dobColumn` — Excel sanasi "31149" emas, "12.04.1985" bo'lib chiqishi uchun.
 */
export function problemRowsSheet(
    table: ImportTable,
    problems: { row: PreparedRow; reason: string }[],
    labels: { row: string; reason: string },
    dobColumn?: number,
): (string | number)[][] {
    const header = [labels.row, ...table.columns.map(c => c.header || c.letter), labels.reason];
    const body = problems.map(({ row, reason }) => [
        rowLabel(table, row),
        ...table.columns.map(c => {
            const value = row.cells[c.index];
            const dob = c.index === dobColumn ? parseDob(value).iso : '';
            if (dob) return isoToLocal(dob);
            return typeof value === 'number' ? value : cellText(value);
        }),
        reason,
    ]);
    return [header, ...body];
}

export function chunk<T>(items: T[], size: number): T[][] {
    const parts: T[][] = [];
    for (let start = 0; start < items.length; start += size) parts.push(items.slice(start, start + size));
    return parts;
}

export interface ImportProblem { index: number; reason: string }
/** Bitta so'rov natijasi; `index` — shu bo'lak ichidagi o'rin */
export interface ChunkResult { created: number; duplicates: number; invalid: ImportProblem[] }
/** Umumiy natija; `sent` — yuborib bo'lingan qatorlar, `index` — butun ro'yxatdagi o'rin */
export interface ImportTotals extends ChunkResult { sent: number }
export const EMPTY_TOTALS: ImportTotals = { sent: 0, created: 0, duplicates: 0, invalid: [] };

export interface RunOptions {
    onProgress: (totals: ImportTotals) => void;
    /** Uzilib qolgan yuklashni davom ettirish: shu yergacha yuborilgani qayta yuborilmaydi */
    resumeFrom?: ImportTotals;
    isCancelled?: () => boolean;
}

/**
 * Qatorlarni bo'laklab yuboradi va natijalarni jamlaydi. `post` xato tashlasa — shu yerda to'xtaydi;
 * ungacha yuborilgani `onProgress` orqali ma'lum, keyingi chaqiruvda `resumeFrom` bilan davom ettiriladi.
 */
export async function runChunks<T>(rows: T[], size: number, post: (part: T[]) => Promise<ChunkResult>, options: RunOptions): Promise<ImportTotals> {
    let totals = options.resumeFrom || EMPTY_TOTALS;
    for (const part of chunk(rows.slice(totals.sent), size)) {
        if (options.isCancelled?.()) break;
        const result = await post(part);
        const offset = totals.sent;
        totals = {
            sent: offset + part.length,
            created: totals.created + result.created,
            duplicates: totals.duplicates + result.duplicates,
            invalid: [...totals.invalid, ...result.invalid.map(p => ({ index: p.index + offset, reason: p.reason }))],
        };
        options.onProgress(totals);
    }
    return totals;
}
