// ─── Mahsulot xaritasi ───────────────────────────────────────────────────────
// Yordam boti foydalanuvchini ilovaning qaysi joyiga yuborishi mumkinligi shu
// yerda yozilgan. Ikki vazifasi bor:
//
//   1. Tugmalar: bot javob ostiga "Sozlamalar → Telegram va SMS" tugmasini
//      shu ro'yxatdan chiqaradi (model havola to'qimaydi).
//   2. Nazorat: javob matnidagi "A → B" yo'llari shu ro'yxatdagi nomlar bilan
//      solishtiriladi — ilovada yo'q bo'limni aytgan javob operatorga ketadi.
//
// Nomlar i18n/translations.ts dagi bilan bir xil bo'lishi SHART: menyuda
// "Xodimlar" deb yozilgan bo'limni bot "Shifokorlar" desa, odam topa olmaydi.
// tests/support-kb.test.cjs buni frontend lug'ati bilan solishtiradi.

export type SupportLang = 'uz' | 'ru';

export type StaffRole = 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'LAB_TECHNICIAN';

export interface ProductPath {
    /** Ilovadagi manzil (domen yo'q) */
    url: string;
    /** Menyudan boshlab bosiladigan nomlar zanjiri */
    uz: string[];
    ru: string[];
    /** Shu bo'lim menyusida ko'rinadigan rollar */
    roles: StaffRole[];
}

const ALL: StaffRole[] = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];
const DESK: StaffRole[] = ['CLINIC_ADMIN', 'RECEPTIONIST'];
const OWNER: StaffRole[] = ['CLINIC_ADMIN'];

export const PRODUCT_PATHS: Record<string, ProductPath> = {
    'dashboard': { url: '/', uz: ['Bosh sahifa'], ru: ['Главная'], roles: ALL },
    'leads': { url: '/leads', uz: ['Lidlar'], ru: ['Лиды'], roles: DESK },
    'patients': { url: '/patients', uz: ['Bemorlar'], ru: ['Пациенты'], roles: ALL },
    'calendar': { url: '/calendar', uz: ['Kalendar'], ru: ['Календарь'], roles: ALL },
    'finance.kassa': { url: '/finance?tab=kassa', uz: ['Moliya', 'Kassa'], ru: ['Финансы', 'Касса'], roles: DESK },
    'finance.hisobot': { url: '/finance?tab=hisobot', uz: ['Moliya', 'Hisobot'], ru: ['Финансы', 'Отчёт'], roles: DESK },
    'staff.list': { url: '/doctors', uz: ['Xodimlar', "Ro'yxat"], ru: ['Сотрудники', 'Список'], roles: DESK },
    'staff.stats': { url: '/doctors?tab=stats', uz: ['Xodimlar', 'Statistika'], ru: ['Сотрудники', 'Статистика'], roles: DESK },
    'staff.access': { url: '/doctors?tab=access', uz: ['Xodimlar', 'Ruxsatlar'], ru: ['Сотрудники', 'Доступы'], roles: OWNER },
    'inventory': { url: '/inventory', uz: ['Ombor'], ru: ['Склад'], roles: DESK },
    'queue': { url: '/queue', uz: ['Online Navbat'], ru: ['Онлайн очередь'], roles: ALL },
    'lab': { url: '/lab', uz: ['Laboratoriya'], ru: ['Лаборатория'], roles: [...ALL, 'LAB_TECHNICIAN'] },
    // Xabarlar ichidagi tablar manzilda turmaydi — tugma bo'limning o'zini ochadi
    'messages': { url: '/messages', uz: ['Xabarlar'], ru: ['Сообщения'], roles: DESK },
    'messages.templates': { url: '/messages', uz: ['Xabarlar', 'Shablonlar'], ru: ['Сообщения', 'Шаблоны'], roles: DESK },
    'messages.auto': { url: '/messages', uz: ['Xabarlar', 'Avtomatik'], ru: ['Сообщения', 'Автоматически'], roles: DESK },
    'messages.manual': { url: '/messages', uz: ['Xabarlar', "Qo'lda"], ru: ['Сообщения', 'Вручную'], roles: DESK },
    'messages.history': { url: '/messages', uz: ['Xabarlar', 'Tarix'], ru: ['Сообщения', 'История'], roles: DESK },
    'settings.clinic': { url: '/settings?tab=clinic', uz: ['Sozlamalar', 'Klinika'], ru: ['Настройки', 'Клиника'], roles: DESK },
    'settings.branches': { url: '/settings?tab=branches', uz: ['Sozlamalar', 'Filiallar'], ru: ['Настройки', 'Филиалы'], roles: OWNER },
    'settings.services': { url: '/settings?tab=services', uz: ['Sozlamalar', 'Xizmatlar va narxlar'], ru: ['Настройки', 'Услуги и цены'], roles: DESK },
    'settings.features': { url: '/settings?tab=features', uz: ['Sozlamalar', 'Maxsus imkoniyatlar'], ru: ['Настройки', 'Дополнительные возможности'], roles: DESK },
    'settings.messaging': { url: '/settings?tab=messaging', uz: ['Sozlamalar', 'Integratsiyalar', 'Telegram va SMS'], ru: ['Настройки', 'Интеграции', 'Telegram и SMS'], roles: DESK },
    'settings.dhp': { url: '/settings?tab=dmed', uz: ['Sozlamalar', 'Integratsiyalar', 'DHP'], ru: ['Настройки', 'Интеграции', 'DHP'], roles: DESK },
    'settings.ai': { url: '/settings?tab=ai', uz: ['Sozlamalar', 'Integratsiyalar', 'AI kaliti'], ru: ['Настройки', 'Интеграции', 'Ключ AI'], roles: OWNER },
    'settings.leadApi': { url: '/settings?tab=leadApi', uz: ['Sozlamalar', 'Integratsiyalar', 'Lid API'], ru: ['Настройки', 'Интеграции', 'API лидов'], roles: OWNER },
    'settings.plan': { url: '/settings?tab=plan', uz: ['Sozlamalar', 'Tarif'], ru: ['Настройки', 'Тариф'], roles: DESK },
    'settings.journal': { url: '/settings?tab=journal', uz: ['Sozlamalar', 'Jurnal'], ru: ['Настройки', 'Журнал'], roles: OWNER },
};

export const isPathId = (id: string): boolean => Object.prototype.hasOwnProperty.call(PRODUCT_PATHS, id);

/** "Sozlamalar → Integratsiyalar → Telegram va SMS" */
export const pathLabel = (id: string, lang: SupportLang): string =>
    isPathId(id) ? PRODUCT_PATHS[id][lang].join(' → ') : '';

/** Ilova domeni: havola tugmalari shu bilan boshlanadi */
export const appBaseUrl = (): string =>
    String(process.env.APP_BASE_URL || 'https://dentacrm.uz').replace(/\/+$/, '');

export const pathUrl = (id: string): string | null =>
    isPathId(id) ? appBaseUrl() + PRODUCT_PATHS[id].url : null;

/** Qo'llanmani to'g'ridan-to'g'ri ochadigan havola (App.tsx `?guide=` ni o'qiydi) */
export const guideUrl = (guideId: string): string => `${appBaseUrl()}/?guide=${encodeURIComponent(guideId)}`;

/** Ilovadagi o'quv qo'llanmalar (components/guide/guides.ts dagi id'lar) */
export const GUIDE_IDS = [
    'tour', 'page-dashboard', 'page-patients', 'page-calendar', 'page-messages',
    'task-procedure', 'task-patient', 'task-booking', 'task-payment', 'task-service', 'task-sms',
] as const;

export const isGuideId = (id: string): boolean => (GUIDE_IDS as readonly string[]).includes(id);

const norm = (s: string) => s.toLowerCase().replace(/[`ʻʼ‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** Ilovada bor barcha bo'lim nomlari (ikki tilda) — matndagi yo'lni tekshirish uchun */
const KNOWN_LABELS: Set<string> = new Set(
    Object.values(PRODUCT_PATHS).flatMap(p => [...p.uz, ...p.ru]).map(norm)
);

/**
 * Matndan "A → B" ko'rinishidagi yo'llarni topib, BIRINCHI bo'g'ini ilovada
 * yo'q bo'lganlarini qaytaradi.
 *
 * Faqat birinchi bo'g'in tekshiriladi: yo'lning davomi ko'pincha tugma yoki
 * maydon nomi bo'ladi ("Bemorlar → Yangi bemor"), ular bu ro'yxatda yo'q va
 * bo'lishi shart ham emas. Menyuda yo'q BO'LIMNI aytish esa aniq xato.
 */
export const unknownPaths = (text: string): string[] => {
    const bad: string[] = [];
    const re = /([^\n.;:,()«»"]{2,40}?)\s*(?:→|->|➜|➡️?)\s*[^\n.;,()«»"]{2,40}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const raw = m[1].replace(/^[\s\d.)\-–•*]+/, '').split(/\s*(?:→|->)\s*/)[0].trim();
        // Strelka menyu yo'lidan boshqa narsani ham bildiradi: tugmalar ketma-ketligi
        // («Ulashish» → «Ekranga qo'shish») yoki oddiy gap ("bosing → oyna ochiladi").
        // Bo'lim nomi qo'shtirnoqsiz va bosh harf bilan yoziladi — faqat shunisi tekshiriladi.
        if (/[”»"'’]$/.test(raw)) continue;
        const lastWord = raw.split(/\s+/).pop() || '';
        if (!/^[A-ZА-ЯЁЎҚҒҲ]/.test(lastWord)) continue;

        // Gapning boshi ham ilinib qoladi ("Buning uchun Sozlamalar → ...") —
        // shuning uchun oxirgi so'zlar bo'yicha solishtiramiz.
        const words = norm(raw).split(' ');
        let known = false;
        for (let take = Math.min(3, words.length); take >= 1 && !known; take--) {
            known = KNOWN_LABELS.has(words.slice(-take).join(' '));
        }
        if (!known) bad.push(m[0].trim());
    }
    return bad;
};
