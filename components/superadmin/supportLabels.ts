import { useLanguage } from '../../context/LanguageContext';
import type { TranslationKey } from '../../context/LanguageContext';
import { AUDIT_ROLE, auditLabel } from '../../i18n/auditLabels';
import { tLabel } from '../../i18n/labels';
import type { SupportMode, SupportCategorySetting } from '../../services/supportAdmin';
import type { PillTone } from './supportUi';

// ─── Yordam boti paneli: nomlar ──────────────────────────────────────────────
// Server xom qiymat beradi ('waiting_operator', 'bot_down', 'finance') — bu yerda
// ular asoschi tushunadigan so'zga aylanadi. Notanish qiymat kelsa, ekran
// buzilmaydi: qiymatning o'zi ko'rsatiladi.

export const TICKET_STATUSES = ['open', 'waiting_operator', 'human', 'resolved', 'closed'] as const;

export const DIAG_KINDS = [
    'bot_down', 'bot_up', 'bot_error', 'login_failed', 'automation_skip', 'client_error', 'server_error',
] as const;

/** Bilim bazasi bo'limlari (backend/support/kbTypes.ts dagi `module`) */
export const ARTICLE_MODULES = [
    'general', 'dashboard', 'patients', 'calendar', 'finance', 'staff', 'inventory', 'queue',
    'lab', 'leads', 'messages', 'settings', 'account', 'billing',
] as const;

/** Maqola kimga ko'rsatilishi mumkin (klinika xodimlari) */
export const ARTICLE_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const;

/**
 * Javob ostida tugma bo'lib chiqadigan bo'limlar.
 *
 * Manba — backend/support/productMap.ts (PRODUCT_PATHS): id'lar o'sha bilan bir
 * xil bo'lishi SHART. Server bu ro'yxatni hozircha bermaydi, shuning uchun nomlar
 * shu yerda takrorlangan; u yerga yangi bo'lim qo'shilsa, bu yerga ham qo'shiladi.
 * Ro'yxatda yo'q id'li maqola buzilmaydi — id'ning o'zi ko'rsatiladi va saqlanadi.
 */
export const ARTICLE_PATHS: { id: string; chain: string[] }[] = [
    { id: 'dashboard', chain: ['Bosh sahifa'] },
    { id: 'leads', chain: ['Lidlar'] },
    { id: 'patients', chain: ['Bemorlar'] },
    { id: 'calendar', chain: ['Kalendar'] },
    { id: 'finance.kassa', chain: ['Moliya', 'Kassa'] },
    { id: 'finance.hisobot', chain: ['Moliya', 'Hisobot'] },
    { id: 'staff.list', chain: ['Xodimlar', "Ro'yxat"] },
    { id: 'staff.stats', chain: ['Xodimlar', 'Statistika'] },
    { id: 'staff.access', chain: ['Xodimlar', 'Ruxsatlar'] },
    { id: 'inventory', chain: ['Ombor'] },
    { id: 'queue', chain: ['Online Navbat'] },
    { id: 'lab', chain: ['Laboratoriya'] },
    { id: 'messages', chain: ['Xabarlar'] },
    { id: 'messages.templates', chain: ['Xabarlar', 'Shablonlar'] },
    { id: 'messages.auto', chain: ['Xabarlar', 'Avtomatik'] },
    { id: 'messages.manual', chain: ['Xabarlar', "Qo'lda"] },
    { id: 'messages.history', chain: ['Xabarlar', 'Tarix'] },
    { id: 'settings.clinic', chain: ['Sozlamalar', 'Klinika'] },
    { id: 'settings.branches', chain: ['Sozlamalar', 'Filiallar'] },
    { id: 'settings.services', chain: ['Sozlamalar', 'Xizmatlar va narxlar'] },
    { id: 'settings.features', chain: ['Sozlamalar', 'Maxsus imkoniyatlar'] },
    { id: 'settings.messaging', chain: ['Sozlamalar', 'Integratsiyalar', 'Telegram va SMS'] },
    { id: 'settings.dhp', chain: ['Sozlamalar', 'Integratsiyalar', 'DHP'] },
    { id: 'settings.ai', chain: ['Sozlamalar', 'Integratsiyalar', 'AI kaliti'] },
    { id: 'settings.leadApi', chain: ['Sozlamalar', 'Integratsiyalar', 'Lid API'] },
    { id: 'settings.plan', chain: ['Sozlamalar', 'Tarif'] },
    { id: 'settings.journal', chain: ['Sozlamalar', 'Jurnal'] },
];

/** Ilovadagi qadam-baqadam qo'llanmalar (components/guide/guides.ts dagi id va sarlavha kalitlari) */
export const ARTICLE_GUIDES: { id: string; titleKey: TranslationKey }[] = [
    { id: 'tour', titleKey: 'guide.tour.title' },
    { id: 'page-dashboard', titleKey: 'guide.page.dashboard' },
    { id: 'page-patients', titleKey: 'guide.page.patients' },
    { id: 'page-calendar', titleKey: 'guide.page.calendar' },
    { id: 'page-messages', titleKey: 'guide.page.messages' },
    { id: 'task-procedure', titleKey: 'guide.proc.title' },
    { id: 'task-patient', titleKey: 'guide.pat.title' },
    { id: 'task-booking', titleKey: 'guide.book.title' },
    { id: 'task-payment', titleKey: 'guide.pay.title' },
    { id: 'task-service', titleKey: 'guide.svc.title' },
    { id: 'task-sms', titleKey: 'guide.sms.title' },
];

const STATUS_TONE: Record<string, PillTone> = {
    open: 'blue',
    waiting_operator: 'amber',
    human: 'violet',
    resolved: 'green',
    closed: 'gray',
};

const DIAG_TONE: Record<string, PillTone> = {
    bot_down: 'red',
    bot_up: 'green',
    bot_error: 'red',
    login_failed: 'amber',
    automation_skip: 'amber',
    client_error: 'red',
    server_error: 'red',
};

/**
 * Lug'atdagi ayrim so'zlar gap ichida ishlatilgani uchun ruschada kichik harf
 * bilan yozilgan ("выключен"). Yorliq sifatida ular bosh harf bilan chiqadi.
 */
const upperFirst = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** Baho serverdan son (1 / -1) yoki so'z bo'lib kelishi mumkin */
export const ratingSign = (rating: number | string | null): 'up' | 'down' | null => {
    if (rating === null || rating === '') return null;
    if (typeof rating === 'number') return rating > 0 ? 'up' : rating < 0 ? 'down' : null;
    const value = rating.toLowerCase();
    if (['up', 'positive', 'like', 'good', '1', '+1'].includes(value)) return 'up';
    if (['down', 'negative', 'dislike', 'bad', '-1'].includes(value)) return 'down';
    return null;
};

export function useSupportLabels() {
    const { t, language } = useLanguage();
    const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';

    const statuses: Record<string, string> = {
        open: t('auto.Ochiq'),
        waiting_operator: t('auto.Sizni kutmoqda'),
        human: t('auto.Siz javob beryapsiz'),
        resolved: t("auto.Hal bo'ldi"),
        closed: t('auto.Yopilgan'),
    };

    const modes: Record<SupportMode, string> = {
        off: upperFirst(t("auto.O'chirilgan")),
        draft: t('auto.Qoralama'),
        auto: t('auto.Avtomatik'),
    };

    const categorySettings: Record<SupportCategorySetting, string> = {
        rule: t("auto.Umumiy tartib bo'yicha"),
        auto: t('auto.Doim avtomatik'),
        draft: t('auto.Doim men tasdiqlayman'),
    };

    const modules: Record<string, string> = {
        general: t('auto.Umumiy'),
        dashboard: t('nav.dashboard'),
        patients: t('nav.patients'),
        calendar: t('nav.calendar'),
        finance: t('nav.finance'),
        staff: t('auto.Xodimlar'),
        inventory: t('auto.Ombor'),
        queue: t('nav.queue'),
        lab: t('nav.lab'),
        leads: t('nav.leads'),
        messages: t('nav.messages'),
        settings: t('nav.settings'),
        account: t('auto.Kirish va parol'),
        billing: t("auto.To'lov va tarif"),
    };

    const diagKinds: Record<string, string> = {
        bot_down: t("auto.Telegram bot to'xtadi"),
        bot_up: t('auto.Telegram bot qayta ishladi'),
        bot_error: t('auto.Telegram botda xato'),
        login_failed: t('auto.Tizimga kira olmadi'),
        automation_skip: t('auto.Avtomatik xabar yuborilmadi'),
        client_error: t('auto.Ilovada xato'),
        server_error: t('auto.Serverda xato'),
    };

    // Qoralama taqdiri. Server qiymatlari shartnomada sanab o'tilmagan —
    // tanish bo'lmagani ko'rsatilmaydi (xom inglizcha so'z chiqmasin).
    const draftStates: Record<string, string> = {
        pending: t('auto.tasdiq kutmoqda'),
        waiting: t('auto.tasdiq kutmoqda'),
        sent: t('auto.yuborilgan'),
        approved: t('auto.yuborilgan'),
        accepted: t('auto.yuborilgan'),
        edited: t('auto.tuzatib yuborilgan'),
        rejected: t('auto.rad etilgan'),
        discarded: t('auto.rad etilgan'),
    };

    return {
        ticketStatus: (status: string): string => statuses[status] || status,
        ticketStatusTone: (status: string): PillTone => STATUS_TONE[status] || 'gray',
        mode: (mode: SupportMode): string => modes[mode],
        categorySetting: (setting: SupportCategorySetting): string => categorySettings[setting],
        module: (id: string): string => modules[id] || id,
        role: (role: string | null): string => (role ? auditLabel(AUDIT_ROLE, role, lang) : ''),
        diagKind: (kind: string): string => diagKinds[kind] || kind,
        diagTone: (kind: string): PillTone => DIAG_TONE[kind] || 'gray',
        draftState: (state: string | null): string => (state ? draftStates[state.toLowerCase()] || '' : ''),
        path: (id: string): string => {
            const known = ARTICLE_PATHS.find(item => item.id === id);
            return known ? known.chain.map(segment => tLabel(t, segment)).join(' → ') : id;
        },
        guide: (id: string): string => {
            const known = ARTICLE_GUIDES.find(item => item.id === id);
            return known ? t(known.titleKey) : id;
        },
    };
}
