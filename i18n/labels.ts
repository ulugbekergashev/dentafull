import type { TranslationKey } from './translations';

/**
 * Umumiy yorliq xaritalaridagi (EXPENSE_CATEGORY_LABELS, CASH_MOVEMENT_LABELS,
 * getPaymentMethodLabel, SALARY_TYPE_LABEL va h.k.) o'zbekcha qiymatni
 * tarjima qiladi. Kalit — `auto.<o'zbekcha qiymat>`.
 *
 * Nega shunday: bu xaritalar komponentlardan tashqarida turadi, u yerda hook
 * ishlatib bo'lmaydi. Chaqiruv joyida esa `t` bor.
 *
 * Kalit topilmasa o'zbekcha matnning o'zi qaytadi — ekranda hech qachon
 * "auto.xxx" ko'rinmaydi.
 */
export const tLabel = (t: (key: TranslationKey) => string, label?: string | null): string => {
    if (!label) return '';
    const key = ('auto.' + label) as TranslationKey;
    const value = t(key);
    return value === key ? label : value;
};

/**
 * Tarif xususiyatlari bazada o'zbekcha saqlanadi (SubscriptionPlan.features).
 * Bazaga tegmasdan, ekranda tarjima qilamiz: "3 tagacha shifokor" kabi
 * qatorlarda sonni {n} bilan almashtiramiz.
 */
export const tPlanFeature = (t: (key: TranslationKey) => string, feature: string): string => {
    const m = feature.match(/^(\d+)\s+tagacha shifokor$/);
    if (m) return t('auto.{n} tagacha shifokor' as TranslationKey).replace('{n}', m[1]);
    return tLabel(t, feature);
};
