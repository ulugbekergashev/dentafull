import { API_URL, isDemoMode } from './api';

// ─── Yordam boti: superadmin so'rovlari ──────────────────────────────────────
// services/api.ts ga tegilmagan: u yerdagi fetchJson eksport qilinmaydi, shuning
// uchun so'rov shu faylda o'zi yig'iladi. Qoidalar o'sha bilan bir xil:
//   • token `dentalflow_auth` dan olinadi (sessionStorage, keyin localStorage);
//   • 401 (yoki "Token yaroqsiz" li 403) — sessiya tugagan: saqlangan kirish
//     o'chiriladi va `auth:unauthorized` hodisasi ilovani login sahifasiga qaytaradi;
//   • server yangilagan token (X-Refreshed-Token) jimgina saqlanadi.
//
// Javoblar shu yerda tartibga solinadi (massiv bo'lmasa — bo'sh massiv, son
// bo'lmasa — 0): ekran kutilmagan shakldagi javobdan oq sahifaga aylanmasligi kerak.

const AUTH_KEY = 'dentalflow_auth';

// ─── Tiplar ──────────────────────────────────────────────────────────────────

export type SupportMode = 'off' | 'draft' | 'auto';
/** Mavzu sozlamasi: 'rule' — odatdagi tartib, qolgani — qo'lda belgilangan */
export type SupportCategorySetting = 'rule' | 'auto' | 'draft';
export type SupportTicketStatus = 'open' | 'waiting_operator' | 'human' | 'resolved' | 'closed';
export type SupportDiagKind =
    | 'bot_down' | 'bot_up' | 'bot_error' | 'login_failed'
    | 'automation_skip' | 'client_error' | 'server_error';

export interface SupportStats {
    tickets: number;
    botResolved: number;
    humanResolved: number;
    open: number;
    waiting: number;
    /** 0..1 */
    autoRate: number;
    positive: number;
    negative: number;
    avgFirstReplySec: number;
}

export interface SupportCategoryRow {
    category: string;
    label: string;
    total: number;
    drafts: number;
    unedited: number;
    /** 0..1, qoralama bo'lmagan bo'lsa null */
    acceptRate: number | null;
    mode: 'auto' | 'draft';
    setting: SupportCategorySetting;
}

export interface SupportOverview {
    configured: boolean;
    botUsername: string | null;
    operatorLinked: boolean;
    mode: SupportMode;
    stats: SupportStats;
    byCategory: SupportCategoryRow[];
    topArticles: { id: string; title: string; uses: number }[];
    unanswered: { text: string; createdAt: string; ticketId: string }[];
}

export interface SupportTicket {
    id: string;
    code: string;
    clinicId: string | null;
    clinicName: string | null;
    userName: string | null;
    role: string | null;
    category: string | null;
    categoryLabel: string | null;
    status: SupportTicketStatus;
    subject: string | null;
    rating: number | string | null;
    resolvedBy: string | null;
    createdAt: string;
    updatedAt: string;
    lastText: string | null;
}

export interface SupportTicketList {
    total: number;
    pageSize: number;
    items: SupportTicket[];
}

export interface SupportTicketUser {
    chatId: string | number | null;
    tgName: string | null;
    tgUsername: string | null;
    phone: string | null;
    clinicName: string | null;
    role: string | null;
    staffName: string | null;
    verifiedVia: string | null;
}

export interface SupportMessage {
    id: string;
    direction: 'in' | 'out';
    author: 'user' | 'bot' | 'operator' | 'system';
    kind: 'text' | 'voice' | 'photo' | 'document' | 'draft' | 'card';
    text: string | null;
    state: string | null;
    createdAt: string;
}

export interface SupportTicketDetail {
    ticket: SupportTicket;
    user: SupportTicketUser;
    messages: SupportMessage[];
}

export interface SupportArticle {
    id: string;
    module: string;
    /** ['*'] — hammaga; aks holda rollar ro'yxati */
    roles: string[];
    titleUz: string;
    titleRu: string;
    bodyUz: string;
    bodyRu: string;
    keywords: string[];
    paths: string[];
    guideId: string | null;
    source: 'seed' | 'learned';
    active: boolean;
    uses: number;
    updatedAt: string | null;
}

/** PUT /articles/:id tanasi — faqat tahrirlanadigan maydonlar */
export type SupportArticleInput = Pick<
    SupportArticle,
    'module' | 'roles' | 'titleUz' | 'titleRu' | 'bodyUz' | 'bodyRu' | 'keywords' | 'paths' | 'guideId' | 'active'
>;

export interface SupportSettings {
    mode: SupportMode;
    categoryModes: Record<string, SupportCategorySetting>;
    trustDays: number;
    payInfoUz: string;
    payInfoRu: string;
    quietFrom: number;
    quietTo: number;
    proactive: boolean;
}

export interface SupportCategory {
    id: string;
    label: string;
}

export interface SupportSettingsBundle {
    settings: SupportSettings;
    categories: SupportCategory[];
}

export interface SupportPayment {
    id: string;
    clinicId: string | null;
    clinicName: string | null;
    kind: 'payment' | 'trust';
    months: number | null;
    days: number | null;
    amount: number | null;
    fromExpiry: string | null;
    toExpiry: string | null;
    approvedBy: string | null;
    note: string | null;
    createdAt: string;
}

export interface SupportDiagEvent {
    id: string;
    clinicId: string | null;
    clinicName: string | null;
    kind: string;
    subject: string | null;
    message: string | null;
    count: number;
    createdAt: string;
    lastAt: string | null;
}

// ─── Xato ────────────────────────────────────────────────────────────────────

/**
 * Ekran xatoni tarjima qilib ko'rsatishi uchun turi alohida beriladi:
 *   network — serverga yetib bo'lmadi;
 *   session — kirish muddati tugagan (ilova o'zi login sahifasiga o'tadi);
 *   demo    — demo rejimida server yo'q;
 *   server  — server javob berdi, lekin rad etdi (`message` — server matni, bo'lmasa bo'sh).
 */
export type SupportApiErrorKind = 'network' | 'session' | 'demo' | 'server';

export interface SupportApiError extends Error {
    kind: SupportApiErrorKind;
    status: number;
}

const makeError = (kind: SupportApiErrorKind, message = '', status = 0): SupportApiError =>
    Object.assign(new Error(message), { name: 'SupportApiError', kind, status });

export const isSupportApiError = (err: unknown): err is SupportApiError =>
    err instanceof Error && err.name === 'SupportApiError';

// ─── So'rov ──────────────────────────────────────────────────────────────────

const authStore = (): Storage => (sessionStorage.getItem(AUTH_KEY) ? sessionStorage : localStorage);

function readToken(): string | null {
    try {
        const raw = authStore().getItem(AUTH_KEY);
        const token = raw ? JSON.parse(raw)?.token : null;
        return typeof token === 'string' && token ? token : null;
    } catch {
        return null;
    }
}

function saveRefreshedToken(token: string): void {
    try {
        const store = authStore();
        const raw = store.getItem(AUTH_KEY);
        if (!raw) return;
        store.setItem(AUTH_KEY, JSON.stringify({ ...JSON.parse(raw), token }));
    } catch {
        // Saqlab bo'lmasa ham eski token muddati tugaguncha ishlaydi
    }
}

function expireSession(): void {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new Event('auth:unauthorized'));
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Server xato matnini `error` yoki `message` maydonida beradi */
const serverMessage = (data: unknown): string => {
    if (!data || typeof data !== 'object') return '';
    const body = data as Record<string, unknown>;
    return text(body.error) || text(body.message);
};

const isSessionExpired = (status: number, data: unknown): boolean =>
    status === 401 || (status === 403 && serverMessage(data).includes('Token yaroqsiz'));

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
}

async function request(path: string, options: RequestOptions = {}): Promise<Record<string, unknown>> {
    // Demo butunlay brauzerda ishlaydi: so'rov ketsa "demo-token" 401 olib,
    // foydalanuvchini tizimdan chiqarib yuborardi.
    if (isDemoMode()) throw makeError('demo');

    const token = readToken();
    let response: Response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method: options.method ?? 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
            signal: options.signal,
        });
    } catch (err) {
        // Bekor qilingan so'rov xato emas — chaqiruvchi uni o'zi e'tiborsiz qoldiradi
        if (options.signal?.aborted) throw err;
        throw makeError('network');
    }

    const refreshed = response.headers.get('X-Refreshed-Token');
    if (refreshed) saveRefreshedToken(refreshed);

    const data: unknown = await response.json().catch(() => null);

    if (isSessionExpired(response.status, data)) {
        expireSession();
        throw makeError('session', '', response.status);
    }
    const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!response.ok || !body || body.success === false) {
        throw makeError('server', serverMessage(data), response.status);
    }
    return body;
}

const query = (params: Record<string, string | number | null | undefined>): string => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    const encoded = search.toString();
    return encoded ? `?${encoded}` : '';
};

// ─── Javobni tartibga solish ─────────────────────────────────────────────────

const num = (value: unknown, fallback = 0): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const nullableNum = (value: unknown): number | null =>
    value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const nullableText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Massiv, JSON-massiv yoki vergulli satr — baribir satrlar ro'yxatiga aylanadi */
const stringList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    if (typeof value !== 'string' || !value.trim()) return [];
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
        try { return stringList(JSON.parse(trimmed)); } catch { /* oddiy satr sifatida o'qiladi */ }
    }
    return trimmed.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
};

const toStats = (value: unknown): SupportStats => {
    const raw = record(value);
    return {
        tickets: num(raw.tickets),
        botResolved: num(raw.botResolved),
        humanResolved: num(raw.humanResolved),
        open: num(raw.open),
        waiting: num(raw.waiting),
        autoRate: num(raw.autoRate),
        positive: num(raw.positive),
        negative: num(raw.negative),
        avgFirstReplySec: num(raw.avgFirstReplySec),
    };
};

const toMode = (value: unknown): SupportMode => (value === 'auto' || value === 'draft' ? value : 'off');

const toCategorySetting = (value: unknown): SupportCategorySetting =>
    value === 'auto' || value === 'draft' ? value : 'rule';

const toOverview = (body: Record<string, unknown>): SupportOverview => ({
    configured: body.configured === true,
    botUsername: nullableText(body.botUsername),
    operatorLinked: body.operatorLinked === true,
    mode: toMode(body.mode),
    stats: toStats(body.stats),
    byCategory: list<Record<string, unknown>>(body.byCategory).map(row => ({
        category: text(row.category),
        label: text(row.label) || text(row.category),
        total: num(row.total),
        drafts: num(row.drafts),
        unedited: num(row.unedited),
        acceptRate: nullableNum(row.acceptRate),
        mode: row.mode === 'auto' ? 'auto' : 'draft',
        setting: toCategorySetting(row.setting),
    })),
    topArticles: list<Record<string, unknown>>(body.topArticles).map(row => ({
        id: text(row.id),
        title: text(row.title) || text(row.id),
        uses: num(row.uses),
    })),
    unanswered: list<Record<string, unknown>>(body.unanswered).map(row => ({
        text: text(row.text),
        createdAt: text(row.createdAt),
        ticketId: text(row.ticketId),
    })),
});

const toTicket = (value: unknown): SupportTicket => {
    const raw = record(value);
    return {
        id: text(raw.id),
        code: text(raw.code),
        clinicId: nullableText(raw.clinicId),
        clinicName: nullableText(raw.clinicName),
        userName: nullableText(raw.userName),
        role: nullableText(raw.role),
        category: nullableText(raw.category),
        categoryLabel: nullableText(raw.categoryLabel),
        status: (text(raw.status) || 'open') as SupportTicketStatus,
        subject: nullableText(raw.subject),
        rating: typeof raw.rating === 'number' || typeof raw.rating === 'string' ? raw.rating : null,
        resolvedBy: nullableText(raw.resolvedBy),
        createdAt: text(raw.createdAt),
        updatedAt: text(raw.updatedAt) || text(raw.createdAt),
        lastText: nullableText(raw.lastText),
    };
};

const toTicketUser = (value: unknown): SupportTicketUser => {
    const raw = record(value);
    return {
        chatId: typeof raw.chatId === 'string' || typeof raw.chatId === 'number' ? raw.chatId : null,
        tgName: nullableText(raw.tgName),
        tgUsername: nullableText(raw.tgUsername),
        phone: nullableText(raw.phone),
        clinicName: nullableText(raw.clinicName),
        role: nullableText(raw.role),
        staffName: nullableText(raw.staffName),
        verifiedVia: nullableText(raw.verifiedVia),
    };
};

const toMessage = (value: unknown, index: number): SupportMessage => {
    const raw = record(value);
    return {
        id: text(raw.id) || `message-${index}`,
        direction: raw.direction === 'out' ? 'out' : 'in',
        author: (text(raw.author) || 'user') as SupportMessage['author'],
        kind: (text(raw.kind) || 'text') as SupportMessage['kind'],
        text: nullableText(raw.text),
        state: nullableText(raw.state),
        createdAt: text(raw.createdAt),
    };
};

const toArticle = (value: unknown): SupportArticle => {
    const raw = record(value);
    const roles = stringList(raw.roles);
    return {
        id: text(raw.id),
        module: text(raw.module) || 'general',
        roles: roles.length === 0 || roles.includes('*') ? ['*'] : roles,
        titleUz: text(raw.titleUz),
        titleRu: text(raw.titleRu),
        bodyUz: text(raw.bodyUz),
        bodyRu: text(raw.bodyRu),
        keywords: stringList(raw.keywords),
        paths: stringList(raw.paths),
        guideId: nullableText(raw.guideId),
        source: raw.source === 'learned' ? 'learned' : 'seed',
        active: raw.active !== false,
        uses: num(raw.uses),
        updatedAt: nullableText(raw.updatedAt),
    };
};

const toSettings = (value: unknown): SupportSettings => {
    const raw = record(value);
    return {
        mode: toMode(raw.mode),
        categoryModes: Object.fromEntries(
            Object.entries(record(raw.categoryModes)).map(([category, setting]) => [category, toCategorySetting(setting)]),
        ),
        trustDays: num(raw.trustDays),
        payInfoUz: text(raw.payInfoUz),
        payInfoRu: text(raw.payInfoRu),
        quietFrom: num(raw.quietFrom),
        quietTo: num(raw.quietTo),
        proactive: raw.proactive === true,
    };
};

const toPayment = (value: unknown): SupportPayment => {
    const raw = record(value);
    return {
        id: text(raw.id),
        clinicId: nullableText(raw.clinicId),
        clinicName: nullableText(raw.clinicName),
        kind: raw.kind === 'trust' ? 'trust' : 'payment',
        months: nullableNum(raw.months),
        days: nullableNum(raw.days),
        amount: nullableNum(raw.amount),
        fromExpiry: nullableText(raw.fromExpiry),
        toExpiry: nullableText(raw.toExpiry),
        approvedBy: nullableText(raw.approvedBy),
        note: nullableText(raw.note),
        createdAt: text(raw.createdAt),
    };
};

const toDiagEvent = (value: unknown): SupportDiagEvent => {
    const raw = record(value);
    return {
        id: text(raw.id),
        clinicId: nullableText(raw.clinicId),
        clinicName: nullableText(raw.clinicName),
        kind: text(raw.kind),
        subject: nullableText(raw.subject),
        message: nullableText(raw.message),
        count: Math.max(1, num(raw.count, 1)),
        createdAt: text(raw.createdAt),
        lastAt: nullableText(raw.lastAt),
    };
};

/** Server rollarni '*' yoki massiv ko'rinishida kutadi (backend/support/kbTypes.ts) */
const articleBody = (input: SupportArticleInput): Record<string, unknown> => ({
    ...input,
    roles: input.roles.includes('*') ? '*' : input.roles,
});

// ─── So'rovlar ───────────────────────────────────────────────────────────────

const BASE = '/admin/support';
const idPath = (id: string): string => encodeURIComponent(id);

export const supportAdmin = {
    overview: async (days: number, signal?: AbortSignal): Promise<SupportOverview> =>
        toOverview(await request(`${BASE}/overview${query({ days })}`, { signal })),

    tickets: async (
        params: { status?: string; q?: string; page?: number },
        signal?: AbortSignal,
    ): Promise<SupportTicketList> => {
        const body = await request(`${BASE}/tickets${query(params)}`, { signal });
        const items = list<unknown>(body.items).map(toTicket);
        return {
            items,
            total: num(body.total, items.length),
            pageSize: Math.max(1, num(body.pageSize, items.length || 1)),
        };
    },

    ticket: async (id: string, signal?: AbortSignal): Promise<SupportTicketDetail> => {
        const body = await request(`${BASE}/tickets/${idPath(id)}`, { signal });
        return {
            ticket: toTicket(body.ticket),
            user: toTicketUser(body.user),
            messages: list<unknown>(body.messages).map(toMessage),
        };
    },

    closeTicket: async (id: string): Promise<void> => {
        await request(`${BASE}/tickets/${idPath(id)}/close`, { method: 'POST' });
    },

    articles: async (params: { q?: string; module?: string }, signal?: AbortSignal): Promise<SupportArticle[]> => {
        const body = await request(`${BASE}/articles${query(params)}`, { signal });
        return list<unknown>(body.items).map(toArticle);
    },

    /** Kod yangi bo'lsa server maqolani yaratadi, bor bo'lsa — yangilaydi */
    saveArticle: async (id: string, input: SupportArticleInput): Promise<SupportArticle> => {
        const body = await request(`${BASE}/articles/${idPath(id)}`, { method: 'PUT', body: articleBody(input) });
        return toArticle({ id, ...input, ...record(body.article) });
    },

    /** O'chirmaydi — maqolani o'chirib qo'yadi (bot undan foydalanmaydi) */
    disableArticle: async (id: string): Promise<void> => {
        await request(`${BASE}/articles/${idPath(id)}`, { method: 'DELETE' });
    },

    settings: async (signal?: AbortSignal): Promise<SupportSettingsBundle> => {
        const body = await request(`${BASE}/settings`, { signal });
        return {
            settings: toSettings(body.settings),
            categories: list<Record<string, unknown>>(body.categories)
                .map(row => ({ id: text(row.id), label: text(row.label) || text(row.id) }))
                .filter(row => row.id),
        };
    },

    /** Faqat o'zgargan maydonlar yuboriladi; javobda sozlamalarning to'liq yangi holati qaytadi */
    saveSettings: async (patch: Partial<SupportSettings>): Promise<SupportSettings> => {
        const body = await request(`${BASE}/settings`, { method: 'PUT', body: patch });
        // Server javobga sozlamalarni qo'shmagan bo'lsa, ekranda standart qiymatlar
        // ko'rinib qolmasin — haqiqiy holat qayta o'qiladi.
        if (!body.settings || typeof body.settings !== 'object') return (await supportAdmin.settings()).settings;
        return toSettings(body.settings);
    },

    payments: async (params: { clinicId?: string }, signal?: AbortSignal): Promise<SupportPayment[]> => {
        const body = await request(`${BASE}/payments${query(params)}`, { signal });
        return list<unknown>(body.items).map(toPayment);
    },

    diag: async (
        params: { clinicId?: string; kind?: string; days?: number },
        signal?: AbortSignal,
    ): Promise<SupportDiagEvent[]> => {
        const body = await request(`${BASE}/diag${query(params)}`, { signal });
        return list<unknown>(body.items).map(toDiagEvent);
    },

    /** Asoschining Telegramini botga operator qilib ulaydigan bir martalik havola */
    operatorLink: async (): Promise<string> => {
        const body = await request('/support/link', { method: 'POST' });
        return text(body.url);
    },
};
