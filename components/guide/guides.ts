/**
 * O'quv markazi ssenariylari.
 *
 *  - "To'liq tanishuv" — asosiy imkoniyatlar, kerakli sahifalarni qo'llanma o'zi ochadi;
 *  - sahifa qo'llanmalari — shu sahifadagi tugma va bloklar;
 *  - "Qanday qilinadi?" — murakkabroq ishlar (protsedura qo'shish, to'lov...). Bunda
 *    foydalanuvchi ishni o'zi bajaradi: qo'llanma keyingi joyni ko'rsatib, u bosilganini
 *    yoki oyna yopilganini kutadi.
 *
 * Elementlar `data-tour="..."` belgisi bilan topiladi. Ekranda bo'lmagan ixtiyoriy qadam
 * (rol, ruxsat, ekran o'lchami) jimgina tashlab ketiladi — shuning uchun bitta ssenariy
 * admin, resepshn va shifokorga ham, telefon va kompyuterga ham yaraydi.
 */
import type { LucideIcon } from 'lucide-react';
import {
    Compass, LayoutDashboard, Users, CalendarDays, MessageSquare,
    Stethoscope, UserPlus, CalendarPlus, Wallet, Tags, MessageSquareText,
} from 'lucide-react';
import type { TranslationKey } from '../../i18n/translations';
import type { PermChecker } from '../../utils/permissions';

export type GuideRole = 'admin' | 'doctor' | 'receptionist';

/** Qaysi qo'llanmalar kimga ko'rinishini App hisoblab beradi */
export interface GuideContext {
    role: GuideRole;
    perms: PermChecker;
    /** Menyuda ko'rinadigan bo'limlar */
    nav: string[];
    /** "Qabul" paneli ochiladimi */
    canBook: boolean;
    /** Bosh sahifadagi "To'lov" tugmasi ko'rinadimi */
    canPay: boolean;
    /** O'rganilganlar shu kalit bilan saqlanadi — har bir xodimga alohida */
    userKey: string;
}

export interface GuideStep {
    id?: string;
    /** `data-tour` qiymati. Bo'lmasa — ekran o'rtasidagi izoh */
    target?: string;
    title: TranslationKey;
    body: TranslationKey;
    /** Kartadagi kichik yorliq (to'liq tanishuvda — bo'lim nomi) */
    chapter?: TranslationKey;
    /** Qadam shu sahifada. Boshqa sahifada bo'lsak — qo'llanma o'zi o'tadi */
    route?: string;
    /**
     * spot — atrof qorong'ilashadi, faqat belgilangan joy ochiq (standart);
     * ring — sahifa odatdagidek ishlaydi, joy faqat halqa bilan ko'rsatiladi (oyna ichidagi formalar)
     */
    mode?: 'spot' | 'ring';
    /** Foydalanuvchi belgilangan joyni o'zi bosadi — shundan keyin davom etiladi */
    action?: 'click';
    /**
     * O'zi keyingi qadamga o'tadi: manzil mos kelsa, element paydo bo'lsa yoki
     * (bosilgandan keyin) element yo'qolsa — masalan, "Saqlash"dan keyin oyna yopildi
     */
    doneWhen?: { path?: RegExp; appear?: string; gone?: string };
    /** Bu qadam kerak emas: shu manzilda turibmiz yoki shu element allaqachon ekranda */
    skip?: { path?: RegExp; visible?: string };
    /** Belgilangan joy yo'qolsa (oyna yopildi, boshqa sahifaga o'tildi) — shu qadamga qaytiladi */
    recover?: string;
    /** Topilmasa jimgina tashlab ketiladi */
    optional?: boolean;
    when?: (ctx: GuideContext) => boolean;
    /** Faqat shu rollarda bor (masalan, "Mening navbatim" — shifokorda) */
    roles?: GuideRole[];
    /** Faqat telefonda (pastki menyu, ☰) yoki faqat kompyuterda (qidiruv) bor */
    screen?: 'mobile' | 'desktop';
}

export interface Guide {
    id: string;
    kind: 'tour' | 'page' | 'task';
    title: TranslationKey;
    desc: TranslationKey;
    icon: LucideIcon;
    /** Belgi foni — Tailwind gradient ranglari */
    tone: string;
    minutes: number;
    /** Sahifa qo'llanmasi qaysi manzilniki */
    page?: string;
    when?: (ctx: GuideContext) => boolean;
    steps: GuideStep[];
}

const hasNav = (id: string) => (c: GuideContext) => c.nav.includes(id);
const DESK: GuideRole[] = ['admin', 'receptionist'];
const PATIENT_CARD = /^\/patients\/[^/]+\/?$/;

// ── To'liq tanishuv ─────────────────────────────────────────────────────────

const TOUR: Guide = {
    id: 'tour', kind: 'tour', icon: Compass, tone: 'from-primary-600 to-violet-600', minutes: 2,
    title: 'guide.tour.title', desc: 'guide.tour.desc',
    steps: [
        { title: 'guide.tour.welcome.title', body: 'guide.tour.welcome.desc' },
        { route: '/', target: 'nav', chapter: 'guide.ch.start', title: 'tour.nav.title', body: 'tour.nav.desc', optional: true },
        { route: '/', target: 'menu', chapter: 'guide.ch.start', title: 'tour.menu.title', body: 'tour.menu.desc', optional: true, screen: 'mobile' },
        { route: '/', target: 'search', chapter: 'guide.ch.start', title: 'tour.search.title', body: 'tour.search.desc', optional: true, screen: 'desktop' },
        // Resepshn va admin — "Bugun klinikada", shifokor — "Mening navbatim": qaysi biri ekranda bo'lsa
        { route: '/', target: 'clinic-map', chapter: 'guide.ch.dashboard', title: 'tour.map.title', body: 'tour.map.desc', optional: true, roles: DESK },
        { route: '/', target: 'my-queue', chapter: 'guide.ch.dashboard', title: 'tour.myQueue.title', body: 'tour.myQueue.desc', optional: true, roles: ['doctor'] },
        { route: '/', target: 'quick', chapter: 'guide.ch.dashboard', title: 'tour.quick.title', body: 'tour.quick.desc', optional: true },
        { route: '/patients', target: 'pat-search', chapter: 'guide.ch.patients', title: 'guide.tour.patients.title', body: 'guide.tour.patients.desc', optional: true, when: hasNav('patients') },
        { route: '/calendar', target: 'cal-grid', chapter: 'guide.ch.calendar', title: 'guide.tour.calendar.title', body: 'guide.tour.calendar.desc', optional: true, when: hasNav('calendar') },
        { route: '/finance', target: 'fin-head', chapter: 'guide.ch.finance', title: 'guide.tour.finance.title', body: 'guide.tour.finance.desc', optional: true, when: hasNav('finance') },
        { route: '/messages', target: 'msg-tabs', chapter: 'guide.ch.messages', title: 'guide.tour.messages.title', body: 'guide.tour.messages.desc', optional: true, when: hasNav('messages') },
        { route: '/', target: 'ai', chapter: 'guide.ch.helpers', title: 'tour.ai.title', body: 'tour.ai.desc', optional: true },
        { route: '/', target: 'bell', chapter: 'guide.ch.helpers', title: 'tour.bell.title', body: 'tour.bell.desc', optional: true },
        { route: '/', target: 'tour', chapter: 'guide.ch.helpers', title: 'guide.tour.end.title', body: 'guide.tour.end.desc', optional: true },
    ],
};

// ── Sahifa qo'llanmalari ────────────────────────────────────────────────────

const page = (route: string, steps: ([string, string] | [string, string, GuideRole[]])[]): GuideStep[] =>
    steps.map(([target, name, roles]) => ({
        route, target, optional: true, roles,
        title: `tour.${name}.title` as TranslationKey,
        body: `tour.${name}.desc` as TranslationKey,
    }));

const PAGES: Guide[] = [
    {
        id: 'page-dashboard', kind: 'page', page: '/', icon: LayoutDashboard, tone: 'from-sky-500 to-primary-600', minutes: 1,
        title: 'guide.page.dashboard', desc: 'guide.page.dashboard.desc',
        steps: page('/', [
            ['period', 'period'], ['quick', 'quick'], ['clinic-map', 'map', DESK], ['money', 'money', DESK],
            ['calls', 'calls', DESK], ['my-queue', 'myQueue', ['doctor']], ['colleagues', 'colleagues', ['doctor']],
        ]),
    },
    {
        id: 'page-patients', kind: 'page', page: '/patients', icon: Users, tone: 'from-indigo-500 to-primary-600', minutes: 1,
        title: 'guide.page.patients', desc: 'guide.page.patients.desc', when: hasNav('patients'),
        steps: page('/patients', [['pat-add', 'patAdd'], ['pat-stats', 'patStats'], ['pat-search', 'patSearch'], ['pat-row', 'patList']]),
    },
    {
        id: 'page-calendar', kind: 'page', page: '/calendar', icon: CalendarDays, tone: 'from-cyan-500 to-sky-600', minutes: 1,
        title: 'guide.page.calendar', desc: 'guide.page.calendar.desc', when: hasNav('calendar'),
        steps: page('/calendar', [['cal-date', 'calDate'], ['cal-view', 'calView'], ['cal-new', 'calNew'], ['cal-doctors', 'calDoctors'], ['cal-grid', 'calGrid']]),
    },
    {
        id: 'page-messages', kind: 'page', page: '/messages', icon: MessageSquare, tone: 'from-fuchsia-500 to-violet-600', minutes: 1,
        title: 'guide.page.messages', desc: 'guide.page.messages.desc', when: hasNav('messages'),
        steps: page('/messages', [['msg-tabs', 'msgTabs'], ['msg-vars', 'msgVars'], ['msg-new', 'msgNew'], ['msg-templates', 'msgTemplate']]),
    },
];

// ── Qanday qilinadi? ────────────────────────────────────────────────────────

const TASKS: Guide[] = [
    {
        id: 'task-procedure', kind: 'task', icon: Stethoscope, tone: 'from-emerald-500 to-teal-600', minutes: 2,
        title: 'guide.proc.title', desc: 'guide.proc.desc', when: hasNav('patients'),
        steps: [
            // Karta allaqachon ochiq bo'lsa — to'g'ri protsedura qo'shishga o'tiladi
            { id: 'find', route: '/patients', target: 'pat-search', mode: 'ring', title: 'guide.proc.find.title', body: 'guide.proc.find.desc', doneWhen: { path: PATIENT_CARD }, skip: { path: PATIENT_CARD } },
            // "Bugungi qabul" faqat "Umumiy" bo'limida — boshqa bo'lim ochiq bo'lsa, avval shunga
            { id: 'tab', target: 'pd-tab-overview', action: 'click', title: 'guide.proc.tab.title', body: 'guide.proc.tab.desc', skip: { visible: 'proc-add' }, recover: 'find' },
            { id: 'add', target: 'proc-add', action: 'click', title: 'guide.proc.add.title', body: 'guide.proc.add.desc', skip: { visible: 'proc-teeth' }, recover: 'tab' },
            { target: 'proc-teeth', mode: 'ring', title: 'guide.proc.teeth.title', body: 'guide.proc.teeth.desc', recover: 'add' },
            { target: 'proc-service', mode: 'ring', title: 'guide.proc.service.title', body: 'guide.proc.service.desc', recover: 'add' },
            // Tugma xizmat tanlanmaguncha yopiq — ro'yxatga birinchi qator tushganda davom etamiz
            { target: 'proc-add-list', mode: 'ring', title: 'guide.proc.list.title', body: 'guide.proc.list.desc', doneWhen: { appear: 'proc-queue-item' }, recover: 'add' },
            { target: 'proc-save', mode: 'ring', action: 'click', doneWhen: { gone: 'proc-modal' }, title: 'guide.proc.save.title', body: 'guide.proc.save.desc', recover: 'add' },
            { target: 'visit-next', mode: 'ring', title: 'guide.proc.next.title', body: 'guide.proc.next.desc', recover: 'add' },
            // Yakunlash haqiqiy amal (to'lov oynasi ochiladi) — faqat tushuntiramiz, bosishni o'ziga qoldiramiz
            { target: 'visit-complete', title: 'guide.proc.complete.title', body: 'guide.proc.complete.desc', recover: 'add' },
        ],
    },
    {
        id: 'task-patient', kind: 'task', icon: UserPlus, tone: 'from-primary-500 to-indigo-600', minutes: 1,
        title: 'guide.pat.title', desc: 'guide.pat.desc',
        when: c => c.nav.includes('patients') && c.perms.can('patients', 'card', 'create'),
        steps: [
            { id: 'open', route: '/patients', target: 'pat-add', action: 'click', title: 'guide.pat.open.title', body: 'guide.pat.open.desc', skip: { visible: 'pat-form' } },
            { target: 'pat-form-name', mode: 'ring', title: 'guide.pat.name.title', body: 'guide.pat.name.desc', recover: 'open' },
            { target: 'pat-form-phone', mode: 'ring', title: 'guide.pat.phone.title', body: 'guide.pat.phone.desc', recover: 'open' },
            { target: 'pat-form-dob', mode: 'ring', title: 'guide.pat.dob.title', body: 'guide.pat.dob.desc', recover: 'open' },
            { target: 'pat-form-doctor', mode: 'ring', optional: true, title: 'guide.pat.doctor.title', body: 'guide.pat.doctor.desc', recover: 'open' },
            { target: 'pat-form-save', mode: 'ring', action: 'click', doneWhen: { gone: 'pat-form' }, title: 'guide.pat.save.title', body: 'guide.pat.save.desc', recover: 'open' },
        ],
    },
    {
        id: 'task-booking', kind: 'task', icon: CalendarPlus, tone: 'from-sky-500 to-blue-600', minutes: 1,
        title: 'guide.book.title', desc: 'guide.book.desc', when: c => c.canBook,
        steps: [
            { id: 'open', route: '/', target: 'quick-book', action: 'click', title: 'guide.book.open.title', body: 'guide.book.open.desc', skip: { visible: 'bk-panel' } },
            { target: 'bk-patient', mode: 'ring', title: 'guide.book.patient.title', body: 'guide.book.patient.desc', recover: 'open' },
            { target: 'bk-when', mode: 'ring', title: 'guide.book.when.title', body: 'guide.book.when.desc', recover: 'open' },
            { target: 'bk-doctor', mode: 'ring', optional: true, title: 'guide.book.doctor.title', body: 'guide.book.doctor.desc', recover: 'open' },
            // Vaqt jadvali faqat "Bugun" va "Boshqa kun"da — "Hozir"da tashlab ketiladi
            { target: 'bk-time', mode: 'ring', optional: true, title: 'guide.book.time.title', body: 'guide.book.time.desc', recover: 'open' },
            { target: 'bk-service', mode: 'ring', title: 'guide.book.service.title', body: 'guide.book.service.desc', recover: 'open' },
            { target: 'bk-submit', mode: 'ring', action: 'click', doneWhen: { gone: 'bk-panel' }, title: 'guide.book.submit.title', body: 'guide.book.submit.desc', recover: 'open' },
        ],
    },
    {
        id: 'task-payment', kind: 'task', icon: Wallet, tone: 'from-green-500 to-emerald-600', minutes: 1,
        title: 'guide.pay.title', desc: 'guide.pay.desc', when: c => c.canPay,
        steps: [
            { id: 'open', route: '/', target: 'quick-pay', action: 'click', title: 'guide.pay.open.title', body: 'guide.pay.open.desc', skip: { visible: 'pay-modal' } },
            { target: 'pay-patient', mode: 'ring', title: 'guide.pay.patient.title', body: 'guide.pay.patient.desc', recover: 'open' },
            { target: 'pay-services', mode: 'ring', optional: true, title: 'guide.pay.services.title', body: 'guide.pay.services.desc', recover: 'open' },
            { target: 'pay-split', mode: 'ring', title: 'guide.pay.split.title', body: 'guide.pay.split.desc', recover: 'open' },
            { target: 'pay-method', mode: 'ring', title: 'guide.pay.method.title', body: 'guide.pay.method.desc', recover: 'open' },
            { target: 'pay-save', mode: 'ring', action: 'click', doneWhen: { gone: 'pay-modal' }, title: 'guide.pay.save.title', body: 'guide.pay.save.desc', recover: 'open' },
        ],
    },
    {
        id: 'task-service', kind: 'task', icon: Tags, tone: 'from-amber-500 to-orange-600', minutes: 1,
        title: 'guide.svc.title', desc: 'guide.svc.desc',
        when: c => c.role !== 'doctor' && c.nav.includes('settings') && c.perms.can('settings', 'services', 'create'),
        steps: [
            { id: 'tab', route: '/settings', target: 'set-tab-services', action: 'click', title: 'guide.svc.tab.title', body: 'guide.svc.tab.desc', skip: { visible: 'svc-add' } },
            { id: 'open', route: '/settings', target: 'svc-add', action: 'click', title: 'guide.svc.open.title', body: 'guide.svc.open.desc', skip: { visible: 'svc-form' }, recover: 'tab' },
            { target: 'svc-name', mode: 'ring', title: 'guide.svc.name.title', body: 'guide.svc.name.desc', recover: 'open' },
            { target: 'svc-price', mode: 'ring', title: 'guide.svc.price.title', body: 'guide.svc.price.desc', recover: 'open' },
            { target: 'svc-recall', mode: 'ring', title: 'guide.svc.recall.title', body: 'guide.svc.recall.desc', recover: 'open' },
            { target: 'svc-req', mode: 'ring', title: 'guide.svc.req.title', body: 'guide.svc.req.desc', recover: 'open' },
            { target: 'svc-save', mode: 'ring', action: 'click', doneWhen: { gone: 'svc-form' }, title: 'guide.svc.save.title', body: 'guide.svc.save.desc', recover: 'open' },
        ],
    },
    {
        id: 'task-sms', kind: 'task', icon: MessageSquareText, tone: 'from-violet-500 to-fuchsia-600', minutes: 1,
        title: 'guide.sms.title', desc: 'guide.sms.desc',
        when: c => c.role !== 'doctor' && c.nav.includes('messages') && c.perms.flag('messages', 'automation'),
        steps: [
            { id: 'tab', route: '/messages', target: 'msg-tab-templates', action: 'click', title: 'guide.sms.tab.title', body: 'guide.sms.tab.desc', skip: { visible: 'msg-new' } },
            { id: 'open', route: '/messages', target: 'msg-new', action: 'click', title: 'guide.sms.open.title', body: 'guide.sms.open.desc', skip: { visible: 'msg-form' }, recover: 'tab' },
            { target: 'msg-form-name', mode: 'ring', title: 'guide.sms.name.title', body: 'guide.sms.name.desc', recover: 'open' },
            { target: 'msg-form-text', mode: 'ring', title: 'guide.sms.text.title', body: 'guide.sms.text.desc', recover: 'open' },
            { target: 'msg-form-save', mode: 'ring', action: 'click', doneWhen: { gone: 'msg-form' }, title: 'guide.sms.save.title', body: 'guide.sms.save.desc', recover: 'open' },
            { route: '/messages', target: 'msg-tab-auto', optional: true, title: 'guide.sms.auto.title', body: 'guide.sms.auto.desc' },
        ],
    },
];

/** Shu xodimga ochiq qo'llanmalar: bo'limi yo'q yoki ruxsati yo'q ishlar ko'rsatilmaydi */
export function availableGuides(ctx: GuideContext): { tour: Guide; pages: Guide[]; tasks: Guide[] } {
    const ok = (g: Guide) => !g.when || g.when(ctx);
    return { tour: TOUR, pages: PAGES.filter(ok), tasks: TASKS.filter(ok) };
}

/** Qadamlar ro'yxati shu xodim va ekran uchun (mos kelmaydiganlari olib tashlanadi) */
export function stepsFor(guide: Guide, ctx: GuideContext): GuideStep[] {
    // Ilova sarlavhasi lg (1024px) dan boshlab kompyuter ko'rinishiga o'tadi
    const screen = window.innerWidth >= 1024 ? 'desktop' : 'mobile';
    return guide.steps.filter(s =>
        (!s.when || s.when(ctx))
        && (!s.roles || s.roles.includes(ctx.role))
        && (!s.screen || s.screen === screen));
}

/** Manzil qaysi sahifa qo'llanmasiga tegishli */
export const pageGuideFor = (pages: Guide[], pathname: string): Guide | undefined => {
    const path = pathname.replace(/\/+$/, '') || '/';
    return pages.find(g => g.page === path);
};
