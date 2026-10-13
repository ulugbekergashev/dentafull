/**
 * Joriy sessiyani o'qish — api.ts bilan bir xil ombordan (`dentalflow_auth`).
 *
 * api.ts ichidagi fetchJson tashqariga chiqarilmagan, shuning uchun undan tashqaridagi kichik
 * so'rovlar (yordam havolasi, parolni almashtirish, xatolik haqida xabar) shu yordamchidan
 * foydalanadi: token qayerda turishini uch joyda takrorlamaslik uchun.
 */
const AUTH_KEY = 'dentalflow_auth';

export interface Session {
    /** Kirgan foydalanuvchining tokeni; kirilmagan bo'lsa — null */
    token: string | null;
    /** Demo klinika: serverga hech narsa yuborilmaydi */
    isDemo: boolean;
}

const NO_SESSION: Session = { token: null, isDemo: false };

export function readSession(): Session {
    try {
        const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
        if (!raw) return NO_SESSION;
        const parsed = JSON.parse(raw);
        return {
            token: typeof parsed?.token === 'string' && parsed.token ? parsed.token : null,
            isDemo: parsed?.isDemo === true,
        };
    } catch {
        // Xotira yopiq (shaxsiy rejim) yoki yozuv buzilgan — kirilmagan deb hisoblanadi
        return NO_SESSION;
    }
}

export function jsonHeaders(token?: string | null): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
