// To'lov usullarining yagona manbasi.
// Ilgari har bir sahifada `type === 'Cash' ? 'Naqd' : ...` zanjiri takrorlanardi — yangi usul
// qo'shilganda ular jimgina noto'g'ri yorliq ko'rsatardi. Endi barcha ro'yxat/yorliq shu yerdan.

export type PaymentMethod =
    | 'Cash' | 'CashCollection'
    | 'Card' | 'UzcardTerminal' | 'HumoTerminal'
    | 'Click' | 'P2P' | 'QrBank' | 'QrUzcard' | 'QrHumo'
    | 'Transfer' | 'Insurance' | 'Balance';

export interface PaymentMethodMeta {
    key: PaymentMethod;
    label: string;
    /** Diagramma o'qi va tor ustunlar uchun qisqa nom */
    short: string;
    /** Kassaga haqiqiy pul kiradimi (naqd yashik yoki hisob raqam) */
    isMoneyIn: boolean;
    /** Naqd yashikka tushadimi — "Kassada qoldi" shu asosda hisoblanadi */
    isCashDrawer: boolean;
    /** Diagramma va nishonlar rangi */
    color: string;
    /**
     * Kassa yopishda nima bilan solishtiriladi: 'terminal' — terminal Z-hisoboti,
     * 'online' — Click/Payme kabineti. Yo'q — solishtirilmaydi (faqat jamida ko'rinadi).
     */
    reconcile?: 'terminal' | 'online';
}

// Tartib — to'lov oynasidagi tartib. Birinchi beshtasidan boshqasi (inkassatsiya,
// Uzcard/Humo, P2P, QR) faqat klinika Sozlamalar → Maxsus imkoniyatlarda yoqsa chiqadi.
export const PAYMENT_METHODS: PaymentMethodMeta[] = [
    { key: 'Cash', label: 'Naqd', short: 'Naqd', isMoneyIn: true, isCashDrawer: true, color: '#10B981' },
    // Naqd — kassaga tushadi va kun oxirida sanaladi; alohida usul faqat hisobotda ajratish uchun
    { key: 'CashCollection', label: 'Naqd (inkassatsiya)', short: 'Inkassatsiya', isMoneyIn: true, isCashDrawer: true, color: '#059669' },
    { key: 'Card', label: 'Karta (terminal)', short: 'Karta', isMoneyIn: true, isCashDrawer: false, color: '#3B82F6', reconcile: 'terminal' },
    { key: 'UzcardTerminal', label: 'Uzcard terminal', short: 'Uzcard', isMoneyIn: true, isCashDrawer: false, color: '#2563EB', reconcile: 'terminal' },
    { key: 'HumoTerminal', label: 'Humo terminal', short: 'Humo', isMoneyIn: true, isCashDrawer: false, color: '#0EA5E9', reconcile: 'terminal' },
    { key: 'Click', label: 'Click / Payme', short: 'Click', isMoneyIn: true, isCashDrawer: false, color: '#06B6D4', reconcile: 'online' },
    // Egasining kartasiga — klinika hisobida ko'rinmaydi, solishtiriladigan joy yo'q
    { key: 'P2P', label: 'P2P (kartaga)', short: 'P2P', isMoneyIn: true, isCashDrawer: false, color: '#EC4899' },
    { key: 'QrBank', label: 'QR kod (bank)', short: 'QR bank', isMoneyIn: true, isCashDrawer: false, color: '#14B8A6' },
    // Terminal ekranidagi QR — terminal Z-hisobotiga tushadi
    { key: 'QrUzcard', label: 'QR kod (Uzcard terminal)', short: 'QR Uzcard', isMoneyIn: true, isCashDrawer: false, color: '#4F46E5', reconcile: 'terminal' },
    { key: 'QrHumo', label: 'QR kod (Humo terminal)', short: 'QR Humo', isMoneyIn: true, isCashDrawer: false, color: '#7C3AED', reconcile: 'terminal' },
    { key: 'Transfer', label: "O'tkazma", short: "O'tkazma", isMoneyIn: true, isCashDrawer: false, color: '#6366F1' },
    { key: 'Insurance', label: "Sug'urta", short: "Sug'urta", isMoneyIn: true, isCashDrawer: false, color: '#8B5CF6' },
    // Avansdan yechish — bemor pulni ilgari to'lagan, bugun kassaga yangi pul kirmaydi.
    { key: 'Balance', label: 'Hisobdan (Avans)', short: 'Avans', isMoneyIn: false, isCashDrawer: false, color: '#F59E0B' },
];

const META_BY_KEY = new Map<string, PaymentMethodMeta>(PAYMENT_METHODS.map(m => [m.key, m]));

/** Sozlama berilmagan klinikada to'lov oynasidagi usullar — hamma klinikada avvalgidek */
export const DEFAULT_INCOMING_METHODS: readonly PaymentMethod[] = ['Cash', 'Card', 'Click', 'Transfer', 'Insurance'];

/** Sozlamalarda yoqib-o'chirsa bo'ladigan usullar (Avans — bemor hisobi, alohida boshqariladi) */
export const SELECTABLE_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHODS.filter(m => m.key !== 'Balance').map(m => m.key);

/**
 * To'lov qabul qilishda tanlash mumkin bo'lgan usullar — SHU klinikaniki.
 *
 * Klinika yuklanganda applyClinicPaymentMethods() shu massivning o'zini
 * yangilaydi: to'lov oynalari (bemor kartasi, bosh sahifa, kassa, bo'lib
 * to'lash) uni render paytida o'qiydi, shuning uchun ularga hech narsa
 * uzatish shart emas.
 */
export const INCOMING_PAYMENT_METHODS: PaymentMethod[] = [...DEFAULT_INCOMING_METHODS];

/**
 * Kiruvchi ro'yxatni tozalaydi: noma'lum va takror usullar tashlanadi, tartib — katalogdagidek.
 * Naqd doim bor: to'lov oynalari sukut bo'yicha naqddan boshlanadi.
 */
export function normalizePaymentMethods(list?: readonly string[] | null): PaymentMethod[] {
    if (!list || list.length === 0) return [];
    const wanted = new Set([...list.map(String), 'Cash']);
    return SELECTABLE_PAYMENT_METHODS.filter(k => wanted.has(k));
}

/** Klinika sozlamasi (null yoki bo'sh — sukut ro'yxat) */
export function applyClinicPaymentMethods(list?: readonly string[] | null): void {
    const next = normalizePaymentMethods(list);
    INCOMING_PAYMENT_METHODS.splice(0, INCOMING_PAYMENT_METHODS.length, ...(next.length ? next : DEFAULT_INCOMING_METHODS));
}

/** Kassa yopishda terminal yoki Click kabineti bilan solishtiriladigan jami */
export function reconcileTotal(byMethod: Record<string, number>, kind: 'terminal' | 'online'): number {
    return PAYMENT_METHODS.reduce((sum, m) => sum + (m.reconcile === kind ? (byMethod[m.key] || 0) : 0), 0);
}

/** Xarajat qilishda ishlatiladigan usullar — kassadan naqd yoki hisobdan */
export const EXPENSE_PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Click', 'Transfer'];

/** Noma'lum qiymat kelsa ham hech qachon bo'sh qaytarmaydi */
export function getPaymentMethodLabel(method?: string | null): string {
    if (!method) return '-';
    return META_BY_KEY.get(method)?.label ?? method;
}

export function getPaymentMethodColor(method?: string | null): string {
    if (!method) return '#9CA3AF';
    return META_BY_KEY.get(method)?.color ?? '#9CA3AF';
}

/**
 * Tranzaksiya kassaga haqiqiy pul olib keldimi.
 * 'Balance' — yo'q: pul avans sifatida ilgari tushgan, ikki marta sanalmasligi kerak.
 */
export function isMoneyInMethod(method?: string | null): boolean {
    if (!method) return true; // usuli ko'rsatilmagan eski yozuvlar — naqd deb qabul qilinadi
    return META_BY_KEY.get(method)?.isMoneyIn ?? true;
}

/**
 * Naqd yashikka ta'sir qiladimi. Usuli bo'sh bo'lgan eski yozuvlar naqd deb hisoblanadi —
 * tizimda sukut bo'yicha 'Cash' tanlangan, shuning uchun bu xavfsiz taxmin.
 */
export function isCashDrawerMethod(method?: string | null): boolean {
    if (!method) return true;
    return META_BY_KEY.get(method)?.isCashDrawer ?? false;
}

/** Naqd bo'lmagan, lekin pul olib kelgan usullar — hisobot ustunlari uchun */
export const NON_CASH_INCOMING: PaymentMethod[] = PAYMENT_METHODS.filter(m => m.isMoneyIn && !m.isCashDrawer).map(m => m.key);
