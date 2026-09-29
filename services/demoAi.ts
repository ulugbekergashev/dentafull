import { Appointment } from '../types';
import { formatDateToISO } from '../utils/dateUtils';
import { buildUnpaidRows } from '../utils/unpaid';
import { DEMO_APPOINTMENTS, DEMO_DOCTORS, DEMO_EXPENSES, DEMO_INVENTORY, DEMO_LEADS, DEMO_PATIENTS, DEMO_SERVICES, DEMO_TRANSACTIONS, ensureDemoData } from './demoData';

/**
 * DentaAI demo rejimda. Haqiqiy DentaAI serverdagi model orqali klinika ma'lumotini o'qiydi;
 * demo esa serverga bormaydi — hisobot va javoblar shu yerda demo klinika ma'lumotidan
 * hisoblanadi va oqim ko'rinishida (so'zma-so'z) chiqariladi. Javob turlari server
 * javoblari bilan bir xil shaklda (pages/DentaAiMode.tsx ularni o'zgartirmasdan chizadi).
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
    const byPatient = new Map<string, { name: string; phone: string; debt: number; last: string }>();
    for (const r of rows) {
        if (r.amount <= 0) continue;
        const key = r.patientId || r.patientName;
        const p = DEMO_PATIENTS.find(x => x.id === r.patientId);
        const cur = byPatient.get(key) || { name: r.patientName, phone: p?.phone || '—', debt: 0, last: p?.lastVisit || '—' };
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

// ── Savol-javob ──────────────────────────────────────────────────────────────

function answer(question: string, lang: Lang): { reply: string; sources: string[] } {
    const q = question.toLowerCase();
    const ru = lang === 'ru';
    const has = (...words: string[]) => words.some(w => q.includes(w));

    if (has('qarz', 'долг', 'должник')) {
        const d = debtorFacts();
        const top = d.list.slice(0, 3).map(x => `${x.name} — ${som(x.debt, lang)}`).join('; ');
        return {
            reply: ru
                ? `Сейчас ${d.list.length} пациентов должны клинике всего ${som(d.total, lang)}. Больше всего: ${top || '—'}.`
                : `Hozir ${d.list.length} nafar bemor klinikaga jami ${som(d.total, lang)} qarz. Eng kattalari: ${top || '—'}.`,
            sources: ['get_debtors'],
        };
    }
    if (has('tushum', 'daromad', 'pul', 'kassa', 'moliya', 'выручк', 'доход', 'касс', 'деньг', 'финанс')) {
        const { today } = dates();
        const f = financeFacts();
        const day = paidIn(today, today);
        const dayTotal = day.reduce((s, t) => s + t.amount, 0);
        const methods = [...f.byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${METHOD[k]?.[lang] || k} ${som(v, lang)}`).join(', ');
        return {
            reply: ru
                ? `Сегодня в кассу поступило ${som(dayTotal, lang)} (${day.length} платежей). С начала месяца — ${som(f.revenue, lang)}: ${methods}. Расходы за месяц — ${som(f.expenses, lang)}.`
                : `Bugun kassaga ${som(dayTotal, lang)} tushdi (${day.length} ta to'lov). Oy boshidan — ${som(f.revenue, lang)}: ${methods}. Oylik xarajat — ${som(f.expenses, lang)}.`,
            sources: ['get_revenue'],
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
        };
    }
    if (has('ombor', 'material', 'склад', 'материал')) {
        const low = lowStock();
        return {
            reply: low.length
                ? (ru ? `Заканчиваются ${low.length} позиции: ${low.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}.` : `${low.length} ta material tugayapti: ${low.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}.`)
                : (ru ? 'Все материалы в норме.' : 'Hamma material yetarli.'),
            sources: ['get_low_stock'],
        };
    }
    if (has('lid', 'ariza', 'лид', 'заявк')) {
        const l = leadFacts();
        return {
            reply: ru
                ? `За 30 дней пришло ${l.total} заявок, ${l.booked} стали пациентами. ${l.fresh} новых ждут звонка.`
                : `Oxirgi 30 kunda ${l.total} ta ariza keldi, ${l.booked} tasi bemorga aylandi. ${l.fresh} tasi hali qo'ng'iroq kutyapti.`,
            sources: ['get_leads'],
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
    if (has('bugun', 'qabul', 'navbat', 'kabinet', 'сегодня', 'приём', 'прием', 'очеред')) {
        const f = todayFacts();
        return {
            reply: ru
                ? `Сегодня ${f.total} приёмов: ${f.completed} завершено, ${f.arrived} пациентов в клинике (в кабинете или в очереди), ${f.confirmed + f.pending} ещё придут${f.noShow ? `, ${f.noShow} не пришли` : ''}. ${f.busiest ? `Больше всего приёмов у ${doctorName(f.busiest[0])} — ${f.busiest[1]}.` : ''}`
                : `Bugun ${f.total} ta qabul: ${f.completed} tasi yakunlandi, ${f.arrived} nafar bemor klinikada (kabinetda yoki navbatda), yana ${f.confirmed + f.pending} nafari keladi${f.noShow ? `, ${f.noShow} nafari kelmadi` : ''}. ${f.busiest ? `Eng band shifokor — ${doctorName(f.busiest[0])}, ${f.busiest[1]} ta qabul.` : ''}`,
            sources: ['get_appointments'],
        };
    }
    return {
        reply: ru
            ? 'В демо-режиме я отвечаю по данным демо-клиники: приёмы на сегодня, выручка, должники, врачи, склад и заявки. Например: «Сколько сегодня приёмов?» или «Кто должен клинике?»'
            : "Demo rejimida demo klinika ma'lumotlari bo'yicha javob beraman: bugungi qabullar, tushum, qarzdorlar, shifokorlar, ombor va arizalar. Masalan: «Bugun nechta qabul bor?» yoki «Kim qarzdor?»",
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

/** DentaAiMode'dagi `api()` o'rnida: yo'l bo'yicha server javobi shaklida qaytaradi */
export async function demoAiRequest(path: string, body?: any, method?: string): Promise<any> {
    ensureDemoData();
    const [route, query = ''] = path.split('?');
    const lang: Lang = /lang=ru/.test(query) || body?.lang === 'ru' ? 'ru' : 'uz';
    await new Promise(r => setTimeout(r, 350));

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
        const { reply, sources } = answer(lastQuestion(body), lang);
        return { success: true, reply, sources, action: null, logId: null };
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
        return { success: true, message: "Demo rejimida o'zgarish kiritilmaydi." };
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
    const { reply, sources } = answer(lastQuestion(body), lang);
    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const id = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    for (const name of sources) {
        onEvent({ type: 'tool_start', name });
        await sleep(450);
        onEvent({ type: 'tool_done', name, ok: true });
    }
    const words = reply.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 2) {
        onEvent({ type: 'token', text: words.slice(i, i + 2).join('') });
        await sleep(28);
    }
    onEvent({ type: 'done', reply, sources, action: null, logId: null });
    return true;
}
