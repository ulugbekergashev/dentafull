/**
 * Telegram bot hisobotlari — rahbar uchun.
 *
 * Ilgari kechqurun ikkita xabar ketardi (21:00 AI xulosa va 22:00 "KUNLIK
 * HISOBOT"), ikkalasida ham qabullar va tushum takrorlanardi. Endi bitta
 * kechki hisobot (buildDailyReport) va botdagi "📊 Hisobot" menyusi
 * (buildReportScreen) — ikkalasi ham shu fayldagi bitta hisob-kitobdan.
 *
 * Raqamlar Moliya sahifasi qoidalari bilan hisoblanadi:
 *  - "Kassaga tushdi" — to'langan (Paid) va pul kiritadigan usullar; avansdan
 *    yechilgan ('Balance') pul yangi tushum emas, alohida ko'rsatiladi.
 *  - Qarzga yozilgan (Pending/Overdue) to'lov tushum emas.
 *  - Bekor qilingan qabul qabullar soniga kirmaydi.
 *
 * Filiallar: Appointment/Transaction/Expense/Patient da branchId bor. Filiali
 * yo'q klinikada filial bo'limi ko'rinmaydi. Filial belgilanmagan eski yozuvlar
 * "Filial belgilanmagan" qatorida turadi — yo'qolib qolmaydi.
 *
 * Xabarlar HTML formatda: bemor ismidagi "_" yoki "*" Markdown'ni buzib,
 * xabar umuman ketmay qolardi.
 */

import { prisma } from './db';
import { tashkentDateStr } from './triggers';
import { chat } from './aiService';
import { getClinicKey } from './ai/keys';
const { findDebtors, isMoneyIn, isAdvanceDeposit } = require('./ai/tools');
const { detectAnomalies } = require('./ai/proactive');

// ─── Davrlar ─────────────────────────────────────────────────────────────────

export type PeriodKey = 'd0' | 'd1' | 'w' | 'm' | 'pm';
export const PERIOD_KEYS: PeriodKey[] = ['d0', 'd1', 'w', 'm', 'pm'];
const PERIOD_LABEL: Record<PeriodKey, string> = {
    d0: 'Bugun', d1: 'Kecha', w: 'Shu hafta', m: 'Shu oy', pm: "O'tgan oy",
};

const addDays = (date: string, n: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const ddmm = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
const ddmmyyyy = (d: string) => d.split('-').reverse().join('.');

export function periodRange(key: PeriodKey, today = tashkentDateStr(0)): { from: string; to: string; label: string } {
    switch (key) {
        case 'd1': { const y = addDays(today, -1); return { from: y, to: y, label: `Kecha, ${ddmmyyyy(y)}` }; }
        case 'w': {
            // Hafta dushanbadan boshlanadi
            const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
            const from = addDays(today, -dow);
            return { from, to: today, label: `Shu hafta, ${ddmm(from)} — ${ddmm(today)}` };
        }
        case 'm': { const from = `${today.slice(0, 7)}-01`; return { from, to: today, label: `Shu oy, ${ddmm(from)} — ${ddmm(today)}` }; }
        case 'pm': {
            const lastOfPrev = addDays(`${today.slice(0, 7)}-01`, -1);
            const from = `${lastOfPrev.slice(0, 7)}-01`;
            return { from, to: lastOfPrev, label: `O'tgan oy, ${ddmm(from)} — ${ddmm(lastOfPrev)}` };
        }
        default: return { from: today, to: today, label: `Bugun, ${ddmmyyyy(today)}` };
    }
}

// ─── Formatlash ──────────────────────────────────────────────────────────────

export const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n: number) => Math.round(n || 0).toLocaleString('ru-RU');

const METHOD_LABEL: Record<string, string> = {
    Cash: 'Naqd', CashCollection: 'Naqd (inkassatsiya)', Card: 'Karta', UzcardTerminal: 'Uzcard',
    HumoTerminal: 'Humo', Click: 'Click / Payme', P2P: 'P2P', QrBank: 'QR bank', QrUzcard: 'QR Uzcard',
    QrHumo: 'QR Humo', Transfer: "O'tkazma", Insurance: "Sug'urta", Balance: 'Avansdan',
};
const CASH_DRAWER = new Set(['Cash', 'CashCollection']);
// Xarajat turlari — types.ts dagi EXPENSE_CATEGORY_LABELS bilan bir xil (ilgari bazadagi
// kalit ko'rinardi: "Other", "Lab", "DoctorShare")
const CATEGORY_LABEL: Record<string, string> = {
    DoctorShare: 'Shifokor ulushi', Salary: 'Oylik', Rent: 'Ijara', Utilities: 'Kommunal',
    Inventory: 'Ombor', Lab: 'Laboratoriya', Other: 'Boshqa',
};
const UNPAID = new Set(['Pending', 'Overdue']);

// ─── Ma'lumot va hisob ───────────────────────────────────────────────────────

interface PeriodData {
    appts: { status: string; doctorId: string; branchId: string | null }[];
    txs: { amount: number; type: string; status: string; service: string | null; doctorId: string | null; branchId: string | null }[];
    exps: { amount: number; category: string; branchId: string | null }[];
    newPatients: { branchId: string | null }[];
    branches: { id: string; name: string }[];
    doctors: { id: string; firstName: string; lastName: string }[];
}

/** branchId filtri: undefined — hammasi, null — filial belgilanmagan, satr — shu filial */
type BranchFilter = string | null | undefined;
const inBranch = (f: BranchFilter, b: string | null) => f === undefined || (f === null ? !b : b === f);

async function loadPeriod(clinicId: string, from: string, to: string): Promise<PeriodData> {
    // Sana satr; ba'zi yozuvlarda vaqt ham bor ("2026-10-02T10:00") — shuning uchun "lt ertasi"
    const date = { gte: from, lt: addDays(to, 1) };
    const created = { gte: new Date(`${from}T00:00:00+05:00`), lt: new Date(`${addDays(to, 1)}T00:00:00+05:00`) };
    const [appts, txs, exps, newPatients, branches, doctors] = await Promise.all([
        prisma.appointment.findMany({ where: { clinicId, date }, select: { status: true, doctorId: true, branchId: true } }),
        prisma.transaction.findMany({ where: { clinicId, date }, select: { amount: true, type: true, status: true, service: true, doctorId: true, branchId: true } }),
        prisma.expense.findMany({ where: { clinicId, date }, select: { amount: true, category: true, branchId: true } }),
        prisma.patient.findMany({ where: { clinicId, createdAt: created }, select: { branchId: true } }),
        prisma.branch.findMany({ where: { clinicId, status: 'Active' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true } }),
        prisma.doctor.findMany({ where: { clinicId }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    return { appts, txs: txs as any, exps, newPatients, branches, doctors };
}

interface Stats {
    appts: number; completed: number; noShow: number; cancelled: number;
    newPatients: number;
    income: number; cash: number; nonCash: number; fromBalance: number;
    byMethod: Record<string, number>;
    expense: number; byCategory: Record<string, number>;
    unpaid: number;
}

function computeStats(d: PeriodData, f: BranchFilter): Stats {
    const s: Stats = {
        appts: 0, completed: 0, noShow: 0, cancelled: 0, newPatients: 0,
        income: 0, cash: 0, nonCash: 0, fromBalance: 0, byMethod: {},
        expense: 0, byCategory: {}, unpaid: 0,
    };
    for (const a of d.appts) {
        if (!inBranch(f, a.branchId)) continue;
        if (a.status === 'Cancelled') { s.cancelled++; continue; }
        s.appts++;
        if (a.status === 'Completed') s.completed++;
        if (a.status === 'No-Show') s.noShow++;
    }
    for (const t of d.txs) {
        if (!inBranch(f, t.branchId)) continue;
        const amount = t.amount || 0;
        if (UNPAID.has(t.status)) { s.unpaid += amount; continue; }
        if (t.status !== 'Paid') continue;
        if (!isMoneyIn(t.type)) { s.fromBalance += amount; continue; }
        s.income += amount;
        if (CASH_DRAWER.has(t.type || 'Cash')) s.cash += amount; else s.nonCash += amount;
        const m = t.type || 'Cash';
        s.byMethod[m] = (s.byMethod[m] || 0) + amount;
    }
    for (const e of d.exps) {
        if (!inBranch(f, e.branchId)) continue;
        s.expense += e.amount || 0;
        s.byCategory[e.category || 'Boshqa'] = (s.byCategory[e.category || 'Boshqa'] || 0) + (e.amount || 0);
    }
    s.newPatients = d.newPatients.filter(p => inBranch(f, p.branchId)).length;
    return s;
}

const isEmpty = (s: Stats) => !s.appts && !s.cancelled && !s.income && !s.expense && !s.newPatients && !s.unpaid && !s.fromBalance;

interface DoctorRow { id: string; name: string; appts: number; completed: number; noShow: number; income: number }

function doctorRows(d: PeriodData, f: BranchFilter): DoctorRow[] {
    const rows = new Map<string, DoctorRow>();
    const nameOf = new Map(d.doctors.map(x => [x.id, `Dr. ${x.lastName} ${x.firstName}`.trim()]));
    const row = (id: string | null) => {
        const key = id || '';
        let r = rows.get(key);
        if (!r) { r = { id: key, name: id ? (nameOf.get(id) || 'Shifokor') : 'Shifokor belgilanmagan', appts: 0, completed: 0, noShow: 0, income: 0 }; rows.set(key, r); }
        return r;
    };
    for (const a of d.appts) {
        if (!inBranch(f, a.branchId) || a.status === 'Cancelled') continue;
        const r = row(a.doctorId);
        r.appts++;
        if (a.status === 'Completed') r.completed++;
        if (a.status === 'No-Show') r.noShow++;
    }
    // Avans depoziti hech bir shifokorning tushumi emas (Kassadagi kabi alohida qator).
    // Eski yozuvlarda u ro'yxatdagi birinchi shifokorga biriktirilgan — shuning uchun
    // doctorId ga qaralmaydi. Qatorlar yig'indisi baribir "Kassaga tushdi" ga teng.
    let advance = 0;
    for (const t of d.txs) {
        if (!inBranch(f, t.branchId) || t.status !== 'Paid' || !isMoneyIn(t.type)) continue;
        if (isAdvanceDeposit(t.service)) { advance += t.amount || 0; continue; }
        row(t.doctorId).income += t.amount || 0;
    }
    if (advance > 0) {
        rows.set('__advance__', { id: '__advance__', name: "Avans (oldindan to'lov)", appts: 0, completed: 0, noShow: 0, income: advance });
    }
    return [...rows.values()]
        .filter(r => r.appts > 0 || r.income > 0)
        .sort((a, b) => b.income - a.income || b.appts - a.appts);
}

/** Filiallar kesimi. Filial belgilanmagan yozuvlar faoliyati bo'lsa — alohida qator. */
function branchRows(d: PeriodData): { id: string; name: string; stats: Stats }[] {
    const out = d.branches.map(b => ({ id: b.id, name: b.name, stats: computeStats(d, b.id) }));
    const none = computeStats(d, null);
    if (!isEmpty(none)) out.push({ id: '-', name: 'Filial belgilanmagan', stats: none });
    return out;
}

// ─── Matn bo'laklari ─────────────────────────────────────────────────────────

function summaryLines(s: Stats): string[] {
    const lines: string[] = [];
    const parts = [`✅ yakunlandi ${s.completed}`, `❌ kelmadi ${s.noShow}`];
    if (s.cancelled) parts.push(`🚫 bekor ${s.cancelled}`);
    lines.push(`👥 Qabullar: <b>${s.appts}</b>`);
    lines.push(`     ${parts.join(' · ')}`);
    lines.push(`🆕 Yangi bemorlar: <b>${s.newPatients}</b>`);
    lines.push('');
    lines.push(`💰 Kassaga tushdi: <b>${money(s.income)}</b> so'm`);
    if (s.income) lines.push(`     💵 naqd ${money(s.cash)} · 💳 naqdsiz ${money(s.nonCash)}`);
    if (s.fromBalance) lines.push(`     avansdan yechildi ${money(s.fromBalance)} (kassaga kirmaydi)`);
    lines.push(`💸 Xarajat: <b>${money(s.expense)}</b> so'm`);
    lines.push(`📈 Sof: <b>${money(s.income - s.expense)}</b> so'm`);
    if (s.unpaid) lines.push(`📌 To'lanmay qoldi (qarz): <b>${money(s.unpaid)}</b> so'm`);
    return lines;
}

function branchBlock(rows: { name: string; stats: Stats }[]): string[] {
    const lines: string[] = [];
    for (const r of rows) {
        const s = r.stats;
        lines.push(`<b>${esc(r.name)}</b>`);
        lines.push(`     👥 ${s.appts} qabul · ✅ ${s.completed} · ❌ ${s.noShow}`);
        lines.push(`     💰 ${money(s.income)} · 💸 ${money(s.expense)} · 📈 ${money(s.income - s.expense)}`);
    }
    return lines;
}

function doctorBlock(rows: DoctorRow[], limit: number): string[] {
    const lines = rows.slice(0, limit).map((r, i) =>
        `${i + 1}. <b>${esc(r.name)}</b> — 💰 ${money(r.income)}`
        // Avans qatorida qabul bo'lmaydi — ikkinchi satr kerak emas
        + (r.id === '__advance__' ? '' : `\n     👥 ${r.appts} qabul · ✅ ${r.completed} · ❌ ${r.noShow}`));
    if (rows.length > limit) lines.push(`… yana ${rows.length - limit} ta shifokor`);
    return lines;
}

async function recallLine(clinicId: string): Promise<string> {
    const today = tashkentDateStr(0);
    const weekAhead = tashkentDateStr(7);
    const [due, overdue] = await Promise.all([
        prisma.recall.count({ where: { clinicId, status: { in: ['planned', 'reminded'] }, dueDate: { lte: weekAhead } } }),
        prisma.recall.count({ where: { clinicId, status: { in: ['planned', 'reminded'] }, dueDate: { lt: today } } }),
    ]);
    if (!due) return '';
    return `🔁 Nazoratga chaqirish: <b>${due}</b> ta${overdue ? ` (${overdue} tasi muddati o'tgan)` : ''}`;
}

/**
 * Telegram xabari 4096 belgidan oshmasin. Qatorlab qisqartiriladi — belgi bo'yicha
 * kesilsa HTML teg yarmida qolib, xabar umuman ketmay qolardi.
 */
function fitTelegram(lines: string[], limit = 3900): string {
    const out: string[] = [];
    let len = 0;
    for (const l of lines) {
        if (len + l.length + 1 > limit) { out.push('…'); break; }
        out.push(l);
        len += l.length + 1;
    }
    return out.join('\n');
}

// ─── Kunlik hisobot (vaqti sozlamada, standart 22:00) ────────────────────────

/**
 * Hisobot qaysi kun uchun: rahbar vaqtni tushdan oldinga qo'ygan bo'lsa (masalan
 * 08:00) — bugun hali boshlanmagan, shuning uchun kechagi kun; aks holda bugun.
 */
export const reportDayOffset = (time: string): 0 | -1 => (parseInt(time, 10) < 12 ? -1 : 0);

/**
 * Bitta to'liq kunlik hisobot. Kun butunlay bo'sh bo'lsa (dam olish kuni) —
 * null: bo'sh xabar yuborilmaydi.
 */
export async function buildDailyReport(clinic: { id: string; name: string }, dayOffset: 0 | -1 = 0): Promise<string | null> {
    const today = tashkentDateStr(dayOffset);
    const data = await loadPeriod(clinic.id, today, today);
    const total = computeStats(data, undefined);
    if (isEmpty(total)) return null;

    const lines: string[] = [
        `📊 <b>${dayOffset ? 'Kechagi hisobot' : 'Kunlik hisobot'}</b> — ${ddmmyyyy(today)}`,
        esc(clinic.name),
        '',
        ...summaryLines(total),
    ];

    if (data.branches.length > 0) {
        lines.push('', '🏢 <b>Filiallar</b>', ...branchBlock(branchRows(data)));
    }

    const docs = doctorRows(data, undefined);
    if (docs.length) lines.push('', '👨‍⚕️ <b>Shifokorlar</b>', ...doctorBlock(docs, 5));

    const recall = await recallLine(clinic.id).catch(() => '');
    if (recall) lines.push('', recall);

    // Kun davomida keskin chetlanish bo'lgan bo'lsa (z-baho) — eslatib qo'yamiz
    const anomalies = await detectAnomalies(clinic.id, today).catch(() => []);
    const bad = (anomalies as any[]).filter(a => a.bad);
    if (bad.length) lines.push('', "⚠️ <b>E'tibor</b>", ...bad.map(a => `• ${esc(a.text)}`));

    const advice = await adviceFor(clinic.id, total, dayOffset ? 'bugun' : 'ertaga');
    if (advice) lines.push('', `💡 ${esc(advice)}`);

    return fitTelegram(lines);
}

/** Ertaga (yoki ertalabki hisobotda — bugun) nimaga e'tibor berish kerak — 2 gap. Raqamlar tayyor; model faqat izoh yozadi. */
async function adviceFor(clinicId: string, s: Stats, when: 'ertaga' | 'bugun'): Promise<string> {
    const facts = `Qabullar ${s.appts}, yakunlandi ${s.completed}, kelmadi ${s.noShow}, bekor ${s.cancelled}, `
        + `yangi bemorlar ${s.newPatients}, kassaga tushdi ${money(s.income)} so'm, xarajat ${money(s.expense)} so'm, `
        + `qarzga yozildi ${money(s.unpaid)} so'm.`;
    try {
        const text = await chat(
            [
                {
                    role: 'system',
                    content: 'Sen stomatologiya klinikasi egasiga kunlik hisobot izohini yozasan. '
                        + 'Senga TAYYOR raqamlar beriladi — ularni qayta hisoblama va yangi raqam qo\'shma. '
                        + `Vazifang: 2 gapda ${when} nimaga e\'tibor berish kerakligini ayt. `
                        + 'Markdown, emoji va sarlavha ishlatma, faqat oddiy matn, o\'zbek tilida.',
                },
                { role: 'user', content: facts },
            ],
            { task: 'cheap', maxTokens: 180, label: 'digest', clinicKey: await getClinicKey(clinicId) }
        );
        return (text || '').trim();
    } catch (e: any) {
        // Izoh bo'lmasa ham hisobot to'liq — raqamlar tayyor
        console.warn('[botReports] izoh yozilmadi:', e?.message);
        return '';
    }
}

// ─── "📊 Hisobot" menyusi ────────────────────────────────────────────────────

export type ReportSection = 'sum' | 'br' | 'doc' | 'cash' | 'debt' | 'ns';
const SECTIONS: ReportSection[] = ['sum', 'br', 'doc', 'cash', 'debt', 'ns'];

/** Callback: rp:<davr>:<bo'lim>:<filial> (filial: '' — hammasi, '-' — belgilanmagan, aks holda id) */
export const reportCallback = (p: PeriodKey, s: ReportSection, b = '') => `rp:${p}:${s}:${b}`;
export function parseReportCallback(data: string): { p: PeriodKey; s: ReportSection; b: string } | null {
    const m = /^rp:([a-z0-9]+):([a-z]+):(.*)$/.exec(data);
    if (!m) return null;
    const p = m[1] as PeriodKey, s = m[2] as ReportSection;
    if (!PERIOD_KEYS.includes(p) || !SECTIONS.includes(s)) return null;
    return { p, s, b: m[3] };
}

const SHORT_PERIOD: Record<PeriodKey, string> = { d0: 'Bugun', d1: 'Kecha', w: 'Hafta', m: 'Oy', pm: "O'tgan oy" };

/**
 * Hisobot ekrani: matn + tugmalar. Bitta xabar tugma bosilganda o'zgaradi
 * (editMessageText) — chat hisobotlar bilan to'lib ketmaydi.
 */
export async function buildReportScreen(
    clinic: { id: string; name: string },
    p: PeriodKey,
    s: ReportSection,
    b: string,
): Promise<{ text: string; keyboard: any[][] }> {
    const range = periodRange(p);
    const data = await loadPeriod(clinic.id, range.from, range.to);
    const hasBranches = data.branches.length > 0;
    const filter: BranchFilter = !b ? undefined : b === '-' ? null : b;
    const branchName = b === '-' ? 'Filial belgilanmagan' : data.branches.find(x => x.id === b)?.name;

    const head = [
        `📊 <b>Hisobot</b> · ${esc(clinic.name)}`,
        `🗓 ${range.label}${branchName ? `\n🏢 ${esc(branchName)}` : ''}`,
        '',
    ];
    let body: string[] = [];

    switch (s) {
        case 'br': {
            body = ['🏢 <b>Filiallar bo\'yicha</b>', ...branchBlock(branchRows(data))];
            if (!hasBranches) body = ['Klinikada filial yo\'q.'];
            break;
        }
        case 'doc': {
            const rows = doctorRows(data, filter);
            body = ['👨‍⚕️ <b>Shifokorlar bo\'yicha</b>', ...(rows.length ? doctorBlock(rows, 25) : ['Bu davrda qabul ham, to\'lov ham yo\'q.'])];
            break;
        }
        case 'cash': {
            const st = computeStats(data, filter);
            const methods = Object.entries(st.byMethod).sort((x, y) => y[1] - x[1]);
            const cats = Object.entries(st.byCategory).sort((x, y) => y[1] - x[1]);
            body = ['💰 <b>Kassa</b>', `Kassaga tushdi: <b>${money(st.income)}</b> so'm`];
            if (methods.length) body.push(...methods.map(([k, v]) => `• ${esc(METHOD_LABEL[k] || k)} — ${money(v)}`));
            if (st.fromBalance) body.push(`Avansdan yechildi: ${money(st.fromBalance)} (kassaga kirmaydi)`);
            body.push('', `💸 Xarajat: <b>${money(st.expense)}</b> so'm`);
            if (cats.length) body.push(...cats.slice(0, 15).map(([k, v]) => `• ${esc(CATEGORY_LABEL[k] || k)} — ${money(v)}`));
            body.push('', `📈 Sof: <b>${money(st.income - st.expense)}</b> so'm`);
            if (st.unpaid) body.push(`📌 To'lanmay qoldi (qarz): ${money(st.unpaid)} so'm`);
            break;
        }
        case 'debt': {
            // Filial tanlangan bo'lsa — faqat shu filial bemorlari (sarlavhada filial nomi turadi)
            const all = await findDebtors({ clinicId: clinic.id, role: 'CLINIC_ADMIN' });
            const list = filter === undefined
                ? all
                : all.filter((x: any) => (filter === null ? !x.patient?.branchId : x.patient?.branchId === filter));
            const sum = list.reduce((acc: number, x: any) => acc + x.summa, 0);
            body = ['📌 <b>Qarzdorlar</b> — hozirgi holat (davrga bog\'liq emas)', `Jami: <b>${list.length}</b> ta · <b>${money(sum)}</b> so'm`, ''];
            body.push(...list.slice(0, 20).map((x: any, i: number) => {
                const name = x.patient ? `${x.patient.lastName} ${x.patient.firstName}`.trim() : x.ism;
                const phone = x.patient?.phone ? ` · ${esc(x.patient.phone)}` : '';
                return `${i + 1}. ${esc(name)} — <b>${money(x.summa)}</b>${phone}`;
            }));
            if (list.length > 20) body.push(`… yana ${list.length - 20} ta`);
            if (!list.length) body = ['📌 Qarzdor bemor yo\'q — hammasi to\'langan. ✅'];
            break;
        }
        case 'ns': {
            const rows = await prisma.appointment.findMany({
                where: {
                    clinicId: clinic.id, status: 'No-Show',
                    date: { gte: range.from, lt: addDays(range.to, 1) },
                    ...(filter === undefined ? {} : { branchId: filter }),
                },
                orderBy: [{ date: 'desc' }, { time: 'asc' }],
                take: 30,
                select: { date: true, time: true, patientName: true, doctorName: true, patient: { select: { phone: true } } },
            });
            body = ['❌ <b>Kelmaganlar</b>'];
            body.push(...(rows.length
                ? rows.map((r: any) => `• ${ddmm(r.date)} ${esc(r.time)} — ${esc(r.patientName)} (${esc(r.doctorName)})${r.patient?.phone ? ` · ${esc(r.patient.phone)}` : ''}`)
                : ['Bu davrda kelmagan bemor yo\'q. ✅']));
            break;
        }
        default: {
            const st = computeStats(data, filter);
            body = isEmpty(st) ? ['Bu davrda qabul ham, to\'lov ham yo\'q.'] : summaryLines(st);
            if (filter === undefined && hasBranches && !isEmpty(st)) {
                body.push('', '🏢 <b>Filiallar</b>', ...branchBlock(branchRows(data)));
            }
        }
    }

    // ── Tugmalar ──
    const mark = (on: boolean, label: string) => (on ? `• ${label} •` : label);
    const keyboard: any[][] = [
        PERIOD_KEYS.slice(0, 3).map(k => ({ text: mark(k === p, SHORT_PERIOD[k]), callback_data: reportCallback(k, s, b) })),
        PERIOD_KEYS.slice(3).map(k => ({ text: mark(k === p, SHORT_PERIOD[k]), callback_data: reportCallback(k, s, b) })),
        [
            { text: mark(s === 'sum', '📊 Umumiy'), callback_data: reportCallback(p, 'sum', b) },
            { text: mark(s === 'doc', '👨‍⚕️ Shifokorlar'), callback_data: reportCallback(p, 'doc', b) },
        ],
        [
            { text: mark(s === 'cash', '💰 Kassa'), callback_data: reportCallback(p, 'cash', b) },
            { text: mark(s === 'debt', '📌 Qarzdorlar'), callback_data: reportCallback(p, 'debt', b) },
            { text: mark(s === 'ns', '❌ Kelmaganlar'), callback_data: reportCallback(p, 'ns', b) },
        ],
    ];
    if (hasBranches) {
        keyboard.push([{ text: mark(s === 'br', '🏢 Filiallar taqqoslash'), callback_data: reportCallback(p, 'br', '') }]);
        // Bitta filialni tanlab, barcha bo'limlarni shu filial bo'yicha ko'rish
        const opts = [{ id: '', name: '🏢 Hammasi' }, ...data.branches.map(x => ({ id: x.id, name: x.name }))];
        for (let i = 0; i < opts.length; i += 3) {
            keyboard.push(opts.slice(i, i + 3).map(o => ({
                text: mark(o.id === b, o.name.length > 20 ? `${o.name.slice(0, 19)}…` : o.name),
                callback_data: reportCallback(p, s === 'br' ? 'sum' : s, o.id),
            })));
        }
    }

    return { text: fitTelegram([...head, ...body]), keyboard };
}
