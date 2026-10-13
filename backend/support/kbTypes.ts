// Bilim bazasi maqolasi — boshlang'ich to'plam (kbSeed*.ts) va baza
// (SupportArticle jadvali) uchun umumiy shakl.

export interface SeedArticle {
    /** Barqaror nom: 'patients.add', 'sms.not-sent'. Kichik lotin harflari, nuqta va chiziqcha. */
    id: string;
    /** Bo'lim: dashboard | patients | calendar | finance | staff | inventory | queue | lab | leads | messages | settings | account | billing | general */
    module: string;
    /** Kimga ko'rsatiladi: '*' yoki rollar ('CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN') */
    roles: '*' | string[];
    titleUz: string;
    titleRu: string;
    /** Oddiy matn, qadamlar "1. ..." ko'rinishida. Markdown va HTML yo'q. */
    bodyUz: string;
    bodyRu: string;
    /** Odamlar shu mavzuni qanday so'rashi: sinonimlar, xato yozilishlar, ruscha/kirill variantlar */
    keywords?: string[];
    /** Javob ostida tugma bo'lib chiqadigan bo'limlar (productMap.ts dagi id'lar) */
    paths?: string[];
    /** Ilovadagi qadam-baqadam qo'llanma (components/guide/guides.ts dagi id) */
    guideId?: string;
}
