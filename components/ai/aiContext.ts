import { Patient, UserRole } from '../../types';
import type { ReportOption } from './aiClient';

// ─── DentaAI: "nimani ko'rib turibdi" ─────────────────────────────────────────
//
// Panel sahifa YONIDA ochiladi. Shuning uchun u foydalanuvchi qayerda
// turganini biladi va savolni shunga moslaydi: bemor kartasida "qarzi
// bormi?" deyish yetarli, ismni aytish shart emas. Takliflar ham sahifaga
// qarab o'zgaradi — kalendarda bo'sh vaqt, moliyada tushum.

export type Lang = 'uz' | 'ru';
type L = Record<Lang, string>;

export type AiPage =
    | 'dashboard' | 'calendar' | 'finance' | 'patients' | 'leads' | 'inventory'
    | 'queue' | 'lab' | 'messages' | 'doctors' | 'settings';

export type AiContext =
    | { kind: 'patient'; patientId: string; name: string }
    | { kind: 'page'; page: AiPage };

const PAGE_BY_PATH: Record<string, AiPage> = {
    '/': 'dashboard',
    '/calendar': 'calendar',
    '/finance': 'finance',
    '/patients': 'patients',
    '/leads': 'leads',
    '/inventory': 'inventory',
    '/queue': 'queue',
    '/lab': 'lab',
    '/messages': 'messages',
    '/doctors': 'doctors',
    '/settings': 'settings',
};

const PAGE_LABEL: Record<AiPage, L> = {
    dashboard: { uz: 'Bosh sahifa', ru: 'Главная' },
    calendar: { uz: 'Kalendar', ru: 'Календарь' },
    finance: { uz: 'Moliya', ru: 'Финансы' },
    patients: { uz: 'Bemorlar', ru: 'Пациенты' },
    leads: { uz: 'Lidlar', ru: 'Лиды' },
    inventory: { uz: 'Ombor', ru: 'Склад' },
    queue: { uz: 'Navbat', ru: 'Очередь' },
    lab: { uz: 'Laboratoriya', ru: 'Лаборатория' },
    messages: { uz: 'Xabarlar', ru: 'Сообщения' },
    doctors: { uz: 'Xodimlar', ru: 'Сотрудники' },
    settings: { uz: 'Sozlamalar', ru: 'Настройки' },
};

/** Manzil satridan kontekst. Bemor ismi yuklangan ro'yxatdan olinadi. */
export function deriveContext(pathname: string, patients: Patient[]): AiContext | null {
    const m = pathname.match(/^\/patients\/([^/?#]+)/);
    if (m) {
        const id = decodeURIComponent(m[1]);
        const p = patients.find(x => x.id === id);
        return { kind: 'patient', patientId: id, name: p ? `${p.lastName || ''} ${p.firstName || ''}`.trim() : '' };
    }
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/doctors')) return { kind: 'page', page: 'doctors' };
    const page = PAGE_BY_PATH[path];
    return page ? { kind: 'page', page } : null;
}

/** Serverga boradigan shakl (backend: resolvePageContext). */
export const contextPayload = (c: AiContext | null) =>
    !c ? undefined
        : c.kind === 'patient' ? { kind: 'patient', patientId: c.patientId }
            : { kind: 'page', page: c.page };

export const contextLabel = (c: AiContext, lang: Lang): string =>
    c.kind === 'patient'
        ? (c.name || (lang === 'ru' ? 'Пациент' : 'Bemor'))
        : PAGE_LABEL[c.page][lang];

// ─── Rollar (backend: ai/tools.ts dagi ro'yxatlar bilan bir xil) ─────────────

const canFinance = (r: UserRole) => r === UserRole.CLINIC_ADMIN || r === UserRole.SUPER_ADMIN;
const canDesk = (r: UserRole) => canFinance(r) || r === UserRole.RECEPTIONIST;

// ─── Takliflar ───────────────────────────────────────────────────────────────

export interface Suggestion {
    key: string;
    label: string;
    /** Bosilganda yuboriladigan savol. */
    ask?: string;
    /** Yoki — tayyor hisobot. */
    report?: string;
}

type Raw = { key: string; label: L; ask?: L; report?: string; when?: boolean };

const pick = (list: Raw[], lang: Lang): Suggestion[] =>
    list
        .filter(x => x.when !== false)
        .map(x => ({ key: x.key, label: x.label[lang], ask: x.ask?.[lang], report: x.report }));

const Q = {
    summary: {
        uz: 'Shu bemor haqida qisqa xulosa ber: tashriflar, bajarilgan ishlar, qarz va keyingi qabul.',
        ru: 'Дай короткую сводку по этому пациенту: визиты, лечение, долг и следующий приём.',
    },
    treated: {
        uz: 'Shu bemorga qaysi tishlarga qanday ishlar qilingan?',
        ru: 'Какие работы делали этому пациенту и по каким зубам?',
    },
    patientDebt: { uz: 'Shu bemorning qarzi bormi?', ru: 'Есть ли у этого пациента долг?' },
    patientRemind: {
        uz: 'Shu bemorga keyingi qabuli haqida eslatma yubor.',
        ru: 'Отправь этому пациенту напоминание о следующем приёме.',
    },
    slotsTomorrow: {
        uz: 'Ertaga qaysi shifokorlarda bo\'sh vaqt bor?',
        ru: 'У каких врачей есть свободное время завтра?',
    },
    slotsToday: {
        uz: 'Bugun qaysi shifokorlarda bo\'sh vaqt qoldi?',
        ru: 'У каких врачей сегодня ещё есть свободное время?',
    },
    tomorrow: {
        uz: 'Ertangi qabullar ro\'yxatini ko\'rsat — kim tasdiqlanmagan?',
        ru: 'Покажи приёмы на завтра — кто не подтвердил?',
    },
    remindTomorrow: {
        uz: 'Ertangi qabulga yozilganlarga eslatma yubor.',
        ru: 'Отправь напоминание всем, кто записан на завтра.',
    },
    noShows: {
        uz: 'Shu hafta qaysi bemorlar qabulga kelmadi?',
        ru: 'Кто из пациентов не пришёл на приём на этой неделе?',
    },
    focus: {
        uz: 'Bugun nimaga e\'tibor berishim kerak?',
        ru: 'На что мне сегодня обратить внимание?',
    },
    revenueToday: {
        uz: 'Bugungi tushum qancha va u odatdagidan qanchalik farq qiladi?',
        ru: 'Какая выручка сегодня и насколько она отличается от обычной?',
    },
    expenses: {
        uz: 'Shu oy xarajatlar nimalarga ketyapti?',
        ru: 'На что уходят расходы в этом месяце?',
    },
    whoToday: { uz: 'Bugun kimlar keladi?', ru: 'Кто сегодня придёт?' },
    leadSource: {
        uz: 'Qaysi manba ko\'proq lid va bemor keltiryapti?',
        ru: 'Какой источник приносит больше лидов и пациентов?',
    },
    stock: { uz: 'Nima tugayapti?', ru: 'Что заканчивается?' },
    bestDoctor: {
        uz: 'Shu oy qaysi shifokor eng ko\'p ishladi?',
        ru: 'Кто из врачей больше всех работал в этом месяце?',
    },
    inClinic: {
        uz: 'Hozir klinikada kimlar bor va kim kutyapti?',
        ru: 'Кто сейчас в клинике и кто ждёт?',
    },
    remindDebtors: { uz: 'Qarzdorlarga eslatma yubor.', ru: 'Отправь напоминание должникам.' },
    remindNoShow: {
        uz: 'Kelmagan bemorlarga qayta yozilish haqida xabar yubor.',
        ru: 'Отправь неявившимся пациентам сообщение о перезаписи.',
    },
    lastMonth: {
        uz: 'O\'tgan oyning shu davri bilan solishtirganda qanday?',
        ru: 'Как это выглядит по сравнению с тем же периодом прошлого месяца?',
    },
} satisfies Record<string, L>;

export function suggestionsFor(ctx: AiContext | null, role: UserRole, lang: Lang): Suggestion[] {
    const fin = canFinance(role);
    const desk = canDesk(role);

    if (ctx?.kind === 'patient') {
        return pick([
            { key: 'summary', label: { uz: 'Bemor xulosasi', ru: 'Сводка по пациенту' }, ask: Q.summary },
            { key: 'treated', label: { uz: 'Nimalar qilingan?', ru: 'Что делали?' }, ask: Q.treated },
            { key: 'debt', label: { uz: 'Qarzi bormi?', ru: 'Есть долг?' }, ask: Q.patientDebt, when: desk },
            { key: 'slots', label: { uz: 'Ertaga bo\'sh vaqt', ru: 'Свободно завтра' }, ask: Q.slotsTomorrow },
            { key: 'remind', label: { uz: 'Eslatma yuborish', ru: 'Напомнить' }, ask: Q.patientRemind, when: desk },
        ], lang);
    }

    switch (ctx?.page) {
        case 'calendar':
        case 'queue':
            return pick([
                { key: 'here', label: { uz: 'Hozir klinikada', ru: 'Сейчас в клинике' }, ask: Q.inClinic, when: ctx.page === 'queue' },
                { key: 'slotsToday', label: { uz: 'Bugun bo\'sh vaqt', ru: 'Свободно сегодня' }, ask: Q.slotsToday },
                { key: 'slotsTomorrow', label: { uz: 'Ertaga bo\'sh vaqt', ru: 'Свободно завтра' }, ask: Q.slotsTomorrow },
                { key: 'tomorrow', label: { uz: 'Ertangi qabullar', ru: 'Приёмы завтра' }, ask: Q.tomorrow },
                { key: 'remind', label: { uz: 'Ertangilarga eslatma', ru: 'Напомнить на завтра' }, ask: Q.remindTomorrow, when: desk },
                { key: 'noshow', label: { uz: 'Kelmaganlar', ru: 'Неявки' }, ask: Q.noShows },
            ], lang).slice(0, 5);
        case 'finance':
            return pick([
                { key: 'revToday', label: { uz: 'Bugungi tushum', ru: 'Выручка сегодня' }, ask: Q.revenueToday, when: fin },
                { key: 'finance', label: { uz: 'Oy moliyasi', ru: 'Финансы за месяц' }, report: 'finance', when: fin },
                { key: 'debtors', label: { uz: 'Qarzdorlar', ru: 'Должники' }, report: 'debtors', when: desk },
                { key: 'expenses', label: { uz: 'Xarajatlar tarkibi', ru: 'Структура расходов' }, ask: Q.expenses, when: fin },
            ], lang);
        case 'leads':
            return pick([
                { key: 'leads', label: { uz: 'Lidlar hisoboti', ru: 'Отчёт по лидам' }, report: 'leads', when: desk },
                { key: 'source', label: { uz: 'Eng yaxshi manba', ru: 'Лучший источник' }, ask: Q.leadSource, when: desk },
            ], lang);
        case 'inventory':
            return pick([
                { key: 'stock', label: { uz: 'Nima tugayapti?', ru: 'Что заканчивается?' }, ask: Q.stock },
                { key: 'inventory', label: { uz: 'Ombor hisoboti', ru: 'Отчёт по складу' }, report: 'inventory' },
            ], lang);
        case 'doctors':
            return pick([
                { key: 'performance', label: { uz: 'Samaradorlik', ru: 'Эффективность' }, report: 'performance', when: fin },
                { key: 'best', label: { uz: 'Kim ko\'p ishladi?', ru: 'Кто работал больше?' }, ask: Q.bestDoctor, when: fin },
                { key: 'slots', label: { uz: 'Ertaga bo\'sh vaqt', ru: 'Свободно завтра' }, ask: Q.slotsTomorrow },
            ], lang);
        case 'patients':
            return pick([
                { key: 'today', label: { uz: 'Bugun kim keladi?', ru: 'Кто сегодня?' }, ask: Q.whoToday },
                { key: 'debtors', label: { uz: 'Qarzdorlar', ru: 'Должники' }, report: 'debtors', when: desk },
                { key: 'noshow', label: { uz: 'Kelmaganlar', ru: 'Неявки' }, ask: Q.noShows },
            ], lang);
        default:
            return pick([
                { key: 'focus', label: { uz: 'Bugun nimaga e\'tibor?', ru: 'На что обратить внимание?' }, ask: Q.focus },
                { key: 'today', label: { uz: 'Kun hisoboti', ru: 'Отчёт за день' }, report: 'today' },
                { key: 'slots', label: { uz: 'Bugun bo\'sh vaqt', ru: 'Свободно сегодня' }, ask: Q.slotsToday },
                { key: 'performance', label: { uz: 'Shifokorlar', ru: 'Врачи' }, report: 'performance', when: fin },
            ], lang);
    }
}

/**
 * Javobdan keyingi qadam — qaysi ma'lumot o'qilganiga qarab.
 *
 * Model chaqirilmaydi: takliflar oldindan yozilgan, ya'ni bitta token ham
 * sarflanmaydi va har doim bajariladigan narsani taklif qiladi.
 */
export function followUpsFor(sources: string[], role: UserRole, lang: Lang, asked: string): Suggestion[] {
    const has = (s: string) => sources.includes(s);
    const fin = canFinance(role);
    const desk = canDesk(role);
    const out: Raw[] = [];

    if (has('get_debtors')) out.push({ key: 'remindDebtors', label: { uz: 'Qarzdorlarga eslatma', ru: 'Напомнить должникам' }, ask: Q.remindDebtors, when: desk });
    if (has('get_appointments')) {
        out.push({ key: 'tomorrow', label: { uz: 'Ertangi qabullar', ru: 'Приёмы завтра' }, ask: Q.tomorrow });
        out.push({ key: 'remindNoShow', label: { uz: 'Kelmaganlarga xabar', ru: 'Написать неявившимся' }, ask: Q.remindNoShow, when: desk });
    }
    if (has('get_revenue')) {
        out.push({ key: 'lastMonth', label: { uz: 'O\'tgan oy bilan', ru: 'С прошлым месяцем' }, ask: Q.lastMonth, when: fin });
        out.push({ key: 'expenses', label: { uz: 'Xarajatlar tarkibi', ru: 'Структура расходов' }, ask: Q.expenses, when: fin });
    }
    if (has('get_patient_card')) {
        out.push({ key: 'slots', label: { uz: 'Ertaga bo\'sh vaqt', ru: 'Свободно завтра' }, ask: Q.slotsTomorrow });
        out.push({ key: 'remind', label: { uz: 'Eslatma yuborish', ru: 'Напомнить' }, ask: Q.patientRemind, when: desk });
    }
    if (has('find_free_slots')) out.push({ key: 'tomorrow', label: { uz: 'Ertangi qabullar', ru: 'Приёмы завтра' }, ask: Q.tomorrow });
    if (has('get_low_stock')) out.push({ key: 'inventory', label: { uz: 'Ombor hisoboti', ru: 'Отчёт по складу' }, report: 'inventory' });

    const seen = new Set<string>();
    return pick(out, lang)
        .filter(s => (s.ask ? s.ask !== asked : true) && !seen.has(s.key) && (seen.add(s.key), true))
        .slice(0, 2);
}

// ─── "/" buyruqlari ──────────────────────────────────────────────────────────

export interface SlashCommand {
    cmd: string;
    label: string;
    hint: string;
    run: { report: string } | { ask: string } | { reset: true };
}

const REPORT_CMD: Record<string, L> = {
    today: { uz: 'bugun', ru: 'сегодня' },
    finance: { uz: 'moliya', ru: 'финансы' },
    debtors: { uz: 'qarz', ru: 'долги' },
    performance: { uz: 'shifokorlar', ru: 'врачи' },
    inventory: { uz: 'ombor', ru: 'склад' },
    leads: { uz: 'lidlar', ru: 'лиды' },
};

export function slashCommands(ctx: AiContext | null, lang: Lang, reports: ReportOption[]): SlashCommand[] {
    const ru = lang === 'ru';
    const list: SlashCommand[] = reports
        .filter(r => REPORT_CMD[r.type])
        .map(r => ({ cmd: REPORT_CMD[r.type][lang], label: r.title, hint: r.hint, run: { report: r.type } }));

    if (ctx?.kind === 'patient') {
        list.unshift({
            cmd: ru ? 'сводка' : 'xulosa',
            label: ru ? 'Сводка по пациенту' : 'Bemor xulosasi',
            hint: ctx.name || (ru ? 'Открытая карта' : 'Ochiq karta'),
            run: { ask: Q.summary[lang] },
        });
    }
    list.push(
        {
            cmd: ru ? 'свободно' : 'bosh',
            label: ru ? 'Свободное время' : 'Bo\'sh vaqtlar',
            hint: ru ? 'Врачи, у кого есть окна завтра' : 'Ertaga kimda bo\'sh vaqt bor',
            run: { ask: Q.slotsTomorrow[lang] },
        },
        {
            cmd: ru ? 'завтра' : 'ertaga',
            label: ru ? 'Приёмы завтра' : 'Ertangi qabullar',
            hint: ru ? 'Кто записан и кто не подтвердил' : 'Kim yozilgan, kim tasdiqlamagan',
            run: { ask: Q.tomorrow[lang] },
        },
        {
            cmd: ru ? 'новый' : 'yangi',
            label: ru ? 'Новый диалог' : 'Yangi suhbat',
            hint: ru ? 'Очистить ленту' : 'Lentani tozalash',
            run: { reset: true },
        },
    );
    return list;
}

// ─── Yorliqlar ───────────────────────────────────────────────────────────────

/** "get_revenue" hech kimga hech narsa demaydi — "Moliya" javob qayerdan kelganini aytadi. */
export const SOURCE_LABEL: Record<string, L> = {
    get_appointments: { uz: 'Qabullar', ru: 'Приёмы' },
    get_revenue: { uz: 'Moliya', ru: 'Финансы' },
    get_debtors: { uz: 'Qarzdorlar', ru: 'Должники' },
    get_doctor_stats: { uz: 'Shifokorlar', ru: 'Врачи' },
    find_patient: { uz: 'Bemorlar', ru: 'Пациенты' },
    get_low_stock: { uz: 'Ombor', ru: 'Склад' },
    get_leads: { uz: 'Lidlar', ru: 'Лиды' },
    get_patient_card: { uz: 'Bemor kartasi', ru: 'Карта пациента' },
    find_free_slots: { uz: 'Bo\'sh vaqtlar', ru: 'Свободное время' },
    send_reminder: { uz: 'Eslatma', ru: 'Напоминание' },
    send_message: { uz: 'Xabar', ru: 'Сообщение' },
    book_appointment: { uz: 'Qabulga yozish', ru: 'Запись' },
    update_lead_status: { uz: 'Lid holati', ru: 'Статус лида' },
    create_expense: { uz: 'Xarajat', ru: 'Расход' },
    add_charge: { uz: 'Qarz yozish', ru: 'Долг' },
    add_procedure: { uz: 'Protsedura', ru: 'Процедура' },
    add_cash: { uz: 'Kassa', ru: 'Касса' },
    record_payment: { uz: 'To\'lov', ru: 'Оплата' },
    pay_doctor: { uz: 'Shifokorga to\'lov', ru: 'Выплата врачу' },
    update_doctor_pay: { uz: 'Ish haqi', ru: 'Зарплата' },
};

export const sourceLabel = (name: string, lang: Lang): string => SOURCE_LABEL[name]?.[lang] || name;

export const STATUS_LABEL: Record<string, L> = {
    Pending: { uz: 'Kutilmoqda', ru: 'Ожидается' },
    Confirmed: { uz: 'Tasdiqlangan', ru: 'Подтверждён' },
    'Checked-In': { uz: 'Klinikada', ru: 'В клинике' },
    Completed: { uz: 'Yakunlandi', ru: 'Завершён' },
    'No-Show': { uz: 'Kelmadi', ru: 'Не пришёл' },
    Cancelled: { uz: 'Bekor', ru: 'Отменён' },
};

export const TOOTH_LABEL: Record<string, L> = {
    Healthy: { uz: 'Sog\'lom', ru: 'Здоров' },
    Cavity: { uz: 'Karies', ru: 'Кариес' },
    Filled: { uz: 'Plomba', ru: 'Пломба' },
    Missing: { uz: 'Olingan', ru: 'Удалён' },
    Crown: { uz: 'Koronka', ru: 'Коронка' },
    Pulpitis: { uz: 'Pulpit', ru: 'Пульпит' },
    Periodontitis: { uz: 'Periodontit', ru: 'Периодонтит' },
    Abscess: { uz: 'Absess', ru: 'Абсцесс' },
    Phlegmon: { uz: 'Flegmona', ru: 'Флегмона' },
    Osteomyelitis: { uz: 'Osteomielit', ru: 'Остеомиелит' },
    Adentia: { uz: 'Adentiya', ru: 'Адентия' },
    Implant: { uz: 'Implant', ru: 'Имплант' },
};

/** "Xayrli tong / kun / kech" — klinikaning ish kuni ritmiga qarab. */
export function greeting(lang: Lang, name?: string, now = new Date()): string {
    const h = now.getHours();
    const part = h < 5 ? { uz: 'Xayrli tun', ru: 'Доброй ночи' }
        : h < 11 ? { uz: 'Xayrli tong', ru: 'Доброе утро' }
            : h < 17 ? { uz: 'Xayrli kun', ru: 'Добрый день' }
                : { uz: 'Xayrli kech', ru: 'Добрый вечер' };
    const first = String(name || '').trim().split(/\s+/)[0];
    return first ? `${part[lang]}, ${first}` : part[lang];
}
