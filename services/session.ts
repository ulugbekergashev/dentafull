/**
 * Joriy sessiyani o'qish — api.ts bilan bir xil ombordan (`dentalflow_auth`).
 *
 * api.ts ichidagi fetchJson tashqariga chiqarilmagan, shuning uchun undan tashqaridagi kichik
 * so'rovlar (yordam havolasi, parolni almashtirish, xatolik haqida xabar) shu yordamchidan
 * foydalanadi: token qayerda turishini uch joyda takrorlamaslik uchun.
 */
import { readAuth } from './authStore';

export interface Session {
    /** Kirgan foydalanuvchining tokeni; kirilmagan bo'lsa — null */
    token: string | null;
    /** Demo klinika: serverga hech narsa yuborilmaydi */
    isDemo: boolean;
}

const NO_SESSION: Session = { token: null, isDemo: false };

export function readSession(): Session {
    // Xotira yopiq (shaxsiy rejim) yoki yozuv buzilgan bo'lsa — kirilmagan deb hisoblanadi
    const parsed = readAuth<{ token?: unknown; isDemo?: unknown }>();
    if (!parsed) return NO_SESSION;
    return {
        token: typeof parsed.token === 'string' && parsed.token ? parsed.token : null,
        isDemo: parsed.isDemo === true,
    };
}

export function jsonHeaders(token?: string | null): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
