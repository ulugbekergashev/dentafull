import { Appointment } from '../types';
import { calcAge, formatDateToISO } from '../utils/dateUtils';
import { buildUnpaidRows } from '../utils/unpaid';
import { DEMO_APPOINTMENTS, DEMO_CLINIC, DEMO_DOCTORS, DEMO_EXPENSES, DEMO_INVENTORY, DEMO_LEADS, DEMO_PATIENTS, DEMO_SERVICES, DEMO_TEETH, DEMO_TRANSACTIONS, ensureDemoData } from './demoData';

/**
 * DentaAI demo rejimda. Haqiqiy DentaAI serverdagi model orqali klinika ma'lumotini o'qiydi;
 * demo esa serverga bormaydi — hisobot, kun pulsi, kartochkalar va javoblar shu yerda demo
 * klinika ma'lumotidan hisoblanadi va oqim ko'rinishida (so'zma-so'z) chiqariladi. Javob
 * turlari server javoblari bilan bir xil shaklda (components/ai/ ularni o'zgartirmasdan chizadi):
 * pulsi — backend/ai/pulse.ts, kartochkalar — backend/ai/evidence.ts.
 */

type Lang = 'uz' | 'ru';
type ReportType = 'today' | 'performance' | 'finance' | 'debtors' | 'inventory' | 'leads';

const REPORT_ROLES: Record<ReportType, string[]> = {
    today: ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    performance: ['CLINIC_ADMIN'],
    finance: ['CLINIC_ADMIN'],
    debtors: ['CLINIC_ADMIN', 'RECEPTIONIST'],
    inventory: ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    leads: ['CLINIC_ADMIN', 'RECEPTIONIST'],
};

const TEXT: Record<ReportType, Record<Lang, { title: string; hint: string; empty: string }>> = {
    today: {
        uz: { title: 'Bugungi hisobot', hint: 'Qabullar, kelmaganlar, bugungi tushum', empty: "Bugunga qabul ham, to'lov ham yozilmagan. Jadval bo'sh." },
        ru: { title: 'Отчёт за сегодня', hint: 'Приёмы, неявки, выручка за день', empty: 'На сегодня нет ни приёмов, ни платежей. Расписание пустое.' },
    },
    performance: {
        uz: { title: 'Samaradorlik', hint: 'Shifokorlar kesimida qabul va tushum', empty: "Bu davrda shifokorlar bo'yicha yozuv yo'q." },
        ru: { title: 'Эффективность', hint: 'Приёмы и выручка по врачам', empty: 'За этот период нет записей по врачам.' },
    },
    finance: {
        uz: { title: 'Moliya holati', hint: "Tushum, xarajat, to'lov usullari", empty: "Bu oyda hali to'lov ham, xarajat ham yozilmagan." },
        ru: { title: 'Финансы', hint: 'Выручка, расходы, способы оплаты', empty: 'В этом месяце ещё нет ни платежей, ни расходов.' },
    },
    debtors: {
        uz: { title: 'Qarzdorlar', hint: 'Kim qancha qarz, jami summa', empty: "Qarzdor bemor yo'q — hammasi to'langan." },
        ru: { title: 'Должники', hint: 'Кто сколько должен, общая сумма', empty: 'Должников нет — всё оплачено.' },
    },
    inventory: {
        uz: { title: 'Ombor', hint: 'Tugayotgan materiallar', empty: "Omborda hali material qo'shilmagan." },
        ru: { title: 'Склад', hint: 'Заканчивающиеся материалы', empty: 'На склад ещё не добавлены материалы.' },
    },
    leads: {
        uz: { title: 'Lidlar', hint: 'Manba, konversiya, javobsizlar', empty: 'Oxirgi 30 kunda lid kelmagan.' },
        ru: { title: 'Лиды', hint: 'Источник, конверсия, без ответа', empty: 'За последние 30 дней лидов не было.' },
    },
};

const STATUS: Record<Appointment['status'], Record<Lang, string>> = {
    Pending: { uz: 'Kutilmoqda', ru: 'Ожидается' },
    Confirmed: { uz: 'Tasdiqlangan', ru: 'Подтверждён' },
    'Checked-In': { uz: 'Keldi', ru: 'Пришёл' },
    Completed: { uz: 'Yakunlangan', ru: 'Завершён' },
    'No-Show': { uz: 'Kelmadi', ru: 'Не пришёл' },
    Cancelled: { uz: 'Bekor qilindi', ru: 'Отменён' },
};

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const som = (n: number, lang: Lang) => `${fmt(n)} ${lang === 'ru' ? 'сум' : "so'm"}`;
const doctorName = (id?: string) => {
    const d = DEMO_DOCTORS.find(x => x.id === id);
    return d ? `Dr. ${d.lastName}` : '—';
};

function currentRole(): string {
    try {
        const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        return (raw && JSON.parse(raw).role) || 'CLINIC_ADMIN';
    } catch {
        return 'CLINIC_ADMIN';
    }
}

// ── Hisob-kitoblar ───────────────────────────────────────────────────────────

function dates() {
    const now = new Date();
    const today = formatDateToISO(now);
    const monthFrom = formatDateToISO(new Date(now.getFullYear(), now.getMonth(), 1));
    return { today, monthFrom };
}

const paidIn = (from: string, to: string) =>
    DEMO_TRANSACTIONS.filter(t => t.status === 'Paid' && t.date >= from && t.date <= to);

function todayFacts() {
    const { today } = dates();
    const list = DEMO_APPOINTMENTS.filter(a => a.date === today);
    const count = (s: Appointment['status']) => list.filter(a => a.status === s).length;
    const revenue = paidIn(today, today).reduce((s, t) => s + t.amount, 0);
    const byDoctor = new Map<string, number>();
    for (const a of list) if (a.status !== 'Cancelled') byDoctor.set(a.doctorId, (byDoctor.get(a.doctorId) || 0) + 1);
    const busiest = [...byDoctor.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
        list, total: list.filter(a => a.status !== 'Cancelled').length, revenue, busiest,
        completed: count('Completed'), confirmed: count('Confirmed'), pending: count('Pending'),
        arrived: count('Checked-In'), noShow: count('No-Show'),
    };
}

function doctorStats() {
    const { today, monthFrom } = dates();
    const month = DEMO_APPOINTMENTS.filter(a => a.date >= monthFrom && a.date <= today);
    const pay = paidIn(monthFrom, today);
    return DEMO_DOCTORS.map(d => {
        const mine = month.filter(a => a.doctorId === d.id);
        return {
            name: `Dr. ${d.lastName}`,
            visits: mine.filter(a => a.status !== 'Cancelled').length,
            done: mine.filter(a => a.status === 'Completed').length,
            noShow: mine.filter(a => a.status === 'No-Show').length,
            revenue: pay.filter(t => t.doctorId === d.id).reduce((s, t) => s + t.amount, 0),
        };
    });
}

function financeFacts() {
    const { today, monthFrom } = dates();
    const pay = paidIn(monthFrom, today);
    const revenue = pay.reduce((s, t) => s + t.amount, 0);
    const expenses = DEMO_EXPENSES.filter(e => e.date >= monthFrom && e.date <= today).reduce((s, e) => s + e.amount, 0);
    const byMethod = new Map<string, number>();
    for (const t of pay) byMethod.set(t.type, (byMethod.get(t.type) || 0) + t.amount);
    return { revenue, expenses, net: revenue - expenses, count: pay.length, byMethod };
}

const METHOD: Record<string, Record<Lang, string>> = {
    Cash: { uz: 'Naqd', ru: 'Наличные' },
    Card: { uz: 'Karta', ru: 'Карта' },
    Click: { uz: 'Click / Payme', ru: 'Click / Payme' },
    Transfer: { uz: "O'tkazma", ru: 'Перевод' },
};

function debtorFacts() {
    const rows = buildUnpaidRows(DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_SERVICES, { today: dates().today });
    const byPatient = new Map<string, { id: string | null; name: string; phone: string; debt: number; last: string }>();
    for (const r of rows) {
        if (r.amount <= 0) continue;
        const key = r.patientId || r.patientName;
        const p = DEMO_PATIENTS.find(x => x.id === r.patientId);
        const cur = byPatient.get(key) || { id: r.patientId || null, name: r.patientName, phone: p?.phone || '—', debt: 0, last: p?.lastVisit || '—' };
        cur.debt += r.amount;
        byPatient.set(key, cur);
    }
    const list = [...byPatient.values()].sort((a, b) => b.debt - a.debt);
    return { list, total: list.reduce((s, x) => s + x.debt, 0) };
}

const lowStock = () => DEMO_INVENTORY.filter(i => i.quantity <= i.minQuantity);

function leadFacts() {
    const since = formatDateToISO(new Date(Date.now() - 30 * 86400000));
    const list = DEMO_LEADS.filter(l => l.createdAt.slice(0, 10) >= since);
    const bySource = new Map<string, number>();
    for (const l of list) bySource.set(l.source || '—', (bySource.get(l.source || '—') || 0) + 1);
    return {
        total: list.length,
        booked: list.filter(l => l.status === 'Booked').length,
        fresh: list.filter(l => l.status === 'New').length,
        bySource,
    };
}

// ── Hisobotlar ───────────────────────────────────────────────────────────────

function buildReport(type: ReportType, lang: Lang) {
    const ru = lang === 'ru';
    const { today, monthFrom } = dates();
    const monthPeriod = `${monthFrom} — ${today}`;
    const txt = TEXT[type][lang];
    const good = (n: number) => (n > 0 ? 'good' : 'neutral');
    const warn = (n: number) => (n > 0 ? 'warn' : 'neutral');
    const base = { type, title: txt.title, emptyText: txt.empty };

    if (type === 'today') {
        const f = todayFacts();
        const inChair = f.arrived;
        return {
            ...base, period: today, empty: f.total === 0,
            metrics: [
                { label: ru ? 'Всего приёмов' : 'Jami qabul', value: f.total, unit: ru ? 'шт' : 'ta' },
                { label: ru ? 'Подтверждено' : 'Tasdiqlangan', value: f.confirmed, unit: ru ? 'шт' : 'ta', tone: good(f.confirmed) },
                { label: ru ? 'Завершено' : 'Yakunlangan', value: f.completed, unit: ru ? 'шт' : 'ta', tone: good(f.completed) },
                { label: ru ? 'Не пришли' : 'Kelmagan', value: f.noShow, unit: ru ? 'шт' : 'ta', tone: warn(f.noShow) },
                { label: ru ? 'Выручка за день' : 'Bugungi tushum', value: fmt(f.revenue), unit: ru ? 'сум' : "so'm", tone: good(f.revenue) },
            ],
            narrative: ru
                ? `Сегодня ${f.total} приёмов: ${f.completed} завершено, ${inChair} пациентов в клинике, ${f.confirmed + f.pending} ещё придут. ${f.busiest ? `Больше всего приёмов у ${doctorName(f.busiest[0])} (${f.busiest[1]}).` : ''}`
                : `Bugun ${f.total} ta qabul: ${f.completed} tasi yakunlandi, ${inChair} nafar bemor klinikada, yana ${f.confirmed + f.pending} nafari keladi. ${f.busiest ? `Eng band shifokor — ${doctorName(f.busiest[0])} (${f.busiest[1]} ta qabul).` : ''}`,
            table: {
                columns: ru ? ['Время', 'Врач', 'Пациент', 'Статус'] : ['Vaqt', 'Shifokor', 'Bemor', 'Status'],
                rows: [...f.list].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 12)
                    .map(a => [a.time, doctorName(a.doctorId), a.patientName, STATUS[a.status][lang]]),
            },
            sources: ['get_appointments', 'get_revenue'],
        };
    }
    if (type === 'performance') {
        const docs = doctorStats();
        const total = docs.reduce((s, d) => s + d.revenue, 0);
        const top = [...docs].sort((a, b) => b.revenue - a.revenue)[0];
        const noShow = docs.reduce((s, d) => s + d.noShow, 0);
        return {
            ...base, period: monthPeriod, empty: total === 0,
            metrics: [
                { label: ru ? 'Врачей' : 'Shifokorlar', value: docs.length, unit: ru ? 'чел' : 'ta' },
                { label: ru ? 'Общая выручка' : 'Jami tushum', value: fmt(total), unit: ru ? 'сум' : "so'm", tone: good(total) },
                { label: ru ? 'Лидер' : 'Yetakchi', value: top?.name || '—', hint: top ? som(top.revenue, lang) : undefined },
                { label: ru ? 'Неявки' : 'Kelmaganlar', value: noShow, unit: ru ? 'шт' : 'ta', tone: warn(noShow) },
            ],
            narrative: ru
                ? `За месяц лидирует ${top?.name}: ${som(top?.revenue || 0, lang)}. Неявок — ${noShow}; им стоит позвонить и перезаписать.`
                : `Oy boshidan ${top?.name} yetakchi: ${som(top?.revenue || 0, lang)}. Kelmaganlar — ${noShow} ta; ularga qo'ng'iroq qilib, qayta yozish kerak.`,
            table: {
                columns: ru ? ['Врач', 'Приёмы', 'Завершено', 'Неявки', 'Выручка'] : ['Shifokor', 'Qabul', 'Yakunlangan', 'Kelmagan', 'Tushum'],
                rows: docs.map(d => [d.name, d.visits, d.done, d.noShow, fmt(d.revenue)]),
            },
            sources: ['get_doctor_stats'],
        };
    }
    if (type === 'finance') {
        const f = financeFacts();
        return {
            ...base, period: monthPeriod, empty: f.count === 0,
            metrics: [
                { label: ru ? 'Поступило в кассу' : 'Kassaga kirgan', value: fmt(f.revenue), unit: ru ? 'сум' : "so'm", tone: good(f.revenue) },
                { label: ru ? 'Расходы' : 'Xarajat', value: fmt(f.expenses), unit: ru ? 'сум' : "so'm", tone: f.expenses > 0 ? 'bad' : 'neutral' },
                { label: ru ? 'Чистыми' : 'Sof', value: fmt(f.net), unit: ru ? 'сум' : "so'm", tone: f.net >= 0 ? 'good' : 'bad' },
                { label: ru ? 'Платежей' : "To'lovlar", value: f.count, unit: ru ? 'шт' : 'ta' },
            ],
            narrative: ru
                ? `С начала месяца поступило ${som(f.revenue, lang)}, расходы — ${som(f.expenses, lang)}. Чистая прибыль ${som(f.net, lang)}.`
                : `Oy boshidan kassaga ${som(f.revenue, lang)} kirdi, xarajat — ${som(f.expenses, lang)}. Sof foyda ${som(f.net, lang)}.`,
            table: {
                columns: ru ? ['Способ оплаты', 'Сумма'] : ["To'lov usuli", 'Summa'],
                rows: [...f.byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [METHOD[k]?.[lang] || k, fmt(v)]),
            },
            sources: ['get_revenue'],
        };
    }
    if (type === 'debtors') {
        const d = debtorFacts();
        return {
            ...base, period: ru ? 'Текущее состояние' : 'Hozirgi holat', empty: d.list.length === 0,
            metrics: [
                { label: ru ? 'Должников' : 'Qarzdorlar', value: d.list.length, unit: ru ? 'чел' : 'ta', tone: warn(d.list.length) },
                { label: ru ? 'Общий долг' : 'Jami qarz', value: fmt(d.total), unit: ru ? 'сум' : "so'm", tone: d.total > 0 ? 'bad' : 'neutral' },
                { label: ru ? 'Самый большой' : 'Eng katta', value: d.list[0]?.name || '—', hint: d.list[0] ? som(d.list[0].debt, lang) : undefined },
            ],
            narrative: ru
                ? `${d.list.length} пациентов не оплатили ${som(d.total, lang)}. Начните с ${d.list[0]?.name || '—'}.`
                : `${d.list.length} nafar bemor ${som(d.total, lang)} to'lamagan. ${d.list[0]?.name || '—'} dan boshlash kerak.`,
            table: {
                columns: ru ? ['Пациент', 'Телефон', 'Долг', 'Последний визит'] : ['Bemor', 'Telefon', 'Qarz', 'Oxirgi tashrif'],
                rows: d.list.slice(0, 20).map(x => [x.name, x.phone, fmt(x.debt), x.last]),
            },
            sources: ['get_debtors'],
        };
    }
    if (type === 'inventory') {
        const low = lowStock();
        return {
            ...base, period: ru ? 'Текущее состояние' : 'Hozirgi holat', empty: DEMO_INVENTORY.length === 0,
            metrics: [
                { label: ru ? 'Всего позиций' : 'Jami pozitsiya', value: DEMO_INVENTORY.length, unit: ru ? 'шт' : 'ta' },
                { label: ru ? 'Заканчиваются' : 'Tugayotgan', value: low.length, unit: ru ? 'шт' : 'ta', tone: low.length > 0 ? 'warn' : 'good' },
            ],
            narrative: low.length
                ? (ru ? `Заканчиваются: ${low.map(i => i.name).join(', ')}. Стоит заказать заранее.` : `Tugayapti: ${low.map(i => i.name).join(', ')}. Oldindan buyurtma berish kerak.`)
                : (ru ? 'Все материалы в норме.' : 'Hamma material yetarli.'),
            table: {
                columns: ru ? ['Материал', 'Остаток', 'Минимум', 'Ед.'] : ['Material', 'Qoldiq', 'Minimum', "O'lchov"],
                rows: (low.length ? low : DEMO_INVENTORY).map(i => [i.name, i.quantity, i.minQuantity, i.unit]),
            },
            sources: ['get_low_stock'],
        };
    }
    const l = leadFacts();
    return {
        ...base, period: ru ? 'Последние 30 дней' : 'Oxirgi 30 kun', empty: l.total === 0,
        metrics: [
            { label: ru ? 'Всего лидов' : 'Jami lid', value: l.total, unit: ru ? 'шт' : 'ta' },
            { label: ru ? 'Стали пациентами' : 'Bemorga aylandi', value: l.booked, unit: ru ? 'шт' : 'ta', tone: good(l.booked), hint: l.total ? `${Math.round((l.booked / l.total) * 100)}% ${ru ? 'конверсия' : 'konversiya'}` : undefined },
            { label: ru ? 'Без ответа' : 'Javobsiz', value: l.fresh, unit: ru ? 'шт' : 'ta', tone: warn(l.fresh) },
        ],
        narrative: ru
            ? `${l.fresh} новых заявок ждут звонка — чем быстрее ответ, тем выше конверсия.`
            : `${l.fresh} ta yangi ariza qo'ng'iroq kutyapti — tez javob berilsa, bemorga aylanishi ehtimoli yuqori.`,
        table: {
            columns: ru ? ['Источник', 'Лиды'] : ['Manba', 'Lidlar'],
            rows: [...l.bySource.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
        },
        sources: ['get_leads'],
    };
}

// ── Kontekst, kartochkalar va puls ───────────────────────────────────────────
// Server bilan bir xil shakl: backend/ai/evidence.ts (kartochkalar) va
// backend/ai/pulse.ts (kun pulsi). Demo ham panelning to'liq imkoniyatini
// ko'rsatishi kerak — sotuvchi aynan shu yerda mahsulotni namoyish qiladi.

type Ctx = { kind?: string; patientId?: string; page?: string } | undefined;

const toMin = (t: string) => {
    const [h, m] = String(t || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const nowHHMM = () => {
    const d = new Date();
    return hhmm(d.getHours() * 60 + d.getMinutes());
};
const shiftDay = (days: number) => formatDateToISO(new Date(Date.now() + days * 86400000));
const fullName = (p?: { firstName?: string; lastName?: string }) => (p ? `${p.lastName || ''} ${p.firstName || ''}`.trim() : '—');
const uiLang = (): Lang => {
    try { return localStorage.getItem('app_language') === 'ru' ? 'ru' : 'uz'; } catch { return 'uz'; }
};

/** "- Plomba (Tish #16) [300 000 UZS]" — backend/ai/tools.ts dagi bilan bir xil o'qiladi. */
function procedures(notes: string | undefined, date: string) {
    const out: { date: string; name: string; tooth: number | null; price: number }[] = [];
    for (const raw of String(notes || '').split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('-')) continue;
        let name = line.replace(/^-\s*/, '');
        const cut = name.search(/\s*(\((?:Tish #\d+|Umumiy)\)|\[[\d\s]+UZS\])/i);
        if (cut > 0) name = name.slice(0, cut);
        const tooth = line.match(/\(Tish #(\d+)\)/i);
        const price = line.match(/\[([\d\s]+)UZS\]/i);
        if (name.trim()) {
            out.push({ date, name: name.trim(), tooth: tooth ? Number(tooth[1]) : null, price: price ? Number(price[1].replace(/\D/g, '')) : 0 });
        }
    }
    return out;
}

function patientCard(id: string) {
    const p = DEMO_PATIENTS.find(x => x.id === id);
    if (!p) return null;
    const { today } = dates();
    const now = nowHHMM();
    const mine = DEMO_APPOINTMENTS
        .filter(a => a.patientId === id)
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    const next = mine
        .filter(a => (a.status === 'Pending' || a.status === 'Confirmed') && (a.date > today || (a.date === today && a.time >= now)))
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    const past = mine.filter(a => a.date < today || (a.date === today && a.time < now));
    const teeth: Record<string, number> = {};
    for (const t of DEMO_TEETH.filter((x: any) => x?.patientId === id)) {
        let list: any = t.conditions;
        try { if (typeof list === 'string') list = JSON.parse(list); } catch { list = []; }
        for (const c of Array.isArray(list) ? list : []) {
            const k = typeof c === 'string' ? c : c?.type;
            if (k) teeth[k] = (teeth[k] || 0) + 1;
        }
    }
    const doc = DEMO_DOCTORS.find(d => d.id === p.doctorId) || DEMO_DOCTORS.find(d => d.id === mine[0]?.doctorId);
    return {
        id, name: fullName(p), firstName: p.firstName, lastName: p.lastName,
        age: calcAge(p.dob), gender: p.gender, status: p.status, since: '',
        lastVisit: past.find(a => a.status === 'Completed')?.date || '',
        doctor: doc ? { id: doc.id, name: `${doc.lastName} ${doc.firstName}` } : null,
        visits: mine.filter(a => a.status === 'Completed').length,
        noShows: mine.filter(a => a.status === 'No-Show').length,
        cancelled: mine.filter(a => a.status === 'Cancelled').length,
        next: next ? { date: next.date, time: next.time, doctorName: doctorName(next.doctorId), type: next.type } : null,
        recent: past.slice(0, 5).map(a => ({ date: a.date, type: a.type, status: a.status, doctorName: doctorName(a.doctorId) })),
        procedures: mine
            .filter(a => a.status === 'Completed' || a.status === 'Checked-In')
            .flatMap(a => procedures(a.notes, a.date))
            .slice(0, 12),
        teeth,
        debt: debtorFacts().list.find(d => d.id === id)?.debt || 0,
        advance: Math.max(0, Math.round(p.balance || 0)),
        recall: null,
        diagnoses: [],
    };
}

function freeSlots(date: string) {
    const { today } = dates();
    const d0 = new Date();
    const earliest = date === today ? Math.ceil((d0.getHours() * 60 + d0.getMinutes()) / 30) * 30 : 0;
    return DEMO_DOCTORS.map(d => {
        const start = (d.startHour ?? DEMO_CLINIC.startHour ?? 8) * 60;
        const end = (d.endHour ?? DEMO_CLINIC.endHour ?? 20) * 60;
        const busy = DEMO_APPOINTMENTS
            .filter(a => a.doctorId === d.id && a.date === date && a.status !== 'Cancelled')
            .map(a => ({ s: toMin(a.time), e: toMin(a.time) + (a.duration || 30) }));
        const free: string[] = [];
        for (let t = Math.max(start, earliest); t + 30 <= end; t += 30) {
            if (!busy.some(b => t < b.e && t + 30 > b.s)) free.push(hhmm(t));
        }
        return { id: d.id, name: `Dr. ${d.lastName}`, start: hhmm(start), end: hhmm(end), free };
    }).sort((a, b) => b.free.length - a.free.length);
}

function demoPulse(lang: Lang) {
    const ru = lang === 'ru';
    const role = currentRole();
    const fin = role === 'CLINIC_ADMIN';
    const desk = fin || role === 'RECEPTIONIST';
    const { today } = dates();
    const days7 = Array.from({ length: 7 }, (_, i) => shiftDay(i - 6));
    const tomorrow = shiftDay(1);
    const live = DEMO_APPOINTMENTS.filter(a => a.status !== 'Cancelled');
    const todays = live.filter(a => a.date === today);
    const n = (s: Appointment['status']) => todays.filter(a => a.status === s).length;
    const done = n('Completed');
    const here = n('Checked-In');
    const noShow = n('No-Show');
    const waiting = todays.length - done - here - noShow;
    const tiles: any[] = [];

    tiles.push({
        key: 'appts', label: ru ? 'Приёмы сегодня' : 'Bugungi qabullar', value: String(todays.length),
        sub: [done && `${done} ${ru ? 'завершено' : 'yakunlandi'}`, here && `${here} ${ru ? 'в клинике' : 'klinikada'}`,
            waiting > 0 && `${waiting} ${ru ? 'ожидается' : 'kutilmoqda'}`, noShow && `${noShow} ${ru ? 'не пришли' : 'kelmadi'}`]
            .filter(Boolean).join(' · '),
        tone: noShow ? 'warn' : 'neutral',
        spark: days7.map(d => live.filter(a => a.date === d).length),
        action: { type: 'ask', text: ru ? 'Как идут приёмы сегодня? Кто пришёл, кого ждём, кто не пришёл?' : 'Bugungi qabullar holati qanday? Kim keldi, kim kutilmoqda, kim kelmadi?' },
    });

    if (fin) {
        const byDate = new Map<string, number>();
        for (const t of DEMO_TRANSACTIONS) if (t.status === 'Paid') byDate.set(t.date, (byDate.get(t.date) || 0) + t.amount);
        const todayRev = byDate.get(today) || 0;
        const past = [...byDate.entries()].filter(([d, v]) => d < today && v > 0).map(([, v]) => v).slice(-30);
        const avg = past.length ? past.reduce((s, v) => s + v, 0) / past.length : 0;
        tiles.push({
            key: 'revenue', label: ru ? 'Выручка сегодня' : 'Bugungi tushum', value: fmt(todayRev), unit: ru ? 'сум' : "so'm",
            sub: avg ? `${ru ? 'обычно' : 'odatda'} ${fmt(avg)}` : undefined,
            tone: todayRev > 0 ? 'good' : 'neutral',
            delta: avg && todayRev ? Math.round(((todayRev - avg) / avg) * 100) : undefined,
            spark: days7.map(d => byDate.get(d) || 0),
            action: { type: 'ask', text: ru ? 'Какая выручка сегодня?' : 'Bugungi tushum qancha?' },
        });
    }
    if (desk) {
        const d = debtorFacts();
        tiles.push({
            key: 'debt', label: ru ? 'Должники' : 'Qarzdorlar', value: fmt(d.total), unit: ru ? 'сум' : "so'm",
            sub: `${d.list.length} ${ru ? 'пациентов' : 'nafar bemor'}`, tone: d.total > 0 ? 'warn' : 'good',
            action: { type: 'report', report: 'debtors' },
        });
        const l = leadFacts();
        if (l.total) {
            tiles.push({
                key: 'leads', label: ru ? 'Лиды без ответа' : 'Javobsiz lidlar', value: String(l.fresh),
                sub: `${l.total} ${ru ? 'за 30 дней' : '30 kunda'}`, tone: l.fresh ? 'warn' : 'good',
                action: { type: 'report', report: 'leads' },
            });
        }
    }
    const tom = live.filter(a => a.date === tomorrow);
    const unconfirmed = tom.filter(a => a.status === 'Pending').length;
    tiles.push({
        key: 'tomorrow', label: ru ? 'Приёмы завтра' : 'Ertangi qabullar', value: String(tom.length),
        sub: unconfirmed ? `${unconfirmed} ${ru ? 'не подтверждены' : 'tasdiqlanmagan'}` : undefined,
        tone: unconfirmed ? 'warn' : 'neutral',
        action: { type: 'ask', text: ru ? 'Покажи приёмы на завтра — кто не подтвердил?' : "Ertangi qabullar ro'yxatini ko'rsat — kim tasdiqlanmagan?" },
    });
    const low = lowStock();
    if (DEMO_INVENTORY.length) {
        tiles.push({
            key: 'stock', label: ru ? 'Заканчивается' : 'Tugayotgan material', value: String(low.length),
            sub: low.length ? low.slice(0, 2).map(i => i.name).join(', ') : (ru ? 'всё в норме' : 'hammasi yetarli'),
            tone: low.length ? 'warn' : 'good',
            action: { type: 'ask', text: ru ? 'Что заканчивается?' : 'Nima tugayapti?' },
        });
    }

    const now = nowHHMM();
    const next = todays
        .filter(a => (a.status === 'Pending' || a.status === 'Confirmed') && a.time >= now)
        .sort((a, b) => a.time.localeCompare(b.time))[0];
    return {
        date: today,
        tiles: tiles.slice(0, 6),
        next: next ? { time: next.time, patientId: next.patientId, patientName: next.patientName, doctorName: doctorName(next.doctorId), type: next.type } : null,
        inClinic: here,
        alerts: [] as { text: string; tone: string }[],
    };
}

/** Ish talab qiladiganlari oldinda — backend/ai/evidence.ts dagi APPT_PRIORITY bilan bir xil. */
const APPT_RANK: Record<string, number> = { 'Checked-In': 0, Pending: 1, Confirmed: 1, 'No-Show': 2, Completed: 3, Cancelled: 4 };

const dmy = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d);

function apptCard(list: Appointment[], lang: Lang, total = list.length) {
    return {
        kind: 'appointments', title: lang === 'ru' ? 'Приёмы' : 'Qabullar', total,
        items: [...list]
            .sort((a, b) => (APPT_RANK[a.status] ?? 3) - (APPT_RANK[b.status] ?? 3)
                || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
            .slice(0, 12).map(a => ({
            id: a.id, patientId: a.patientId, patientName: a.patientName, doctorName: doctorName(a.doctorId),
            date: a.date, time: a.time, status: a.status, type: a.type,
        })),
    };
}

// ── Savol-javob ──────────────────────────────────────────────────────────────

interface DemoAnswer {
    reply: string;
    sources: string[];
    cards?: any[];
    action?: any;
}

const demoAction = (name: string, preview: any) => ({ id: `demo-${name}-${Date.now()}`, name, preview });

function answer(question: string, lang: Lang, ctx?: Ctx): DemoAnswer {
    const q = question.toLowerCase();
    const ru = lang === 'ru';
    const has = (...words: string[]) => words.some(w => q.includes(w));
    const { today } = dates();

    // ── Bo'sh vaqt — qabulga yozishdan oldingi savol
    if (has("bo'sh", 'bosh vaqt', 'свобод', 'окошк', 'окно')) {
        const date = has('bugun', 'сегодня') ? today : shiftDay(1);
        const slots = freeSlots(date);
        const withFree = slots.filter(s => s.free.length);
        const top = withFree.slice(0, 3).map(s => `${s.name} — ${s.free.slice(0, 3).join(', ')}`).join('; ');
        return {
            reply: withFree.length
                ? (ru ? `${date === today ? 'Сегодня' : 'Завтра'} свободное время есть у ${withFree.length} врачей: ${top}. Нажмите на время — я подготовлю запись.`
                    : `${date === today ? 'Bugun' : 'Ertaga'} ${withFree.length} ta shifokorda bo'sh vaqt bor: ${top}. Vaqtni bossangiz — qabulni tayyorlab beraman.`)
                : (ru ? 'Свободного времени нет — все врачи заняты.' : "Bo'sh vaqt yo'q — hamma shifokor band."),
            sources: ['find_free_slots'],
            cards: [{ kind: 'slots', title: ru ? 'Свободное время' : "Bo'sh vaqtlar", date, duration: 30, doctors: slots.slice(0, 6).map(s => ({ ...s, free: s.free.slice(0, 16) })) }],
        };
    }

    const patient = ctx?.kind === 'patient' && ctx.patientId ? patientCard(ctx.patientId) : null;

    // ── Qabulga yozish (bo'sh vaqt bosilganda shunday gap keladi)
    if (has('yoz', 'запиш')) {
        const time = q.match(/(\d{1,2}:\d{2})/)?.[1];
        const date = q.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || shiftDay(1);
        const who = patient?.name || (question.split(/bemor:|пациента:/i)[1] || '').trim();
        if (time && who) {
            return {
                reply: ru ? `Запись ${who} на ${date} ${time} — ждёт вашего подтверждения.` : `${who}ni ${date} ${time} ga yozish — tasdiqlashingizni kutmoqda.`,
                sources: ['book_appointment'],
                action: demoAction('book_appointment', {
                    title: ru ? 'Запись на приём' : 'Qabulga yozish',
                    summary: `${who} · ${date} ${time}`,
                    items: [
                        { label: ru ? 'Пациент' : 'Bemor', detail: who },
                        { label: ru ? 'Дата' : 'Sana', detail: date },
                        { label: ru ? 'Время' : 'Vaqt', detail: time },
                    ],
                    confirmLabel: ru ? 'Записать' : 'Yozish',
                }),
            };
        }
    }

    // ── Ochiq bemor kartasi: savol shu bemor haqida
    if (patient) {
        const card = { kind: 'patient', card: patient };
        if (has('eslat', 'xabar', 'напом', 'сообщ')) {
            const text = patient.next
                ? (ru ? `Здравствуйте! Напоминаем о приёме ${patient.next.date} в ${patient.next.time}. Ждём вас!` : `Assalomu alaykum! ${patient.next.date} kuni soat ${patient.next.time} dagi qabulingizni eslatamiz. Kutamiz!`)
                : (ru ? 'Здравствуйте! Приглашаем вас на профилактический осмотр.' : "Assalomu alaykum! Sizni profilaktik ko'rikka taklif qilamiz.");
            return {
                reply: ru ? `Сообщение для ${patient.name} — ждёт вашего подтверждения.` : `${patient.name}ga xabar — tasdiqlashingizni kutmoqda.`,
                sources: ['send_message'],
                action: demoAction('send_message', {
                    title: ru ? 'Сообщение пациенту' : 'Bemorga xabar',
                    summary: ru ? `${patient.name} · Telegram или SMS` : `${patient.name} · Telegram yoki SMS`,
                    items: [], message: text, confirmLabel: ru ? 'Отправить' : 'Yuborish',
                }),
            };
        }
        const debt = patient.debt ? som(patient.debt, lang) : (ru ? 'долга нет' : "qarzi yo'q");
        const next = patient.next ? `${patient.next.date} ${patient.next.time} (${patient.next.doctorName})` : (ru ? 'не назначен' : 'belgilanmagan');
        const works = patient.procedures.slice(0, 3).map(p => `${p.name}${p.tooth ? ` #${p.tooth}` : ''}`).join(', ');
        return {
            reply: ru
                ? `${patient.name}: ${patient.visits} визитов${patient.noShows ? `, неявок — ${patient.noShows}` : ''}. ${works ? `Последние работы: ${works}. ` : ''}Долг: ${debt}. Следующий приём: ${next}.`
                : `${patient.name}: ${patient.visits} ta tashrif${patient.noShows ? `, ${patient.noShows} marta kelmagan` : ''}. ${works ? `Oxirgi ishlar: ${works}. ` : ''}Qarz: ${debt}. Keyingi qabul: ${next}.`,
            sources: ['get_patient_card'],
            cards: [card],
        };
    }

    // ── Guruhga eslatma
    if (has('eslat', 'xabar', 'напом', 'сообщ')) {
        const tomorrowList = DEMO_APPOINTMENTS.filter(a => a.date === shiftDay(1) && (a.status === 'Pending' || a.status === 'Confirmed'));
        const debtors = debtorFacts().list;
        const toDebtors = has('qarz', 'долг', 'должн');
        const people = toDebtors ? debtors.map(d => ({ label: d.name, detail: som(d.debt, lang) }))
            : tomorrowList.map(a => ({ label: a.patientName, detail: a.time }));
        const title = toDebtors ? (ru ? 'Напоминание должникам' : 'Qarzdorlarga eslatma') : (ru ? 'Напоминание о завтрашнем приёме' : 'Ertangi qabul eslatmasi');
        return {
            reply: ru ? `${title}: ${people.length} получателей — ждёт вашего подтверждения.` : `${title}: ${people.length} ta bemor — tasdiqlashingizni kutmoqda.`,
            sources: [toDebtors ? 'send_reminder' : 'send_reminder'],
            action: demoAction('send_reminder', {
                title,
                summary: ru ? `${people.length} пациентам через Telegram или SMS` : `${people.length} ta bemorga Telegram yoki SMS orqali`,
                items: people.slice(0, 20),
                message: toDebtors
                    ? (ru ? 'Уважаемый пациент! У вас есть неоплаченная сумма в нашей клинике. Пожалуйста, зайдите в удобное время.' : "Hurmatli bemor! Klinikamizda to'lanmagan qarzingiz mavjud. Iltimos, qulay vaqtda murojaat qiling.")
                    : (ru ? 'Напоминание: завтра у вас приём в нашей клинике. Ждём вас!' : 'Eslatma: ertaga klinikamizda qabulingiz bor. Kutamiz!'),
                confirmLabel: ru ? 'Отправить' : 'Yuborish',
            }),
        };
    }

    if (has('qarz', 'долг', 'должник')) {
        const d = debtorFacts();
        const top = d.list.slice(0, 3).map(x => `${x.name} — ${som(x.debt, lang)}`).join('; ');
        return {
            reply: ru
                ? `Сейчас ${d.list.length} пациентов должны клинике всего ${som(d.total, lang)}. Больше всего: ${top || '—'}.`
                : `Hozir ${d.list.length} nafar bemor klinikaga jami ${som(d.total, lang)} qarz. Eng kattalari: ${top || '—'}.`,
            sources: ['get_debtors'],
            cards: d.list.length ? [{
                kind: 'patients', title: ru ? 'Должники' : 'Qarzdorlar', total: d.list.length, sum: d.total,
                items: d.list.slice(0, 8).map(x => ({ id: x.id, name: x.name, detail: /^\d{4}-/.test(x.last) ? `${ru ? 'последний визит' : 'oxirgi tashrif'}: ${dmy(x.last)}` : undefined, amount: x.debt })),
            }] : [],
        };
    }
    if (has('tushum', 'daromad', 'pul', 'kassa', 'moliya', 'xarajat', 'выручк', 'доход', 'касс', 'деньг', 'финанс', 'расход')) {
        const f = financeFacts();
        const day = paidIn(today, today);
        const dayTotal = day.reduce((s, t) => s + t.amount, 0);
        const methods = [...f.byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${METHOD[k]?.[lang] || k} ${som(v, lang)}`).join(', ');
        return {
            reply: ru
                ? `Сегодня в кассу поступило ${som(dayTotal, lang)} (${day.length} платежей). С начала месяца — ${som(f.revenue, lang)}: ${methods}. Расходы за месяц — ${som(f.expenses, lang)}.`
                : `Bugun kassaga ${som(dayTotal, lang)} tushdi (${day.length} ta to'lov). Oy boshidan — ${som(f.revenue, lang)}: ${methods}. Oylik xarajat — ${som(f.expenses, lang)}.`,
            sources: ['get_revenue'],
            cards: [{
                kind: 'metrics', title: ru ? 'Финансы' : 'Moliya',
                items: [
                    { label: ru ? 'Поступило' : 'Kassaga kirgan', value: fmt(f.revenue), unit: ru ? 'сум' : "so'm", tone: f.revenue > 0 ? 'good' : 'neutral' },
                    { label: ru ? 'Расходы' : 'Xarajat', value: fmt(f.expenses), unit: ru ? 'сум' : "so'm", tone: f.expenses > 0 ? 'bad' : 'neutral' },
                    { label: ru ? 'Чистыми' : 'Sof', value: fmt(f.net), unit: ru ? 'сум' : "so'm", tone: f.net >= 0 ? 'good' : 'bad' },
                    { label: ru ? 'Платежей' : "To'lovlar", value: f.count, unit: ru ? 'шт' : 'ta' },
                ],
            }],
        };
    }
    if (has('shifokor', 'doktor', 'vrach', 'samarador', 'врач', 'доктор', 'эффектив')) {
        const docs = doctorStats().sort((a, b) => b.revenue - a.revenue);
        const lines = docs.map(d => ru
            ? `${d.name}: ${d.done} приёмов, ${som(d.revenue, lang)}`
            : `${d.name}: ${d.done} ta qabul, ${som(d.revenue, lang)}`).join('; ');
        return {
            reply: ru ? `С начала месяца по врачам: ${lines}.` : `Oy boshidan shifokorlar kesimida: ${lines}.`,
            sources: ['get_doctor_stats'],
            cards: [{
                kind: 'table', title: ru ? 'Врачи' : 'Shifokorlar',
                columns: ru ? ['Врач', 'Приёмы', 'Завершено', 'Неявки', 'Выручка'] : ['Shifokor', 'Qabul', 'Bajarilgan', 'Kelmagan', 'Tushum'],
                rows: docs.map(d => [d.name, d.visits, d.done, d.noShow, fmt(d.revenue)]),
            }],
        };
    }
    if (has('ombor', 'material', 'tugay', 'склад', 'материал', 'заканчива')) {
        const low = lowStock();
        return {
            reply: low.length
                ? (ru ? `Заканчиваются ${low.length} позиции: ${low.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}.` : `${low.length} ta material tugayapti: ${low.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}.`)
                : (ru ? 'Все материалы в норме.' : 'Hamma material yetarli.'),
            sources: ['get_low_stock'],
            cards: low.length ? [{
                kind: 'stock', title: ru ? 'Заканчиваются' : 'Tugayotgan materiallar', total: low.length,
                items: low.slice(0, 8).map(i => ({ name: i.name, qty: i.quantity, min: i.minQuantity, unit: i.unit })),
            }] : [],
        };
    }
    if (has('lid', 'ariza', 'лид', 'заявк', 'manba', 'источник')) {
        const l = leadFacts();
        return {
            reply: ru
                ? `За 30 дней пришло ${l.total} заявок, ${l.booked} стали пациентами. ${l.fresh} новых ждут звонка.`
                : `Oxirgi 30 kunda ${l.total} ta ariza keldi, ${l.booked} tasi bemorga aylandi. ${l.fresh} tasi hali qo'ng'iroq kutyapti.`,
            sources: ['get_leads'],
            cards: [{
                kind: 'metrics', title: ru ? 'Лиды' : 'Lidlar',
                items: [
                    { label: ru ? 'Всего лидов' : 'Jami lid', value: l.total, unit: ru ? 'шт' : 'ta' },
                    { label: ru ? 'Стали пациентами' : 'Bemorga aylandi', value: l.booked, unit: ru ? 'шт' : 'ta', tone: l.booked ? 'good' : 'neutral' },
                    { label: ru ? 'Ждут звонка' : "Qo'ng'iroq kutyapti", value: l.fresh, unit: ru ? 'шт' : 'ta', tone: l.fresh ? 'warn' : 'neutral' },
                ],
            }],
        };
    }
    if (has('ertang', 'ertaga', 'завтра')) {
        const list = DEMO_APPOINTMENTS.filter(a => a.date === shiftDay(1) && a.status !== 'Cancelled');
        const pending = list.filter(a => a.status === 'Pending').length;
        return {
            reply: ru
                ? `На завтра записано ${list.length} пациентов${pending ? `, из них ${pending} ещё не подтвердили` : ''}.`
                : `Ertaga ${list.length} nafar bemor yozilgan${pending ? `, shundan ${pending} tasi hali tasdiqlamagan` : ''}.`,
            sources: ['get_appointments'],
            cards: list.length ? [apptCard(list, lang)] : [],
        };
    }
    // "Bugungi qabullar ... kim kelmadi?" — bugungi holat savoli, haftalik
    // kelmaganlar ro'yxati emas.
    if (has('kelma', 'неявк', 'не приш') && !has('bugun', 'сегодня')) {
        const from = shiftDay(-7);
        const list = DEMO_APPOINTMENTS.filter(a => a.status === 'No-Show' && a.date >= from && a.date <= today);
        return {
            reply: ru
                ? (list.length ? `За неделю не пришли ${list.length} пациентов — им стоит позвонить и перезаписать.` : 'За неделю неявок не было.')
                : (list.length ? `Shu hafta ${list.length} nafar bemor kelmadi — ularga qo'ng'iroq qilib, qayta yozish kerak.` : "Shu hafta kelmagan bemor yo'q."),
            sources: ['get_appointments'],
            cards: list.length ? [apptCard(list, lang)] : [],
        };
    }
    if (has('bemor', 'пациент') && !has('bugun', 'сегодня')) {
        const { monthFrom } = dates();
        const firstVisit = new Map<string, string>();
        for (const a of DEMO_APPOINTMENTS) {
            if (a.status !== 'Completed') continue;
            const prev = firstVisit.get(a.patientId);
            if (!prev || a.date < prev) firstVisit.set(a.patientId, a.date);
        }
        const fresh = [...firstVisit.values()].filter(d => d >= monthFrom).length;
        return {
            reply: ru
                ? `В базе ${DEMO_PATIENTS.length} пациентов. В этом месяце впервые пришли ${fresh}.`
                : `Bazada ${DEMO_PATIENTS.length} nafar bemor. Shu oy ${fresh} nafari birinchi marta keldi.`,
            sources: ['find_patient'],
        };
    }
    if (has('bugun', 'qabul', 'navbat', 'kabinet', 'klinikada', 'e\'tibor', 'сегодня', 'приём', 'прием', 'очеред', 'внимани')) {
        const f = todayFacts();
        const focus = has("e'tibor", 'внимани');
        const d = debtorFacts();
        return {
            reply: ru
                ? `Сегодня ${f.total} приёмов: ${f.completed} завершено, ${f.arrived} пациентов в клинике, ${f.confirmed + f.pending} ещё придут${f.noShow ? `, ${f.noShow} не пришли` : ''}.${focus && d.list.length ? ` Отдельно: ${d.list.length} должников на ${som(d.total, lang)} — стоит напомнить.` : ''}`
                : `Bugun ${f.total} ta qabul: ${f.completed} tasi yakunlandi, ${f.arrived} nafar bemor klinikada, yana ${f.confirmed + f.pending} nafari keladi${f.noShow ? `, ${f.noShow} nafari kelmadi` : ''}.${focus && d.list.length ? ` Alohida: ${d.list.length} nafar qarzdor, jami ${som(d.total, lang)} — eslatma yuborish kerak.` : ''}`,
            sources: focus ? ['get_appointments', 'get_debtors'] : ['get_appointments'],
            cards: [apptCard(f.list.filter(a => a.status !== 'Cancelled'), lang, f.total)],
        };
    }
    return {
        reply: ru
            ? 'В демо-режиме я отвечаю по данным демо-клиники: приёмы, свободное время, выручка, должники, врачи, склад и заявки. Откройте карту пациента — и спросите о нём, например «есть долг?».'
            : "Demo rejimida demo klinika ma'lumotlari bo'yicha javob beraman: qabullar, bo'sh vaqt, tushum, qarzdorlar, shifokorlar, ombor va arizalar. Bemor kartasini ochib, u haqida so'rang — masalan «qarzi bormi?».",
        sources: [],
    };
}

// ── Server javobiga o'xshash kirish nuqtalari ────────────────────────────────

/** Suhbatlar faqat shu sessiya davomida saqlanadi */
const conversations: { id: string; title: string; updatedAt: string; messages: { q: string; a: string; sources: string[] }[] }[] = [];

const lastQuestion = (body: any): string => {
    const msgs = Array.isArray(body?.messages) ? body.messages : [];
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]?.role === 'user') return String(msgs[i].content || '');
    return '';
};

/** components/ai/aiClient.ts dagi so'rov o'rnida: yo'l bo'yicha server javobi shaklida qaytaradi */
export async function demoAiRequest(path: string, body?: any, method?: string): Promise<any> {
    ensureDemoData();
    const [route, query = ''] = path.split('?');
    const lang: Lang = /lang=ru/.test(query) || body?.lang === 'ru' ? 'ru' : 'uz';
    await new Promise(r => setTimeout(r, 350));

    if (route === '/ai/pulse') {
        return { success: true, pulse: demoPulse(lang) };
    }
    if (route === '/ai/reports') {
        const role = currentRole();
        const reports = (Object.keys(TEXT) as ReportType[])
            .filter(t => REPORT_ROLES[t].includes(role))
            .map(t => ({ type: t, title: TEXT[t][lang].title, hint: TEXT[t][lang].hint }));
        return { success: true, reports };
    }
    if (route === '/ai/report') {
        const type = body?.type as ReportType;
        if (!TEXT[type]) throw new Error('Hisobot topilmadi');
        await new Promise(r => setTimeout(r, 600));
        return { success: true, report: buildReport(type, lang), logId: null };
    }
    if (route === '/ai/ask') {
        const a = answer(lastQuestion(body), lang, body?.context);
        return { success: true, reply: a.reply, sources: a.sources, action: a.action || null, logId: null, cards: a.cards || [] };
    }
    if (route === '/ai/conversations' && method !== 'DELETE' && body) {
        const now = new Date().toISOString();
        const messages = Array.isArray(body.messages) ? body.messages : [];
        let conv = conversations.find(c => c.id === body.id);
        if (!conv) {
            conv = { id: `demo-conv-${Date.now()}`, title: String(messages[0]?.q || '').slice(0, 60), updatedAt: now, messages: [] };
            conversations.unshift(conv);
        }
        conv.messages = messages;
        conv.updatedAt = now;
        return { success: true, id: conv.id };
    }
    if (route === '/ai/conversations') {
        return { success: true, items: conversations.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })) };
    }
    const conv = route.match(/^\/ai\/conversations\/(.+)$/);
    if (conv) {
        const idx = conversations.findIndex(c => c.id === conv[1]);
        if (method === 'DELETE') {
            if (idx !== -1) conversations.splice(idx, 1);
            return { success: true };
        }
        if (idx === -1) throw new Error('Suhbat topilmadi');
        return { success: true, conversation: conversations[idx] };
    }
    if (route === '/ai/act') {
        return {
            success: true,
            message: uiLang() === 'ru'
                ? 'Демо-режим: изменения не сохраняются. В вашей клинике эта кнопка выполнит действие.'
                : "Demo rejimi: o'zgarish saqlanmaydi. Sizning klinikangizda shu tugma ishni bajaradi.",
        };
    }
    // Baho va boshqalar — demo'da saqlanmaydi
    return { success: true };
}

/**
 * Oqim o'rnida: avval "ma'lumot o'qilmoqda" bosqichlari, keyin javob so'zma-so'z chiqadi —
 * haqiqiy DentaAI qanday ishlashini ko'rsatadi. Bekor qilinsa (AbortSignal) — to'xtaydi.
 */
export async function demoAiStream(body: any, onEvent: (e: any) => void, signal?: AbortSignal): Promise<boolean> {
    ensureDemoData();
    const lang: Lang = body?.lang === 'ru' ? 'ru' : 'uz';
    const a = answer(lastQuestion(body), lang, body?.context);
    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const id = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    // Harakatlar ma'lumot o'qimaydi — ular faqat tasdiqlash kartasini tayyorlaydi.
    for (const name of a.sources.filter(s => !a.action || s !== a.action.name)) {
        onEvent({ type: 'tool_start', name });
        await sleep(450);
        onEvent({ type: 'tool_done', name, ok: true });
    }
    const words = a.reply.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 2) {
        onEvent({ type: 'token', text: words.slice(i, i + 2).join('') });
        await sleep(28);
    }
    onEvent({ type: 'done', reply: a.reply, sources: a.sources, action: a.action || null, logId: null, cards: a.cards || [] });
    return true;
}
