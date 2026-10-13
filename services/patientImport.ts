/**
 * Bemorlarni fayldan yuklash — tashqi dunyo bilan ishlaydigan qism: faylni o'qish (xlsx),
 * serverga bo'laklab yuborish, namuna va xato qatorlar faylini yuklab berish.
 * Sof mantiq (ustunlarni tanish, ismni ajratish, sanalar) — `utils/patientImportParse.ts` da.
 */
import * as XLSX from 'xlsx';
import { API_URL, DEMO_UNAVAILABLE, getActiveBranchId, isDemoMode } from './api';
import {
    Cell, ChunkResult, ImportProblem, ImportRow, ImportTotals, MAX_FILE_ROWS, RunOptions, SheetData,
    excelSerialToISO, isoToLocal, runChunks,
} from '../utils/patientImportParse';

/** Server bir so'rovda 1000 tagacha qabul qiladi; 500 — jarayon chizig'i ravon yurishi uchun */
export const IMPORT_CHUNK_SIZE = 500;
/** Javob shu vaqt ichida kelmasa so'rov to'xtatiladi — oyna "yuklanmoqda" holatida qotib qolmasin */
const REQUEST_TIMEOUT_MS = 60000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILE_COLUMNS = 200;
const AUTH_STORAGE_KEY = 'dentalflow_auth';
const MAX_COLUMN_WIDTH = 40;
const MAX_SHEET_NAME = 31;

// Xabarlar o'zbekcha saqlanadi; ekranda `tLabel` orqali tanlangan tilga o'giriladi
export const IMPORT_ERRORS = {
    unreadable: "Faylni o'qib bo'lmadi. Excel (.xlsx, .xls) yoki CSV fayl tanlang",
    tooBig: 'Fayl juda katta. Uni bir nechta kichikroq faylga bo\'lib yuklang',
    offline: "Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring",
    failed: "Yuklab bo'lmadi. Birozdan keyin qayta urinib ko'ring",
};

/** `services/api.ts` dagi fetchJson kabi: token, faol filial, yangilangan token, tugagan sessiya */
async function postImport(rows: ImportRow[], dryRun: boolean): Promise<ChunkResult> {
    // Demo butunlay brauzerda ishlaydi — so'rov production API'ga "demo-token" bilan ketmasin
    if (isDemoMode()) throw new Error(DEMO_UNAVAILABLE);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const storedAuth = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedAuth) {
        try {
            const { token } = JSON.parse(storedAuth);
            if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
            // Buzilgan yozuv — tokensiz so'rov 401 oladi va sessiya pastda yopiladi
        }
    }
    const branchId = getActiveBranchId();
    if (branchId) headers['X-Branch-Id'] = branchId;

    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        response = await fetch(`${API_URL}/patients/import`, {
            method: 'POST', headers, body: JSON.stringify({ rows, dryRun }), signal: controller.signal,
        });
    } catch {
        // Tarmoq uzildi yoki javob kelmadi. Qayta yuborish xavfsiz: yozilgan bemorlar takror deb o'tkaziladi
        throw new Error(IMPORT_ERRORS.offline);
    } finally {
        clearTimeout(timer);
    }

    const refreshedToken = response.headers.get('X-Refreshed-Token');
    if (refreshedToken) {
        try {
            const store = sessionStorage.getItem(AUTH_STORAGE_KEY) ? sessionStorage : localStorage;
            const raw = store.getItem(AUTH_STORAGE_KEY);
            if (raw) store.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...JSON.parse(raw), token: refreshedToken }));
        } catch {
            // Saqlab bo'lmasa ham muammo yo'q — eski token muddati tugaguncha ishlaydi
        }
    }

    const data = await response.json().catch(() => ({}));
    const tokenRejected = response.status === 403 && typeof data?.error === 'string' && data.error.includes('Token yaroqsiz');
    if (response.status === 401 || tokenRejected) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        window.dispatchEvent(new Event('auth:unauthorized'));
        throw new Error('Session expired');
    }
    if (!response.ok) throw new Error(typeof data?.error === 'string' && data.error ? data.error : IMPORT_ERRORS.failed);

    // Server javobiga ham ko'r-ko'rona ishonmaymiz: shakli boshqacha bo'lsa "0 ta qo'shildi" deb aldamaymiz
    if (typeof data?.created !== 'number' || typeof data?.duplicates !== 'number') throw new Error(IMPORT_ERRORS.failed);
    const invalid: ImportProblem[] = Array.isArray(data?.invalid)
        ? data.invalid
            .filter((p: any) => p && Number.isInteger(p.index) && p.index >= 0 && p.index < rows.length)
            .map((p: any) => ({ index: p.index, reason: String(p.reason || '') }))
        : [];
    return { created: data.created, duplicates: data.duplicates, invalid };
}

/**
 * Qatorlarni 500 tadan yuboradi. `dryRun` — server hech narsa yozmaydi, faqat natijani aytadi.
 * Xato bo'lsa tashlaydi; shu paytgacha yuborilgani `onProgress` orqali ma'lum, `resumeFrom` bilan davom ettiriladi.
 */
export function runImport(rows: ImportRow[], dryRun: boolean, options: RunOptions): Promise<ImportTotals> {
    return runChunks(rows, IMPORT_CHUNK_SIZE, part => postImport(part, dryRun), options);
}

/** CSV odatda UTF-8, Excel'dan saqlangani esa ko'pincha Windows-1251 (kirill) */
function decodeText(buffer: ArrayBuffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder('windows-1251').decode(buffer);
    }
}

/**
 * Varaq qatorlari: 0-indeks — Excel'dagi 1-qator. Chegara haqiqiy to'ldirilgan kataklardan
 * olinadi: faqat bezak berilgan bo'sh qatorlar (ba'zan milliontagacha) hisobga kirmaydi.
 * Sana formatidagi kataklar "12.04.1985" ko'rinishida olinadi: Excel ularni son (kun raqami)
 * qilib saqlaydi, foydalanuvchi esa ustun namunasida "31149" emas, sanani ko'rishi kerak.
 */
function sheetRows(sheet: XLSX.WorkSheet): Cell[][] {
    let lastRow = -1;
    let lastCol = -1;
    const dates = new Map<string, string>();
    for (const address of Object.keys(sheet)) {
        if (address.startsWith('!')) continue;
        const cell = sheet[address];
        const value = cell?.v;
        if (value === undefined || value === null || value === '') continue;
        const { r, c } = XLSX.utils.decode_cell(address);
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
        if (cell.t === 'n' && typeof value === 'number' && cell.z && XLSX.SSF.is_date(String(cell.z))) {
            // Sana bo'la olmaydigan son (vaqt, yoki sana formati berilgan telefon) o'z holicha qoladi
            const iso = excelSerialToISO(value);
            if (iso) dates.set(`${r}:${c}`, isoToLocal(iso));
        }
    }
    if (lastRow < 0) return [];
    if (lastRow > MAX_FILE_ROWS + 100) throw new Error(IMPORT_ERRORS.tooBig);
    // Uzoqdagi bitta katak (masalan XFD ustunida) butun jadvalni 16 ming ustunli qilib yubormasin
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
        header: 1, raw: true, defval: null, blankrows: true,
        range: { s: { r: 0, c: 0 }, e: { r: lastRow, c: Math.min(lastCol, MAX_FILE_COLUMNS - 1) } },
    });
    return dates.size === 0 ? rows : rows.map((row, r) => row.map((value, c) => dates.get(`${r}:${c}`) ?? value));
}

/** Faylni brauzerda o'qiydi (serverga yuborilmaydi). Bo'sh varaqlar tashlab ketiladi */
export async function readImportFile(file: File): Promise<SheetData[]> {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error(IMPORT_ERRORS.unreadable);
    if (file.size > MAX_FILE_BYTES) throw new Error(IMPORT_ERRORS.tooBig);
    let workbook: XLSX.WorkBook;
    try {
        const buffer = await file.arrayBuffer();
        // CSV'da `raw` — "12.04.1985" va "+998..." o'zgarmasdan matn bo'lib qoladi (aks holda sana amerikacha o'qiladi).
        // Excel'da `cellNF` — katak formati saqlanadi, sana kataklarini sondan ajratish uchun.
        workbook = /\.csv$/i.test(file.name)
            ? XLSX.read(decodeText(buffer), { type: 'string', raw: true })
            : XLSX.read(buffer, { type: 'array', cellNF: true });
    } catch {
        throw new Error(IMPORT_ERRORS.unreadable);
    }
    return workbook.SheetNames
        .map(name => ({ name, rows: sheetRows(workbook.Sheets[name]) }))
        .filter(sheet => sheet.rows.length > 0);
}

/** Jadvalni .xlsx qilib yuklab beradi (namuna fayl va xato qatorlar uchun) */
export function downloadRowsAsXlsx(rows: (string | number)[][], fileName: string, sheetName: string): void {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    sheet['!cols'] = Array.from({ length: width }, (_, i) => ({
        wch: Math.min(MAX_COLUMN_WIDTH, rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), 6) + 2),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, MAX_SHEET_NAME));
    XLSX.writeFile(book, fileName);
}
