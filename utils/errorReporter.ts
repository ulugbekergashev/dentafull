/**
 * Brauzerdagi xatolarni serverga yetkazish (POST /client-errors).
 *
 * Sahifa "sinib" oq ekran bo'lib qolsa, buni faqat foydalanuvchi ko'rardi. Endi kutilmagan
 * xato (window error, javobsiz qolgan promise, ErrorBoundary ushlagan xato) qisqa yozuv bo'lib
 * serverga boradi. Bu yordamchi hech qachon o'zi xato tashlamaydi va ilovani sekinlashtirmaydi:
 * daqiqasiga ko'pi bilan 5 ta yozuv, bir xil xabar bir marta yuboriladi.
 *
 * Demo rejimda va localhost'da yuborilmaydi. Localhost'da sinash uchun:
 *   localStorage.setItem('denta_error_report', '1')
 */
import { API_URL } from '../services/api';
import { jsonHeaders, readSession } from '../services/session';

export type ClientErrorSource = 'error' | 'rejection' | 'boundary';

const MAX_PER_MINUTE = 5;
const WINDOW_MS = 60 * 1000;
const MAX_MESSAGE = 500;
const MAX_STACK = 2000;
/** Bir xil xabarlar ro'yxati cheksiz o'smasin */
const MAX_REMEMBERED = 200;
const FORCE_KEY = 'denta_error_report';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** Ilovaning xatosi bo'lmagan shovqin: brauzer ogohlantirishlari, uzilgan so'rovlar */
const NOISE: RegExp[] = [
    /ResizeObserver loop/i,
    /\bAbortError\b|aborted a request|signal is aborted|operation was aborted|request aborted/i,
    // Boshqa saytdan yuklangan skript xatosi: brauzer tafsilotini bermaydi
    /^Script error\.?$/i,
    // Internet uzilgan: bu xato emas, foydalanuvchi buni o'zi ko'radi
    /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i,
    // api.ts ataylab tashlaydigan xabarlar: sessiya tugadi, demo rejim
    /^(Error: )?Session expired$/,
    /Demo rejimida/,
];
/** Brauzer kengaytmasining xatosi — xabarda yoki izda kengaytma manzili bo'ladi */
const EXTENSION = /(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;

const sentAt: number[] = [];
const remembered = new Set<string>();
let installed = false;

function isEnabled(): boolean {
    if (readSession().isDemo) return false;
    if (!LOCAL_HOSTS.includes(window.location.hostname)) return true;
    try { return localStorage.getItem(FORCE_KEY) === '1'; } catch { return false; }
}

function describe(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        const named = error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
        return { message: named || error.name || 'Error', stack: error.stack };
    }
    if (typeof error === 'string') return { message: error };
    if (error && typeof error === 'object') {
        const anyError = error as { message?: unknown; stack?: unknown };
        if (typeof anyError.message === 'string' && anyError.message) {
            return { message: anyError.message, stack: typeof anyError.stack === 'string' ? anyError.stack : undefined };
        }
        try { return { message: JSON.stringify(error) }; } catch { return { message: String(error) }; }
    }
    return { message: String(error) };
}

/** Qaysi yig'ilgan versiya: asosiy skript faylining nomi (index-AbC123) */
function buildId(): string | undefined {
    const src = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') || '';
    const match = src.match(/([^/]+)\.js(?:\?|$)/);
    return match ? match[1] : undefined;
}

/** Daqiqalik chegaradan oshmaganmi (oshmagan bo'lsa — joy band qilinadi) */
function takeSlot(now: number): boolean {
    while (sentAt.length && now - sentAt[0] >= WINDOW_MS) sentAt.shift();
    if (sentAt.length >= MAX_PER_MINUTE) return false;
    sentAt.push(now);
    return true;
}

/**
 * Xatoni serverga yuboradi. `extra` — qo'shimcha iz (masalan, React komponentlar zanjiri
 * yoki xato chiqqan fayl manzili).
 */
export function reportClientError(error: unknown, source: ClientErrorSource, extra?: string | null): void {
    try {
        if (!isEnabled()) return;
        const { message: rawMessage, stack: rawStack } = describe(error);
        const message = (rawMessage || 'Unknown error').slice(0, MAX_MESSAGE);
        const stack = [rawStack, extra].filter(Boolean).join('\n').slice(0, MAX_STACK) || undefined;
        if (NOISE.some(re => re.test(message))) return;
        if (EXTENSION.test(message) || (!!stack && EXTENSION.test(stack))) return;
        if (remembered.has(message)) return;
        if (!takeSlot(Date.now())) return;
        if (remembered.size >= MAX_REMEMBERED) remembered.clear();
        remembered.add(message);

        const body = JSON.stringify({
            message,
            stack,
            route: window.location.pathname + window.location.search,
            source,
            build: buildId(),
        });
        // keepalive — sahifa yopilayotgan bo'lsa ham yozuv yetib boradi
        fetch(`${API_URL}/client-errors`, {
            method: 'POST',
            headers: jsonHeaders(readSession().token),
            body,
            keepalive: true,
        }).catch(() => { /* server yoki internet yo'q — xatolik hisoboti ilovani to'xtatmasin */ });
    } catch {
        /* hisobotning o'zi hech qachon xato chiqarmasligi kerak */
    }
}

/** Kutilmagan xatolarni tinglashni boshlaydi (ilova ishga tushganda bir marta) */
export function initErrorReporter(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('error', (event: ErrorEvent) => {
        const where = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null;
        reportClientError(event.error ?? event.message, 'error', where);
    });
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        reportClientError(event.reason, 'rejection');
    });
}
