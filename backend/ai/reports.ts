// ─── Tayyor hisobotlar ────────────────────────────────────────────────────────
//
// Farqi /ai/ask dan: bu yerda model QAYSI tool'ni chaqirishni hal qilmaydi.
// Tugma bosilgan — demak kerakli tool'lar aniq ma'lum va ular to'g'ridan-to'g'ri
// chaqiriladi. Model faqat tayyor raqamlar ustiga qisqa xulosa yozadi.
//
// Uchta sabab:
//   1. Beqarorlik yo'qoladi. Etalon to'plamda model ba'zan tool'ni umuman
//      chaqirmasdan javob berardi (~8% holatda). Tugma uchun bu qabul qilib
//      bo'lmaydi — bosgan odam aniq natija kutadi.
//   2. Tez va arzon. Bitta model chaqiruvi, ~1000 token. Tool-calling tsikli
//      esa kamida ikki raund va ~4000 token. 8000 TPM limitida bu sezilarli.
//   3. Raqamlar UI ga xom holda yetib boradi va karta sifatida chiziladi.
//      Paragraf ichidagi raqamni ko'z bilan o'qib bo'lmaydi.

const { runTool } = require('./tools');
const { chat } = require('../aiService');

export type ReportType = 'today' | 'performance' | 'finance' | 'debtors' | 'inventory' | 'leads';

export interface Metric {
    label: string;
    value: number | string;
    unit?: string;
    hint?: string;
    /** UI rangi: neytral / yaxshi / ogohlantirish / yomon */
    tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

export interface ReportTable {
    columns: string[];
    rows: (string | number)[][];
}

export interface Report {
    type: ReportType;
    title: string;
    period: string;
    metrics: Metric[];
    table?: ReportTable;
    narrative: string;
    sources: string[];
}

export interface ReportContext {
    clinicId: string;
    role: string;
    doctorId?: string;
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────

const som = (n: number) => ({ value: Math.round(n), unit: 'so\'m' });

/** Oy boshidan bugungacha. */
const monthRange = (today: string) => ({
    dateFrom: `${today.slice(0, 7)}-01`,
    dateTo: today,
});

/** Har bir hisobot uchun: qaysi rollar ko'ra oladi. */
const REPORT_ROLES: Record<ReportType, string[]> = {
    today: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    performance: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    finance: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    debtors: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
    inventory: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    leads: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
};

export const REPORT_CATALOG: { type: ReportType; title: string; hint: string; roles: string[] }[] = [
    { type: 'today', title: 'Bugungi hisobot', hint: 'Qabullar, kelmaganlar, bugungi tushum', roles: REPORT_ROLES.today },
    { type: 'performance', title: 'Samaradorlik', hint: 'Shifokorlar kesimida qabul va tushum', roles: REPORT_ROLES.performance },
    { type: 'finance', title: 'Moliya holati', hint: 'Tushum, xarajat, to\'lov usullari', roles: REPORT_ROLES.finance },
    { type: 'debtors', title: 'Qarzdorlar', hint: 'Kim qancha qarz, jami summa', roles: REPORT_ROLES.debtors },
    { type: 'inventory', title: 'Ombor', hint: 'Tugayotgan materiallar', roles: REPORT_ROLES.inventory },
    { type: 'leads', title: 'Lidlar', hint: 'Manba, konversiya, javobsizlar', roles: REPORT_ROLES.leads },
];

/** Rolga ko'ra mavjud hisobotlar. */
export const reportsForRole = (role: string) =>
    REPORT_CATALOG.filter(r => r.roles.includes(role)).map(({ type, title, hint }) => ({ type, title, hint }));

// ─── Hisobot quruvchilari ────────────────────────────────────────────────────
// Har biri: kerakli tool'larni chaqiradi, metrikalarni ajratadi, jadval quradi.

type Builder = (ctx: ReportContext, today: string) => Promise<Omit<Report, 'type' | 'narrative'>>;

const BUILDERS: Record<ReportType, Builder> = {

    today: async (ctx, today) => {
        const appts = await runTool('get_appointments', { dateFrom: today, dateTo: today }, ctx);
        const st = appts.status_kesimida || {};
        const kelmagan = st['No-Show'] || 0;

        const metrics: Metric[] = [
            { label: 'Jami qabul', value: appts.jami ?? 0, unit: 'ta' },
            { label: 'Tasdiqlangan', value: st['Confirmed'] || 0, unit: 'ta', tone: 'good' },
            { label: 'Yakunlangan', value: st['Completed'] || 0, unit: 'ta', tone: 'good' },
            { label: 'Kelmagan', value: kelmagan, unit: 'ta', tone: kelmagan > 0 ? 'warn' : 'neutral' },
        ];
        const sources = ['get_appointments'];

        // Moliya faqat ruxsati borlar uchun.
        if (['SUPER_ADMIN', 'CLINIC_ADMIN'].includes(ctx.role)) {
            const rev = await runTool('get_revenue', { dateFrom: today, dateTo: today }, ctx);
            if (!rev.xato) {
                metrics.push({ label: 'Bugungi tushum', ...som(rev.kassaga_kirgan || 0), tone: 'good' });
                sources.push('get_revenue');
            }
        }

        return {
            title: 'Bugungi hisobot',
            period: today,
            metrics,
            table: appts.qabullar?.length
                ? {
                    columns: ['Vaqt', 'Shifokor', 'Bemor', 'Status'],
                    rows: appts.qabullar.slice(0, 12).map((a: any) => [a.vaqt, a.shifokor, a.bemor, a.status]),
                }
                : undefined,
            sources,
        };
    },

    performance: async (ctx, today) => {
        const r = monthRange(today);
        const d = await runTool('get_doctor_stats', r, ctx);
        const docs = d.shifokorlar || [];
        const jamiTushum = docs.reduce((s: number, x: any) => s + (x.tushum || 0), 0);
        const jamiKelmagan = docs.reduce((s: number, x: any) => s + (x.kelmagan || 0), 0);
        const top = [...docs].sort((a: any, b: any) => (b.tushum || 0) - (a.tushum || 0))[0];

        return {
            title: 'Samaradorlik hisoboti',
            period: `${r.dateFrom} — ${r.dateTo}`,
            metrics: [
                { label: 'Shifokorlar', value: docs.length, unit: 'ta' },
                { label: 'Jami tushum', ...som(jamiTushum), tone: 'good' },
                { label: 'Yetakchi', value: top?.shifokor || '—', hint: top ? `${Math.round(top.tushum).toLocaleString('ru-RU')} so'm` : undefined },
                { label: 'Kelmaganlar', value: jamiKelmagan, unit: 'ta', tone: jamiKelmagan > 0 ? 'warn' : 'neutral' },
            ],
            table: docs.length
                ? {
                    columns: ['Shifokor', 'Qabul', 'Yakunlangan', 'Kelmagan', 'Tushum'],
                    rows: docs.map((x: any) => [x.shifokor, x.qabullar, x.bajarilgan, x.kelmagan, Math.round(x.tushum).toLocaleString('ru-RU')]),
                }
                : undefined,
            sources: ['get_doctor_stats'],
        };
    },

    finance: async (ctx, today) => {
        const r = monthRange(today);
        const f = await runTool('get_revenue', r, ctx);
        const usul = f.usul_kesimida || {};

        return {
            title: 'Moliya holati',
            period: `${r.dateFrom} — ${r.dateTo}`,
            metrics: [
                { label: 'Kassaga kirgan', ...som(f.kassaga_kirgan || 0), tone: 'good' },
                { label: 'Xarajat', ...som(f.xarajat || 0), tone: 'bad' },
                { label: 'Sof', ...som(f.sof || 0), tone: (f.sof || 0) >= 0 ? 'good' : 'bad' },
                { label: 'To\'lovlar', value: f.tolovlar_soni || 0, unit: 'ta' },
            ],
            table: Object.keys(usul).length
                ? {
                    columns: ['To\'lov usuli', 'Summa'],
                    rows: Object.entries(usul)
                        .sort((a: any, b: any) => b[1] - a[1])
                        .map(([k, v]: any) => [k, Math.round(v).toLocaleString('ru-RU')]),
                }
                : undefined,
            sources: ['get_revenue'],
        };
    },

    debtors: async (ctx) => {
        const d = await runTool('get_debtors', { limit: 20 }, ctx);
        const list = d.bemorlar || [];

        return {
            title: 'Qarzdorlar',
            period: 'Hozirgi holat',
            metrics: [
                { label: 'Qarzdorlar', value: d.topildi ?? list.length, unit: 'ta', tone: 'warn' },
                { label: 'Jami qarz', ...som(d.jami_qarz || 0), tone: 'bad' },
                { label: 'Eng katta', value: list[0]?.bemor || '—', hint: list[0] ? `${Math.round(list[0].qarz).toLocaleString('ru-RU')} so'm` : undefined },
            ],
            table: list.length
                ? {
                    columns: ['Bemor', 'Telefon', 'Qarz', 'Oxirgi tashrif'],
                    rows: list.map((x: any) => [x.bemor, x.telefon, Math.round(x.qarz).toLocaleString('ru-RU'), x.oxirgi_tashrif || '—']),
                }
                : undefined,
            sources: ['get_debtors'],
        };
    },

    inventory: async (ctx) => {
        const s = await runTool('get_low_stock', {}, ctx);
        const list = s.materiallar || [];

        return {
            title: 'Ombor holati',
            period: 'Hozirgi holat',
            metrics: [
                { label: 'Jami pozitsiya', value: s.jami_pozitsiya ?? 0, unit: 'ta' },
                { label: 'Tugayotgan', value: s.tugayotgan ?? 0, unit: 'ta', tone: (s.tugayotgan ?? 0) > 0 ? 'warn' : 'good' },
            ],
            table: list.length
                ? {
                    columns: ['Material', 'Qoldiq', 'Minimum', 'O\'lchov'],
                    rows: list.map((x: any) => [x.nom, x.qoldiq, x.minimum, x.olchov]),
                }
                : undefined,
            sources: ['get_low_stock'],
        };
    },

    leads: async (ctx) => {
        const l = await runTool('get_leads', { days: 30 }, ctx);
        const st = l.status_kesimida || {};
        const manba = l.manba_kesimida || {};
        const jami = l.jami || 0;
        const booked = st['Booked'] || 0;

        return {
            title: 'Lidlar',
            period: 'Oxirgi 30 kun',
            metrics: [
                { label: 'Jami lid', value: jami, unit: 'ta' },
                { label: 'Bemorga aylandi', value: booked, unit: 'ta', tone: 'good', hint: jami ? `${Math.round((booked / jami) * 100)}% konversiya` : undefined },
                { label: 'Javobsiz', value: l.javobsiz_eski_lidlar || 0, unit: 'ta', tone: (l.javobsiz_eski_lidlar || 0) > 0 ? 'warn' : 'neutral' },
            ],
            table: Object.keys(manba).length
                ? {
                    columns: ['Manba', 'Lidlar'],
                    rows: Object.entries(manba).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => [k, v]),
                }
                : undefined,
            sources: ['get_leads'],
        };
    },
};

// ─── Xulosa matni ────────────────────────────────────────────────────────────
// Model faqat shu qismni yozadi. Raqamlar unga tayyor holda beriladi, ya'ni
// u hisoblamaydi va tool tanlamaydi — faqat nimaga e'tibor berish kerakligini
// aytadi. Shuning uchun xato qilish ehtimoli minimal.

const narrativeFor = async (r: Omit<Report, 'type' | 'narrative'>): Promise<string> => {
    const fakt = r.metrics
        .map(m => `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}${m.hint ? ` (${m.hint})` : ''}`)
        .join('; ');

    try {
        return await chat(
            [
                {
                    role: 'system',
                    content:
                        'Sen stomatologiya klinikasi boshqaruvchisiga hisobot izohini yozasan. ' +
                        'Senga tayyor raqamlar beriladi — ularni QAYTA HISOBLAMA va yangi raqam ' +
                        'qo\'shma. Vazifang: 2-3 gapda eng muhim narsani ayt va e\'tibor talab ' +
                        'qiladigan bitta narsani ko\'rsat. Agar hammasi yaxshi bo\'lsa, shuni ayt. ' +
                        'Markdown, emoji va sarlavha ISHLATMA. Faqat oddiy matn, o\'zbek tilida.',
                },
                { role: 'user', content: `${r.title} (${r.period}). ${fakt}` },
            ],
            { task: 'chat', maxTokens: 220, label: 'report-narrative' }
        );
    } catch (e: any) {
        // Xulosa bo'lmasa ham hisobot o'zi qimmatli — raqamlar allaqachon tayyor.
        console.warn('[AI:report] xulosa yozilmadi:', e.message);
        return '';
    }
};

/**
 * Hisobotni quradi. Rol tekshiruvi bu yerda ham qayta amalga oshiriladi —
 * tool qatlamiga tayanib qolmaymiz.
 */
export const buildReport = async (
    type: ReportType,
    ctx: ReportContext,
    today: string
): Promise<Report> => {
    const allowed = REPORT_ROLES[type];
    if (!allowed) throw new Error(`Noma'lum hisobot turi: ${type}`);
    if (!allowed.includes(ctx.role)) throw new Error('Bu hisobotga sizning rolingizda ruxsat yo\'q.');

    const base = await BUILDERS[type](ctx, today);
    const narrative = await narrativeFor(base);
    return { type, ...base, narrative };
};
