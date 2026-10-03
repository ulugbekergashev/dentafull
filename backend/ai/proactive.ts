// ─── Proaktiv AI ──────────────────────────────────────────────────────────────
//
// Hozirgacha AI 100% "pull" edi: foydalanuvchi ochadi, yozadi, o'qiydi.
// Klinika egasi esa tizimga kuniga bir marta kiradi — ya'ni AI ning qiymati
// uning kirish chastotasi bilan cheklangan edi.
//
// Bu fayl oqimni teskari qiladi. Ikki xil xabar:
//
//   1. KUNLIK XULOSA — endi alohida xabar emas: 22:00 dagi yagona
//      hisobotning bir qismi (backend/botReports.ts). Bu yerdan faqat
//      detectAnomalies ishlatiladi.
//
//   2. ANOMALIYA SIGNALI — kun davomida: ko'rsatkich odatdagidan keskin
//      chetga chiqsa darhol xabar. "Bugungi tushum o'rtachadan 47% past" —
//      bu odam so'rashni o'ylamagan, lekin bilishi shart bo'lgan xabar.
//
// Anomaliya DETERMINISTIK aniqlanadi (z-baho), model faqat matn yozadi.
// Model "bu g'alati ko'rinadi" deb qaror qilsa, har kuni turlicha javob
// berardi va signalga ishonib bo'lmasdi.

const { prisma } = require('../db');
import { logAi } from './log';

// ─── Anomaliya aniqlash ──────────────────────────────────────────────────────

/** Necha kunlik tarix bilan solishtiramiz. */
const BASELINE_DAYS = 30;

/** Signal berish chegarasi. 2 sigma — taxminan 100 kundan 5 tasida. */
const Z_THRESHOLD = Number(process.env.AI_ANOMALY_Z || 2);

/** Tarix shuncha kundan kam bo'lsa, o'rtacha ishonchsiz — signal bermaymiz. */
const MIN_HISTORY = 10;

export interface Anomaly {
    metric: 'tushum' | 'qabul' | 'kelmagan';
    label: string;
    today: number;
    average: number;
    z: number;
    direction: 'past' | 'yuqori';
    /** Yomon xabarmi (e'tibor talab qiladimi). */
    bad: boolean;
    text: string;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

const stdev = (xs: number[], m: number): number => {
    if (xs.length < 2) return 0;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(v);
};

const som = (n: number): string => Math.round(n).toLocaleString('ru-RU');

const pct = (today: number, avg: number): number =>
    avg === 0 ? 0 : Math.round(((today - avg) / avg) * 100);

/** Sanani N kun orqaga suradi. */
const shiftDate = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/**
 * Bir kunlik ko'rsatkichlarni oxirgi 30 kun bilan solishtiradi.
 *
 * DIQQAT: faqat ish kunlari solishtiriladi degan qoida ataylab YO'Q.
 * Sabab: klinikalarning ish jadvali har xil (kimdir yakshanba ishlaydi,
 * kimdir yo'q) va buni bilmasdan filtrlash o'rtachani buzardi. O'rniga
 * chegara yetarlicha baland qo'yilgan — oddiy hafta oxiri tebranishi
 * 2 sigmadan oshmaydi.
 */
export const detectAnomalies = async (clinicId: string, today: string): Promise<Anomaly[]> => {
    const from = shiftDate(today, -BASELINE_DAYS);

    const [txs, appts] = await Promise.all([
        prisma.transaction.findMany({
            // lt ertasi: vaqtli sana ("2026-10-03T07:15...") bugungi kundan tushib qolmasin
            where: { clinicId, date: { gte: from, lt: shiftDate(today, 1) }, status: 'Paid' },
            select: { date: true, amount: true, type: true },
        }),
        prisma.appointment.findMany({
            where: { clinicId, date: { gte: from, lt: shiftDate(today, 1) } },
            select: { date: true, status: true },
        }),
    ]);

    // 'Balance' — avansdan yechish, kassaga yangi pul kirmaydi.
    // Manba: ai/tools.ts dagi MONEY_IN_METHODS bilan bir xil mantiq.
    const MONEY_IN = new Set(['Cash', 'CashCollection', 'Card', 'UzcardTerminal', 'HumoTerminal', 'Click', 'P2P', 'QrBank', 'QrUzcard', 'QrHumo', 'Transfer', 'Insurance']);

    const revByDate = new Map<string, number>();
    for (const t of txs) {
        if (t.type && !MONEY_IN.has(t.type)) continue;
        const day = String(t.date).slice(0, 10);
        revByDate.set(day, (revByDate.get(day) || 0) + t.amount);
    }

    const apptByDate = new Map<string, number>();
    const noshowByDate = new Map<string, number>();
    for (const a of appts) {
        // Bekor qilingan qabul sanalmaydi — Telegram hisobotidagi "Qabullar" bilan bir xil
        if (a.status === 'Cancelled') continue;
        apptByDate.set(a.date, (apptByDate.get(a.date) || 0) + 1);
        if (a.status === 'No-Show') noshowByDate.set(a.date, (noshowByDate.get(a.date) || 0) + 1);
    }

    // Tarixdagi kunlar ro'yxati — bugun kirmaydi.
    const historyDates: string[] = [];
    for (let i = BASELINE_DAYS; i >= 1; i--) historyDates.push(shiftDate(today, -i));

    const out: Anomaly[] = [];

    const evaluate = (
        metric: Anomaly['metric'],
        label: string,
        byDate: Map<string, number>,
        lowIsBad: boolean,
        format: (n: number) => string
    ) => {
        // Klinika ishlamagan kunlar (nol qabul VA nol tushum) o'rtachani
        // sun'iy ravishda pastga tortadi, keyin har qanday oddiy kun
        // "anomal darajada yuqori" bo'lib chiqardi. Shuning uchun butunlay
        // bo'sh kunlar tarixdan chiqariladi.
        const history = historyDates
            .map(d => ({ d, v: byDate.get(d) || 0 }))
            .filter(x => (apptByDate.get(x.d) || 0) > 0 || (revByDate.get(x.d) || 0) > 0)
            .map(x => x.v);

        if (history.length < MIN_HISTORY) return;

        const m = mean(history);
        const sd = stdev(history, m);
        if (sd === 0) return;

        const value = byDate.get(today) || 0;
        const z = (value - m) / sd;
        if (Math.abs(z) < Z_THRESHOLD) return;

        const direction: Anomaly['direction'] = z < 0 ? 'past' : 'yuqori';
        const bad = lowIsBad ? z < 0 : z > 0;
        const change = Math.abs(pct(value, m));

        out.push({
            metric, label, today: value, average: Math.round(m), z: Number(z.toFixed(2)),
            direction, bad,
            text: `${label}: ${format(value)} — o'rtachadan ${change}% ${direction} `
                + `(odatda ${format(Math.round(m))}).`,
        });
    };

    evaluate('tushum', 'Bugungi tushum', revByDate, true, n => `${som(n)} so'm`);
    evaluate('qabul', 'Bugungi qabullar', apptByDate, true, n => `${n} ta`);
    evaluate('kelmagan', 'Kelmagan bemorlar', noshowByDate, false, n => `${n} ta`);

    return out;
};

// ─── Takrorlanmaslik ─────────────────────────────────────────────────────────
// Bir xil signal kuniga bir marta yuboriladi. Aks holda har 30 daqiqada
// bir xil xabar kelib, foydalanuvchi bildirishnomalarni o'chirib qo'yardi —
// ya'ni butun mexanizm o'zini o'zi yo'q qilardi.

const sentToday = new Set<string>();
let sentDay = '';

const alreadySent = (clinicId: string, today: string, metric: string): boolean => {
    if (sentDay !== today) { sentToday.clear(); sentDay = today; }
    const key = `${clinicId}|${metric}`;
    if (sentToday.has(key)) return true;
    sentToday.add(key);
    return false;
};

// ─── Xabar yuborish ──────────────────────────────────────────────────────────

export interface ProactiveDeps {
    /** Klinika egasiga Telegram orqali xabar yuboradi. */
    notifyClinic: (clinicId: string, chatId: string, text: string) => Promise<any>;
}

/**
 * Anomaliyalarni tekshiradi va faqat YOMON tomonga chetlanishda xabar beradi.
 *
 * Yaxshi anomaliya ("tushum 60% yuqori") ham qiziq, lekin uni darhol
 * bildirishnoma qilib yuborish shovqin. U kunlik xulosada ko'rinadi.
 */
export const runAnomalyScan = async (today: string, deps: ProactiveDeps): Promise<{ alerts: number }> => {
    let alerts = 0;

    const clinics = await prisma.clinic.findMany({
        where: { telegramChatId: { not: null }, status: 'Active' },
        select: { id: true, name: true, telegramChatId: true },
    });

    for (const c of clinics) {
        try {
            const found = await detectAnomalies(c.id, today);
            const bad = found.filter(a => a.bad && !alreadySent(c.id, today, a.metric));
            if (!bad.length) continue;

            const text = ['⚠️ Diqqat talab qiladi', '', ...bad.map(a => `• ${a.text}`)].join('\n');
            await deps.notifyClinic(c.id, c.telegramChatId!, text);
            alerts++;

            await logAi({
                clinicId: c.id, endpoint: 'anomaly', lang: 'uz',
                question: `anomaliya ${today}`, reply: text,
                toolCalls: bad.map(a => ({ metric: a.metric, z: a.z })),
            });
        } catch (e: any) {
            console.error(`[AI:anomaly] ${c.name}: ${e?.message}`);
        }
    }

    if (alerts) console.log(`[AI:anomaly] ${alerts} ta klinikaga signal yuborildi.`);
    return { alerts };
};
