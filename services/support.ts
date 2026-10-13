/**
 * Yordam: Telegram'dagi yordam boti.
 *
 * Bot serverda yoqilgan bo'lsa (GET /support/info → botUsername), "Yordam" tugmalari uni ochadi:
 * tizimga kirgan xodimga bir martalik havola beriladi (POST /support/link) — bot kim yozayotganini
 * va qaysi klinikadan ekanini o'zi biladi. Bot yoqilmagan, demo rejim yoki so'rov xatosi bo'lsa —
 * avvalgidek menejerning Telegram'i ochiladi, ya'ni tugma hech qachon "o'lik" bo'lmaydi.
 */
import { API_URL } from './api';
import { jsonHeaders, readSession } from './session';

export const SUPPORT_PHONE = '+998 90 824 29 92';
export const SUPPORT_PHONE_HREF = 'tel:+998908242992';
/** Bot yo'q paytdagi manzil — menejerning Telegram'i */
export const SUPPORT_FALLBACK_URL = 'https://t.me/dentacrm';

/** Javob kelmasa, oldindan ochilgan oyna bo'sh turib qolmasin */
const REQUEST_TIMEOUT_MS = 8000;
const BOT_USERNAME = /^[A-Za-z0-9_]{3,64}$/;
const TELEGRAM_HOSTS = ['t.me', 'telegram.me'];

export interface SupportInfo {
    /** null — bot yoqilmagan: eski havolalar ishlaydi */
    botUsername: string | null;
}

const NO_BOT: SupportInfo = { botUsername: null };

let cachedInfo: SupportInfo | null = null;
let pendingInfo: Promise<SupportInfo> | null = null;

async function request(path: string, init: { method: 'GET' | 'POST'; token?: string | null }): Promise<any> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(`${API_URL}${path}`, {
            method: init.method,
            headers: jsonHeaders(init.token),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.success !== true) throw new Error(`support request failed (${res.status})`);
        return data;
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * Bot bormi — bir marta so'raladi va sahifa yopilguncha eslab qolinadi.
 * Xato javob eslab qolinmaydi: keyingi bosishda yana so'raladi.
 */
export function getSupportInfo(): Promise<SupportInfo> {
    if (readSession().isDemo) return Promise.resolve(NO_BOT);
    if (cachedInfo) return Promise.resolve(cachedInfo);
    if (!pendingInfo) {
        pendingInfo = request('/support/info', { method: 'GET' })
            .then((data): SupportInfo => {
                const name = typeof data.botUsername === 'string' ? data.botUsername.replace(/^@/, '') : '';
                cachedInfo = BOT_USERNAME.test(name) ? { botUsername: name } : NO_BOT;
                return cachedInfo;
            })
            .catch(() => NO_BOT)
            .finally(() => { pendingInfo = null; });
    }
    return pendingInfo;
}

/** Serverdan kelgan havola faqat Telegram manzili bo'lsa ochiladi */
function telegramUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && TELEGRAM_HOSTS.includes(url.hostname) ? url.toString() : null;
    } catch {
        return null;
    }
}

/** So'rovsiz ma'lum bo'lgan manzil (demo, bot yo'qligi ma'lum, kirilmagan); aks holda null */
function knownUrl(): string | null {
    const { token, isDemo } = readSession();
    if (isDemo) return SUPPORT_FALLBACK_URL;
    if (!cachedInfo) return null;
    if (!cachedInfo.botUsername) return SUPPORT_FALLBACK_URL;
    return token ? null : `https://t.me/${cachedInfo.botUsername}`;
}

async function resolveUrl(): Promise<string> {
    try {
        const { token, isDemo } = readSession();
        if (isDemo) return SUPPORT_FALLBACK_URL;
        const { botUsername } = await getSupportInfo();
        if (!botUsername) return SUPPORT_FALLBACK_URL;
        if (!token) return `https://t.me/${botUsername}`;
        const data = await request('/support/link', { method: 'POST', token });
        return telegramUrl(data.url) ?? SUPPORT_FALLBACK_URL;
    } catch {
        return SUPPORT_FALLBACK_URL;
    }
}

/**
 * Yordamni ochadi. Faqat bosish (click) ichidan chaqiring.
 *
 * Havola so'rovdan keyin ma'lum bo'ladi, `await`dan keyin ochilgan oynani esa brauzer to'sadi.
 * Shuning uchun bo'sh oyna darhol ochiladi va manzili keyin qo'yiladi. Oyna ochilmasa
 * (to'sildi, telefonda o'rnatilgan ilova) — manzil shu oynaning o'zida ochiladi.
 * Hech qachon xato tashlamaydi.
 */
export function openSupport(): Promise<void> {
    const known = knownUrl();
    if (known) {
        window.open(known, '_blank', 'noopener,noreferrer');
        return Promise.resolve();
    }
    let popup: Window | null = null;
    try { popup = window.open('', '_blank'); } catch { popup = null; }
    return resolveUrl().then(url => {
        if (popup && !popup.closed) {
            // noopener o'rniga: bo'sh oynani o'zimiz ochdik, yangi sahifa bu oynaga qo'l uzata olmasin
            try { popup.opener = null; } catch { /* brauzer ruxsat bermasa ham havola ochiladi */ }
            popup.location.replace(url);
        } else {
            window.location.assign(url);
        }
    });
}
