// Yordam boti sozlamalari. PlatformSetting'da saqlanadi (migratsiyasiz),
// super admin panelidagi Support → Sozlamalar bo'limidan o'zgartiriladi.

import { safeJson } from './text';

export type SupportMode = 'off' | 'draft' | 'auto';
export type CategoryMode = 'rule' | 'auto' | 'draft';

export interface SupportSettings {
    /**
     * off   — bot javob bermaydi, faqat murojaatni operatorga uzatadi
     * draft — bot javobni tayyorlaydi, operator bir tugma bilan yuboradi
     * auto  — ishonch qozongan mavzularda bot o'zi javob beradi
     */
    mode: SupportMode;
    /** Mavzu bo'yicha qo'lda belgilash; 'rule' — natijaga qarab o'zi o'tadi */
    categoryModes: Record<string, CategoryMode>;
    /** Chek yuborilganda muddati tugagan klinika necha kunga ochiladi (0 — o'chirilgan) */
    trustDays: number;
    /** To'lov qanday qilinishi — bot mijozga shu matnni aytadi */
    payInfoUz: string;
    payInfoRu: string;
    /** Bot o'zi yozadigan (ogohlantirish) soatlar, Toshkent vaqti */
    quietFrom: number;
    quietTo: number;
    proactive: boolean;
}

export const DEFAULT_SETTINGS: SupportSettings = {
    mode: 'draft',
    categoryModes: {},
    trustDays: 2,
    payInfoUz: '',
    payInfoRu: '',
    quietFrom: 9,
    quietTo: 21,
    proactive: true,
};

export const CATEGORIES: { id: string; label: string }[] = [
    { id: 'howto', label: 'Qanday qilish' },
    { id: 'messaging', label: 'SMS va Telegram xabarlar' },
    { id: 'subscription', label: "Obuna va to'lov" },
    { id: 'access', label: 'Kirish va parol' },
    { id: 'permissions', label: 'Ruxsatlar' },
    { id: 'data', label: "Kim nimani o'zgartirgani" },
    { id: 'bug', label: 'Xatolik' },
    { id: 'presales', label: 'Yangi mijoz' },
    { id: 'other', label: 'Boshqa' },
];

export const categoryLabel = (id: string): string => CATEGORIES.find(c => c.id === id)?.label || id;

const SETTINGS_KEY = 'support:settings';
const OPERATOR_KEY = 'support:operator_chat';
const CACHE_MS = 30_000;

const clampInt = (v: any, min: number, max: number, fallback: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Tashqaridan kelgan qiymatlarni tozalaydi: noma'lum maydon va noto'g'ri tur o'tmaydi */
export const sanitizeSettings = (raw: any, base: SupportSettings = DEFAULT_SETTINGS): SupportSettings => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const categoryModes: Record<string, CategoryMode> = {};
    const known = new Set(CATEGORIES.map(c => c.id));
    for (const [k, v] of Object.entries(r.categoryModes ?? base.categoryModes ?? {})) {
        if (known.has(k) && (v === 'auto' || v === 'draft')) categoryModes[k] = v;
    }
    let quietFrom = clampInt(r.quietFrom ?? base.quietFrom, 0, 23, base.quietFrom);
    let quietTo = clampInt(r.quietTo ?? base.quietTo, 1, 24, base.quietTo);
    // Tungi oraliq (masalan 22 → 6) qo'llab-quvvatlanmaydi: noto'g'ri tartib botni butunlay jim qilib qo'yardi
    if (quietFrom >= quietTo) { quietFrom = DEFAULT_SETTINGS.quietFrom; quietTo = DEFAULT_SETTINGS.quietTo; }
    return {
        mode: r.mode === 'off' || r.mode === 'draft' || r.mode === 'auto' ? r.mode : base.mode,
        categoryModes,
        trustDays: clampInt(r.trustDays ?? base.trustDays, 0, 14, base.trustDays),
        payInfoUz: String(r.payInfoUz ?? base.payInfoUz).slice(0, 1500),
        payInfoRu: String(r.payInfoRu ?? base.payInfoRu).slice(0, 1500),
        quietFrom,
        quietTo,
        proactive: r.proactive === undefined ? base.proactive : !!r.proactive,
    };
};

export const createSettings = (db: any) => {
    let cache: { at: number; value: SupportSettings } | null = null;
    let operatorCache: { at: number; value: string | null } | null = null;

    /** null — qiymat yo'q; undefined — bazadan o'qib bo'lmadi (keshga YOZILMAYDI) */
    const read = async (key: string): Promise<string | null | undefined> => {
        try {
            return (await db.platformSetting.findUnique({ where: { key } }))?.value ?? null;
        } catch (e: any) {
            console.warn('[support:settings] o\'qib bo\'lmadi:', e?.message);
            return undefined;
        }
    };
    const write = async (key: string, value: string) => {
        await db.platformSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value, updatedAt: new Date() },
        });
    };

    return {
        async get(): Promise<SupportSettings> {
            if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
            const raw = await read(SETTINGS_KEY);
            // Baza vaqtincha javob bermasa: oxirgi bilingan sozlama (yoki standart), 30 soniyaga keshlanmaydi —
            // aks holda bitta uzilish bot rejimini butun daqiqaga "avtomatik"ka aylantirib yuborardi
            if (raw === undefined) return cache?.value ?? DEFAULT_SETTINGS;
            const value = sanitizeSettings(safeJson(raw, {}));
            cache = { at: Date.now(), value };
            return value;
        },
        async set(patch: Partial<SupportSettings>): Promise<SupportSettings> {
            const current = await this.get();
            const next = sanitizeSettings({ ...current, ...patch }, current);
            await write(SETTINGS_KEY, JSON.stringify(next));
            cache = { at: Date.now(), value: next };
            return next;
        },
        /** Murojaatlar tushadigan chat (guruh yoki shaxsiy). Yo'q bo'lsa — null */
        async operatorChat(): Promise<string | null> {
            if (operatorCache && Date.now() - operatorCache.at < CACHE_MS) return operatorCache.value;
            const value = await read(OPERATOR_KEY);
            // O'qib bo'lmadi: "operator yo'q" deb keshlanmaydi (u botni avtomatik rejimga o'tkazib yuborardi)
            if (value === undefined) return operatorCache?.value ?? null;
            operatorCache = { at: Date.now(), value };
            return value;
        },
        async setOperatorChat(chatId: string): Promise<void> {
            const previous = await read(OPERATOR_KEY);
            await write(OPERATOR_KEY, chatId);
            operatorCache = { at: Date.now(), value: chatId };
            // Karta raqamlari chat doirasida: chat almashganda eskilari yangi chatdagi xabarlarga
            // tasodifan mos kelib, javob eski mijozga ketib qolmasin
            if (previous && previous !== chatId) {
                await db.supportMessage.updateMany({ where: { opMessageId: { not: null } }, data: { opMessageId: null } })
                    .catch((e: any) => console.warn('[support:settings] karta raqamlarini tozalab bo\'lmadi:', e?.message));
            }
        },
    };
};

export type SettingsStore = ReturnType<typeof createSettings>;
