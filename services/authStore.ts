/**
 * Kirish ma'lumoti (`dentalflow_auth`: rol, ism, klinika, token) qayerda saqlanishini
 * bitta joyda hal qiladi. Ilova bu yozuvni faqat shu yordamchi orqali o'qiydi va yozadi.
 *
 * Nega kerak: ba'zi planshetlarda brauzer xotirasi to'lib qolgan yoki yozishga yopiq bo'ladi.
 * Ilgari login serverda muvaffaqiyatli o'tsa ham token saqlanmay, xodim login oynasida
 * qolib ketardi (2026-11-03, Osiyo Art planshetida). Endi saqlash bosqichma-bosqich:
 *   1) localStorage — sahifa yangilansa ham sessiya qoladi;
 *   2) to'lgan bo'lsa — keraksiz keshlar (eski demo, serverda ham turadigan kunlik jurnallar)
 *      tozalanib, qayta urinadi;
 *   3) bo'lmasa — sessionStorage (shu oyna yopilguncha);
 *   4) u ham bo'lmasa — sahifa xotirasi (yangilanguncha ishlaydi).
 * Eski sessionStorage yozuvi har doim o'chiriladi: o'qishda u birinchi turadi va yangi
 * kirishni eski (muddati o'tgan) token bilan bosib qo'ymasligi kerak.
 */
export const AUTH_KEY = 'dentalflow_auth';

/** Joy bo'shatishda o'chirsa bo'ladigan yozuvlar: hammasi serverda ham bor yoki eski demo */
const DISPOSABLE_KEYS = ['dentalflow_demo_data', 'dentalflow_demo_cash'];
const DISPOSABLE_PREFIXES = ['dentalflow_calls:', 'dentalflow_flow:'];

let memoryAuth: string | null = null;

export type AuthPlace = 'local' | 'session' | 'memory';

const safeGet = (store: Storage): string | null => {
    try { return store.getItem(AUTH_KEY); } catch { return null; }
};

const safeRemove = (store: Storage): void => {
    try { store.removeItem(AUTH_KEY); } catch { /* xotira yopiq — o'chiradigan narsa ham yo'q */ }
};

const trySet = (store: Storage, value: string): boolean => {
    try {
        store.setItem(AUTH_KEY, value);
        return store.getItem(AUTH_KEY) === value;
    } catch {
        return false;
    }
};

/** localStorage'dan keraksiz keshlarni o'chiradi; nechta yozuv o'chganini qaytaradi */
export function freeLocalSpace(): number {
    let removed = 0;
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) keys.push(key);
        }
        for (const key of keys) {
            if (DISPOSABLE_KEYS.includes(key) || DISPOSABLE_PREFIXES.some(p => key.startsWith(p))) {
                localStorage.removeItem(key);
                removed++;
            }
        }
    } catch { /* xotira yopiq — bo'shatib bo'lmaydi */ }
    return removed;
}

/** Saqlangan kirish yozuvi (JSON matni) yoki null */
export function readAuthRaw(): string | null {
    return memoryAuth || safeGet(sessionStorage) || safeGet(localStorage);
}

/**
 * Oxirgi ma'lum kim va qachon kirgani — sessiya yopilganda hisobotga (services/sessionReport.ts).
 * Token yo'qolgan bo'lsa ham qaysi klinika ekanini aytib berish uchun xotirada turadi.
 */
let lastIdentity: { clinicId?: string; role?: string; savedAt?: number } = {};

const rememberIdentity = (data: Record<string, any>, savedAt?: number): void => {
    lastIdentity = {
        clinicId: typeof data.clinicId === 'string' ? data.clinicId : lastIdentity.clinicId,
        role: typeof data.role === 'string' ? data.role : lastIdentity.role,
        savedAt: savedAt ?? lastIdentity.savedAt,
    };
};

/** Kirish yozuvi hozir qayerda turibdi */
export function authPlace(): AuthPlace | 'none' {
    if (memoryAuth) return 'memory';
    if (safeGet(sessionStorage)) return 'session';
    if (safeGet(localStorage)) return 'local';
    return 'none';
}

/** Hisobot uchun: oxirgi ma'lum klinika, rol va kirishdan beri necha soniya o'tgani */
export function authDiagnostics(): { clinicId: string | null; role: string | null; secSinceLogin: number | null } {
    return {
        clinicId: lastIdentity.clinicId || null,
        role: lastIdentity.role || null,
        secSinceLogin: lastIdentity.savedAt ? Math.round((Date.now() - lastIdentity.savedAt) / 1000) : null,
    };
}

/** Saqlangan kirish yozuvi obyekt ko'rinishida; yo'q yoki buzilgan bo'lsa — null */
export function readAuth<T = Record<string, any>>(): T | null {
    const raw = readAuthRaw();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        rememberIdentity(parsed);
        return parsed as T;
    } catch {
        return null;
    }
}

/** Joriy token yoki null */
export function readAuthToken(): string | null {
    const token = readAuth<{ token?: unknown }>()?.token;
    return typeof token === 'string' && token ? token : null;
}

/** Kirishdan keyin saqlaydi. Qayerga saqlanganini qaytaradi */
export function saveAuth(data: Record<string, unknown>): AuthPlace {
    const value = JSON.stringify(data);
    clearAuth();
    rememberIdentity(data, Date.now());
    if (trySet(localStorage, value)) return 'local';
    if (freeLocalSpace() > 0 && trySet(localStorage, value)) return 'local';
    if (trySet(sessionStorage, value)) return 'session';
    memoryAuth = value;
    return 'memory';
}

/** Server yangilagan tokenni sessiya turgan joyning o'zida almashtiradi */
export function updateAuthToken(token: string): void {
    const data = readAuth();
    if (!data) return;
    const value = JSON.stringify({ ...data, token });
    if (memoryAuth) { memoryAuth = value; return; }
    if (safeGet(sessionStorage)) { if (!trySet(sessionStorage, value)) memoryAuth = value; return; }
    if (!trySet(localStorage, value)) memoryAuth = value;
}

/** Chiqish yoki sessiya tugashi: hamma joydan o'chiradi */
export function clearAuth(): void {
    memoryAuth = null;
    safeRemove(sessionStorage);
    safeRemove(localStorage);
}
