// ─── Payme: sozlamalar va buyurtma ───────────────────────────────────────────
// Klinika ilovada "Payme orqali to'lash"ni bosadi → shu yerda summasi qotirilgan
// buyurtma (PaymeOrder) yaratiladi → foydalanuvchi checkout.paycom.uz ga o'tadi.
// Payme keyin bizning /api/payme manzilimizga (merchant.ts) murojaat qiladi.
//
// Railway o'zgaruvchilari (PAYME_MERCHANT_ID va PAYME_KEY bo'lmasa — o'chiq):
//   PAYME_MERCHANT_ID   kassa ID'si (Payme Business → kassa → dasturchilar uchun)
//   PAYME_KEY           kassa kaliti (sinov paytida — TEST_KEY)
//   PAYME_TEST=1        to'lov sahifasi test.paycom.uz (sinov muhiti) bo'ladi
//   PAYME_TEST_CLINICS  sinov paytida tugma FAQAT shu klinikalarda chiqadi (id'lar, vergul bilan).
//                       Bo'sh bo'lsa sinov rejimida hech kimda chiqmaydi — aks holda klinikalar
//                       sinov kartasi bilan "to'lab" obunani tekinga uzaytirib olardi.
//   PAYME_IKPU_CODE     xizmatning MXIK kodi (tasnif.soliq.uz)
//   PAYME_PACKAGE_CODE  MXIK kodiga bog'langan o'lchov birligi kodi
//   PAYME_VAT_PERCENT   QQS foizi (QQS to'lovchi bo'lmasangiz 0)
//   PAYME_ITEM_TITLE    chekdagi xizmat nomi (ixtiyoriy)
// Oxirgi uchtasi qo'yilmasa to'lov ishlaydi, lekin chekda soliq ma'lumoti bo'lmaydi.

export const PAYME_MONTHS = [1, 3, 6, 12];

const CHECKOUT_PROD = 'https://checkout.paycom.uz';
const CHECKOUT_TEST = 'https://test.paycom.uz';
const DEFAULT_ITEM_TITLE = 'DentaCRM dasturidan foydalanish (1 oy)';
/** Bir klinika shuncha vaqt ichida shuncha buyurtmadan ko'p yarata olmaydi */
const ORDER_WINDOW_MS = 60 * 60 * 1000;
export const MAX_ORDERS_PER_WINDOW = 30;

export interface PaymeFiscal {
    ikpu: string;
    packageCode: string;
    vatPercent: number;
    title: string;
}

export interface PaymeConfig {
    merchantId: string;
    key: string;
    test: boolean;
    /** Sinov rejimida to'lay oladigan klinikalar */
    testClinics: string[];
    /** null — soliq ma'lumoti to'liq emas, chekka qo'shilmaydi */
    fiscal: PaymeFiscal | null;
}

const clean = (v: unknown): string => String(v ?? '').trim();

export const readPaymeConfig = (env: Record<string, string | undefined> = process.env): PaymeConfig | null => {
    const merchantId = clean(env.PAYME_MERCHANT_ID);
    const key = clean(env.PAYME_KEY);
    if (!merchantId || !key) return null;

    const ikpu = clean(env.PAYME_IKPU_CODE);
    const packageCode = clean(env.PAYME_PACKAGE_CODE);
    const vatRaw = clean(env.PAYME_VAT_PERCENT);
    const vatPercent = Number(vatRaw);
    const fiscal = ikpu && packageCode && vatRaw !== '' && Number.isFinite(vatPercent) && vatPercent >= 0
        ? { ikpu, packageCode, vatPercent, title: clean(env.PAYME_ITEM_TITLE) || DEFAULT_ITEM_TITLE }
        : null;

    const testClinics = clean(env.PAYME_TEST_CLINICS).split(',').map(s => s.trim()).filter(Boolean);
    return { merchantId, key, test: clean(env.PAYME_TEST) === '1', testClinics, fiscal };
};

/** Foydalanuvchiga ko'rsatiladigan xato (matni o'zbekcha, ilovada shu ko'rinadi) */
export class PaymeOrderError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

/** Shu klinika onlayn to'lay oladimi: sinov rejimida faqat ro'yxatdagilar */
export const canPayOnline = (config: PaymeConfig, clinicId: string): boolean =>
    !config.test || config.testClinics.includes(clinicId);

/** Klinikaning oylik narxi tiyinda. null — narx belgilanmagan */
const monthlyTiyin = async (db: any, clinic: any, test: boolean): Promise<number | null> => {
    let price = clinic.customPrice;
    // Sinovda bepul (0) sinov klinikasi ham to'lay olishi uchun tarif narxi olinadi
    if (price == null || (test && Number(price) <= 0)) {
        const plan = await db.subscriptionPlan.findUnique({ where: { id: clinic.planId } }).catch(() => null);
        price = plan?.price ?? null;
    }
    const tiyin = Math.round(Number(price) * 100);
    return Number.isFinite(tiyin) && tiyin > 0 ? tiyin : null;
};

const loadClinic = async (db: any, clinicId: string) => {
    const clinic = await db.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, status: true, planId: true, customPrice: true },
    });
    if (!clinic || clinic.status === 'Deleted') throw new PaymeOrderError('Klinika topilmadi', 404);
    return clinic;
};

/** To'lov havolasi: base64("m=...;ac.order_id=...;a=...;c=...;l=uz") */
export const checkoutUrl = (config: PaymeConfig, orderId: string, amountTiyin: number, returnUrl: string | null, lang: 'uz' | 'ru' = 'uz'): string => {
    const parts = [`m=${config.merchantId}`, `ac.order_id=${orderId}`, `a=${amountTiyin}`, `l=${lang}`];
    // ";" ajratuvchi — manzil ichida bo'lsa havola buziladi
    if (returnUrl && !returnUrl.includes(';')) parts.push(`c=${returnUrl}`);
    const base = config.test ? CHECKOUT_TEST : CHECKOUT_PROD;
    return `${base}/${Buffer.from(parts.join(';'), 'utf8').toString('base64')}`;
};

export interface PaymeQuote {
    /** Oylik narx, so'mda */
    monthly: number;
    options: { months: number; amount: number }[];
}

export const createPaymeOrders = (db: any, getConfig: () => PaymeConfig | null) => ({
    /** Ilovadagi tanlov: necha oyga qancha (so'mda). null — onlayn to'lab bo'lmaydi */
    async quote(clinicId: string): Promise<PaymeQuote | null> {
        const config = getConfig();
        if (!config || !canPayOnline(config, clinicId)) return null;
        const clinic = await loadClinic(db, clinicId);
        const tiyin = await monthlyTiyin(db, clinic, config.test);
        if (tiyin === null) return null;
        return {
            monthly: tiyin / 100,
            options: PAYME_MONTHS.map(months => ({ months, amount: (tiyin * months) / 100 })),
        };
    },

    async create(input: { clinicId: string; months: number; createdBy?: string | null; returnUrl?: string | null; lang?: 'uz' | 'ru' }) {
        const config = getConfig();
        if (!config || !canPayOnline(config, input.clinicId)) throw new PaymeOrderError("Payme orqali to'lov hali yoqilmagan", 503);
        const months = Number(input.months);
        if (!PAYME_MONTHS.includes(months)) throw new PaymeOrderError("Muddat noto'g'ri");

        const clinic = await loadClinic(db, input.clinicId);
        const tiyin = await monthlyTiyin(db, clinic, config.test);
        if (tiyin === null) throw new PaymeOrderError("Tarif narxi belgilanmagan — biz bilan bog'laning");

        // Tugmani qayta-qayta bosib (yoki skript bilan) bazani keraksiz buyurtmalar bilan to'ldirmaslik uchun
        const recent = await db.paymeOrder.count({
            where: { clinicId: clinic.id, createdAt: { gte: new Date(Date.now() - ORDER_WINDOW_MS) } },
        });
        if (recent >= MAX_ORDERS_PER_WINDOW) throw new PaymeOrderError("Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring", 429);

        const amount = tiyin * months;
        const order = await db.paymeOrder.create({
            data: { clinicId: clinic.id, months, amount, status: 'new', createdBy: input.createdBy || null },
        });
        return {
            orderId: order.id as string,
            months,
            amount: amount / 100,
            url: checkoutUrl(config, order.id, amount, input.returnUrl || null, input.lang),
        };
    },
});

export type PaymeOrders = ReturnType<typeof createPaymeOrders>;
