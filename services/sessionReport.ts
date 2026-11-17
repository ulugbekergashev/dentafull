/**
 * Ilova sessiyani yopib, login sahifasiga qaytarishdan oldin serverga qisqa hisobot yuboradi
 * (POST /session-ended → DiagEvent 'session_end').
 *
 * Nega: "kiraman-u, darrov chiqarib yuboradi" shikoyatida (2026-11-17, jamoliddin_dentist PWA'da
 * 4 daqiqada 14 marta kirgan) server faqat "token berildi" deb biladi, ilova nega chiqarganini
 * hech kim ko'rmasdi. Endi ko'rinadi: token yo'q edimi yoki server rad etdimi, kirish yozuvi
 * qayerda turgan, PWA'danmi, kirgandan necha soniya o'tgan, sahifa qaysi versiyada.
 *
 * Bemor ma'lumoti yuborilmaydi. Hech qachon xato tashlamaydi va chiqishni kechiktirmaydi.
 * Localhost'da yuborilmaydi (sinash uchun: localStorage.setItem('denta_error_report', '1')).
 */
import { authDiagnostics, authPlace } from './authStore';

/** weak_storage — kirish yozuvi faqat oyna yoki sahifa xotirasiga sig'di: qayta yuklansa yo'qoladi */
export type SessionEndReason = 'no_token' | 'rejected' | 'weak_storage';

interface SessionEndInfo {
    reason: SessionEndReason;
    /** Server javobi holati (401 yoki 403) */
    status: number;
    /** Qaysi so'rovda bo'ldi (server id'larni o'zi olib tashlaydi) */
    path: string;
    /** So'rovda ishlatilgan token: muddati o'tgan bo'lsa ham server klinikani aniqlaydi */
    token: string | null;
}

const FORCE_KEY = 'denta_error_report';
/** Bir vaqtda bir nechta so'rov 401 olsa — bitta hisobot yetadi */
const ONCE_PER_MS = 5000;
let lastSentAt = 0;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

const isLocal = (): boolean => {
    try {
        if (localStorage.getItem(FORCE_KEY) === '1') return false;
    } catch { /* xotira yopiq */ }
    return LOCAL_HOSTS.includes(window.location.hostname);
};

const isStandalone = (): boolean => {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    } catch {
        return false;
    }
};

/** Sahifa yig'ilgan versiya — asosiy skript fayl nomidagi xesh */
const buildId = (): string | undefined => {
    const src = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') || '';
    return src.match(/([^/]+)\.js(?:\?|$)/)?.[1];
};

export function reportSessionEnd(apiUrl: string, info: SessionEndInfo): void {
    try {
        if (isLocal()) return;
        const now = Date.now();
        if (now - lastSentAt < ONCE_PER_MS) return;
        lastSentAt = now;
        const who = authDiagnostics();
        const body = {
            reason: info.reason,
            status: info.status,
            path: info.path.split('?')[0].slice(0, 200),
            place: authPlace(),
            standalone: isStandalone(),
            secSinceLogin: who.secSinceLogin,
            // Token bo'lmasa server shu id bo'yicha klinikani (tekshirilmagan deb) belgilaydi
            clinicId: who.clinicId,
            role: who.role,
            build: buildId(),
        };
        void fetch(`${apiUrl}/session-ended`, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                ...(info.token ? { Authorization: `Bearer ${info.token}` } : {}),
            },
            body: JSON.stringify(body),
        }).catch(() => { /* hisobot ketmasa ham chiqish davom etadi */ });
    } catch { /* hisobot — ikkilamchi */ }
}
