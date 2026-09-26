import React, { useEffect, useMemo, useState } from 'react';
import {
    Wallet, FlaskConical, PhoneCall, Phone, ChevronRight, ChevronDown, CheckCircle2, XCircle, ArrowUpRight,
    PhoneMissed, CalendarClock, CalendarPlus, Clock, Gift, Undo2, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LabOrder, Patient } from '../types';
import { Card } from './Common';
import { weekdayShort } from './DateField';
import { useLanguage } from '../context/LanguageContext';
import { UnpaidRow } from '../utils/unpaid';
import { addDaysISO, CallItem, CallKind, LabSummary } from '../utils/desk';

/**
 * Bosh sahifadagi "diqqat talab qiladi" kartalari: pul, laboratoriya, qo'ng'iroqlar.
 * Har biri bo'sh bo'lsa bitta qatorga qisqaradi — bo'sh katta blok qolmaydi.
 */

const SECTION_LIMIT = 3;
const ddmm = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('.') : '';

const Shell: React.FC<{
    icon: React.ElementType;
    tone: string;
    title: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
}> = ({ icon: Icon, tone, title, badge, children, footer }) => (
    <Card className="p-5 rounded-[2rem] flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-3">
            <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-[18px] h-[18px]" /></span>
            <h3 className="flex-1 min-w-0 text-base font-black text-gray-900 dark:text-white truncate">{title}</h3>
            {badge}
        </div>
        <div className="flex-1 min-w-0">{children}</div>
        {footer}
    </Card>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
    <p className="flex items-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> {text}
    </p>
);

const SectionTitle: React.FC<{ text: string; count: number; tone?: string }> = ({ text, count, tone = 'text-gray-500 dark:text-gray-400' }) => (
    <p className={`mt-2 mb-0.5 text-[10px] font-black uppercase tracking-widest ${tone}`}>{text} · {count}</p>
);

const MoreLink: React.FC<{ text: string; onClick?: () => void }> = ({ text, onClick }) => onClick ? (
    <button type="button" onClick={onClick} className="w-full mt-2 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600">
        {text} <ChevronRight className="w-3.5 h-3.5" />
    </button>
) : null;

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const TelButton: React.FC<{ phone?: string; label: string; onClick?: () => void }> = ({ phone, label, onClick }) => phone ? (
    <a href={telHref(phone)} title={phone} aria-label={`${label}: ${phone}`} onClick={onClick}
        className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-[11px] font-bold transition-colors">
        {/* Telefonda faqat belgi — ismga joy qolsin */}
        <Phone className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
    </a>
) : null;

// ── Pul ──────────────────────────────────────────────────────────────────────

interface DeskMoneyCardProps {
    /** Kassada kutilayotgan (qabul tugagan, pul olinmagan) */
    awaiting: UnpaidRow[];
    debts: UnpaidRow[];
    today: string;
    showAmounts: boolean;
    /** Dashboard'dagi mavjud qator: "To'lovni olish" va "Bepul" tugmalari bilan */
    renderRow: (row: UnpaidRow) => React.ReactNode;
    onPatientClick?: (id: string) => void;
    onSeeAll?: () => void;
}

/** Kutilayotgan to'lovlarda har bo'limdan ko'rinadigan qatorlar (karta butun kenglikda) */
const MONEY_LIMIT = 4;

/**
 * Kutilayotgan to'lovlar — bosh sahifada alohida, butun kenglikdagi blok.
 * Bo'limlar (to'lov kutilmoqda, qarzlar) yonma-yon ustunlarda; bo'sh bo'lim
 * ustun egallamaydi. Bo'lib to'lash bu yerda yo'q — u Bemor kartasida.
 */
export const DeskMoneyCard: React.FC<DeskMoneyCardProps> = ({ awaiting, debts, showAmounts, renderRow, onSeeAll }) => {
    const { t } = useLanguage();
    // Shifokor kassaga yuborgan bemor hozir kassa oldida turibdi — birinchi
    const atDesk = (r: UnpaidRow) => (r.source === 'appointment' && r.sentToCashier ? 1 : 0);
    const sortedAwaiting = [...awaiting].sort((a, b) => atDesk(b) - atDesk(a) || b.date.localeCompare(a.date));
    const total = [...awaiting, ...debts].reduce((s, r) => s + (r.amount || 0), 0);
    const count = awaiting.length + debts.length;
    const hidden = Math.max(0, awaiting.length - MONEY_LIMIT) + Math.max(0, debts.length - MONEY_LIMIT);
    const twoCols = awaiting.length > 0 && debts.length > 0;

    return (
        <Shell
            icon={Wallet}
            tone="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            title={t('desk.moneyTitle')}
            badge={count > 0 ? (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-black tabular-nums">
                    {showAmounts && total > 0 ? `${total.toLocaleString()} UZS` : count}
                </span>
            ) : undefined}
            footer={hidden > 0 ? <MoreLink text={t('desk.moreAll').replace('{n}', String(hidden))} onClick={onSeeAll} /> : undefined}
        >
            {count === 0 ? <Empty text={t('desk.moneyEmpty')} /> : (
                <div className={`grid grid-cols-1 gap-x-8 gap-y-2 ${twoCols ? 'lg:grid-cols-2' : ''}`}>
                    {sortedAwaiting.length > 0 && (
                        <section className="min-w-0">
                            <SectionTitle text={t('desk.moneyAwaiting')} count={awaiting.length} tone="text-amber-600 dark:text-amber-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">{sortedAwaiting.slice(0, MONEY_LIMIT).map(renderRow)}</div>
                        </section>
                    )}
                    {debts.length > 0 && (
                        <section className="min-w-0">
                            <SectionTitle text={t('desk.moneyDebts')} count={debts.length} tone="text-red-600 dark:text-red-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">{debts.slice(0, MONEY_LIMIT).map(renderRow)}</div>
                        </section>
                    )}
                </div>
            )}
        </Shell>
    );
};

// ── Laboratoriya ─────────────────────────────────────────────────────────────

interface DeskLabCardProps {
    summary: LabSummary;
    patients: Patient[];
    showPhone: boolean;
    onPatientClick?: (id: string) => void;
    onOpenLab?: () => void;
}

export const DeskLabCard: React.FC<DeskLabCardProps> = ({ summary, patients, showPhone, onPatientClick, onOpenLab }) => {
    const { t } = useLanguage();
    // Buyurtmada faqat bemor ismi saqlanadi — bemorni ism bo'yicha topamiz
    const byName = new Map<string, Patient>(patients.map(p => [`${p.lastName} ${p.firstName}`.trim().toLowerCase(), p] as [string, Patient]));
    const findPatient = (o: LabOrder) => byName.get(String(o.patientName || '').trim().toLowerCase());
    const attention = summary.ready.length + summary.overdue.length + summary.dueToday.length;

    const row = (o: LabOrder, chip: React.ReactNode, withCall = false) => {
        const p = findPatient(o);
        return (
            <div key={o.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => p && onPatientClick?.(p.id)} disabled={!p || !onPatientClick}
                        className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 disabled:hover:text-gray-900 dark:disabled:hover:text-white text-left">
                        {o.patientName}
                    </button>
                    <p className="text-[11px] text-gray-400 truncate">
                        {o.priority === 'Urgent' && <span className="text-red-500 font-bold">{t('desk.urgent')} · </span>}
                        {[o.orderType, o.technicianName].filter(Boolean).join(' · ')}
                    </p>
                </div>
                {chip}
                {withCall && showPhone && <TelButton phone={p?.phone} label={t('desk.call')} />}
            </div>
        );
    };
    const chip = (text: string, tone: string) => (
        <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums ${tone}`}>{text}</span>
    );

    return (
        <Shell
            icon={FlaskConical}
            tone="bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
            title={t('desk.labTitle')}
            badge={attention > 0 ? (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-black">{attention}</span>
            ) : undefined}
            footer={(summary.inProgress > 0 || attention > 0) ? (
                <MoreLink
                    text={summary.inProgress > 0 ? t('desk.labInProgress').replace('{n}', String(summary.inProgress)) : t('desk.labOpen')}
                    onClick={onOpenLab}
                />
            ) : undefined}
        >
            {attention === 0 ? (
                <Empty text={summary.inProgress > 0 ? t('desk.labAllOnTime') : t('desk.labEmpty')} />
            ) : (
                <>
                    {summary.ready.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.labReady')} count={summary.ready.length} tone="text-emerald-600 dark:text-emerald-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {summary.ready.slice(0, SECTION_LIMIT).map(o => row(o, null, true))}
                            </div>
                        </>
                    )}
                    {summary.overdue.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.labOverdue')} count={summary.overdue.length} tone="text-red-600 dark:text-red-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {summary.overdue.slice(0, SECTION_LIMIT).map(o => row(o, chip(ddmm(o.deadline), 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300')))}
                            </div>
                        </>
                    )}
                    {summary.dueToday.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.labToday')} count={summary.dueToday.length} tone="text-amber-600 dark:text-amber-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {summary.dueToday.slice(0, SECTION_LIMIT).map(o => row(o, chip(t('desk.today'), 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')))}
                            </div>
                        </>
                    )}
                </>
            )}
        </Shell>
    );
};

// ── Qo'ng'iroqlar ────────────────────────────────────────────────────────────

const KIND_CHIP: Record<CallKind, string> = {
    noshow: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    lead: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    confirm: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    recall: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    birthday: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
};
/** Filtr tugmalari tartibi: obzvonning asosiysi — qabulni tasdiqlash — birinchi */
const KIND_ORDER: CallKind[] = ['confirm', 'lead', 'noshow', 'recall', 'birthday'];
const CALLS_LIMIT = 6;
const UNDO_MS = 8000;

/** Amal bajarilgach karta pastida chiqadigan xabar. undo bo'lsa — "Qaytarish" tugmasi. */
export interface CallDone {
    text: string;
    tone?: 'ok' | 'danger' | 'missed';
    undo?: () => Promise<void>;
}
type CallAction = (c: CallItem) => Promise<CallDone | void>;

/** Qatordagi natija tugmalari. Berilmagani (ruxsat yo'q) ko'rinmaydi. */
export interface CallActions {
    /** Tasdiqlash: keladi, kelmaydi, boshqa vaqtga */
    confirm?: CallAction;
    cancel?: CallAction;
    reschedule?: (c: CallItem) => void;
    /** Kelmagan yoki nazoratdagi bemorni qabulga yozish */
    book?: (c: CallItem) => void;
    /** Lidni qabulga yozish — yangi bemor sifatida */
    bookLead?: (c: CallItem) => void;
    thinking?: CallAction;
    reject?: CallAction;
    /** Kelmagan va nazorat: "kerak emas"; tug'ilgan kun: "tabrikladim" */
    dismiss?: CallAction;
    noAnswer?: CallAction;
}

type BtnTone = 'good' | 'primary' | 'pink' | 'neutral' | 'danger';
interface Btn {
    label: string;
    icon: React.ElementType;
    tone: BtnTone;
    onClick: () => void;
}

const MAIN_TONE: Record<BtnTone, string> = {
    good: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
    primary: 'bg-primary hover:bg-primary-700 text-white shadow-sm shadow-primary-500/20',
    pink: 'bg-pink-600 hover:bg-pink-700 text-white shadow-sm shadow-pink-600/20',
    neutral: 'bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
};
const REST_TONE: Record<'neutral' | 'danger', string> = {
    neutral: 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
    danger: 'border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20',
};

const hm = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface DeskCallsCardProps {
    items: CallItem[];
    today: string;
    showPhone: boolean;
    actions: CallActions;
    /** Tasdiqlanadigan kun (odatda ertaga): nechta qabul, nechtasi tasdiqlangan */
    progress?: { day: string; total: number; confirmed: number };
    /** Bugun yozilgan natijalar */
    summary?: { confirmed: number; cancelled: number; booked: number; noAnswer: number };
    onPatientClick?: (id: string) => void;
    onOpenLeads?: () => void;
}

/**
 * "Qo'ng'iroq qilish kerak" — resepshnning obzvon ro'yxati. Qatorni bosganda
 * natija tugmalari ochiladi; natija o'z yozuviga yoziladi va qator ro'yxatdan
 * chiqadi. Adashib bosilsa — pastdagi "Qaytarish".
 */
export const DeskCallsCard: React.FC<DeskCallsCardProps> = ({ items, today, showPhone, actions, progress, summary, onPatientClick, onOpenLeads }) => {
    const { t, language } = useLanguage();
    const [filter, setFilter] = useState<CallKind | 'all'>('all');
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [askCancel, setAskCancel] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [done, setDone] = useState<(CallDone & { id: number }) | null>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        if (!done) return;
        const id = setTimeout(() => setDone(null), UNDO_MS);
        return () => clearTimeout(id);
    }, [done]);

    const counts = useMemo(() => {
        const m: Partial<Record<CallKind, number>> = {};
        for (const c of items) m[c.kind] = (m[c.kind] || 0) + 1;
        return m;
    }, [items]);
    const kinds = KIND_ORDER.filter(k => counts[k]);
    // Tanlangan turdagi qatorlar tugasa — "Hammasi"ga qaytadi
    const active = filter !== 'all' && counts[filter] ? filter : 'all';
    const list = active === 'all' ? items : items.filter(c => c.kind === active);
    const visible = showAll ? list : list.slice(0, CALLS_LIMIT);
    const retryFrom = visible.findIndex(c => c.attempts > 0);

    const kindLabel = (k: CallKind) => t(`desk.call.${k}` as any);
    const dayLabel = (iso?: string) => {
        if (!iso) return '';
        if (iso === today) return t('desk.call.dayToday');
        if (iso === addDaysISO(today, 1)) return t('desk.call.dayTomorrow');
        const [y, m, d] = iso.split('-').map(Number);
        return `${weekdayShort(new Date(y, m - 1, d), language)} ${ddmm(iso)}`;
    };
    const detail = (c: CallItem): string => {
        switch (c.kind) {
            case 'noshow': return t('desk.call.noshowDetail').replace('{time}', c.time || '').replace('{doctor}', c.doctorName || '');
            case 'lead': return c.note || t('desk.call.leadDetail');
            case 'confirm': return t('desk.call.confirmDetail').replace('{day}', dayLabel(c.apptDate)).replace('{time}', c.time || '').replace('{doctor}', c.doctorName || '');
            case 'recall': return [c.overdue ? t('desk.overdueSince').replace('{date}', ddmm(c.date || '')) : t('desk.dueOn').replace('{date}', ddmm(c.date || '')), c.note].filter(Boolean).join(' · ');
            case 'birthday': return c.age ? t('desk.call.birthdayAge').replace('{n}', String(c.age)) : t('desk.call.birthdayDetail');
        }
    };

    const run = async (c: CallItem, fn?: CallAction) => {
        if (!fn || busyKey) return;
        setBusyKey(c.key);
        try {
            const res = await fn(c);
            setOpenKey(null);
            setAskCancel(null);
            if (res) setDone({ ...res, id: Date.now() });
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi, qator ochiq qoladi
        } finally {
            setBusyKey(null);
        }
    };
    const undo = async () => {
        const fn = done?.undo;
        setDone(null);
        if (!fn) return;
        try { await fn(); } catch { /* toast */ }
    };
    const toggle = (key: string) => {
        setOpenKey(k => (k === key ? null : key));
        setAskCancel(null);
    };
    /** Panel ochadigan amal (Qabul): qator yopiladi, natija panel saqlangach yoziladi */
    const opener = (c: CallItem, fn: (c: CallItem) => void) => () => {
        setOpenKey(null);
        fn(c);
    };

    const buttons = (c: CallItem): { main?: Btn; rest: Btn[] } => {
        const a = actions;
        const noAnswer: Btn | undefined = a.noAnswer && { label: t('desk.call.act.noAnswer'), icon: PhoneMissed, tone: 'neutral', onClick: () => run(c, a.noAnswer) };
        const keep = (xs: (Btn | undefined)[]) => xs.filter((b): b is Btn => !!b);
        switch (c.kind) {
            case 'confirm': return {
                main: a.confirm && { label: t('desk.call.act.confirm'), icon: CheckCircle2, tone: 'good', onClick: () => run(c, a.confirm) },
                rest: keep([
                    noAnswer,
                    a.reschedule && { label: t('desk.call.act.reschedule'), icon: CalendarClock, tone: 'neutral', onClick: opener(c, a.reschedule) },
                    a.cancel && { label: t('desk.call.act.cancel'), icon: XCircle, tone: 'danger', onClick: () => setAskCancel(c.key) },
                ]),
            };
            case 'lead': return {
                main: a.bookLead && { label: t('desk.call.act.book'), icon: CalendarPlus, tone: 'primary', onClick: opener(c, a.bookLead) },
                rest: keep([
                    noAnswer,
                    a.thinking && { label: t('desk.call.act.thinking'), icon: Clock, tone: 'neutral', onClick: () => run(c, a.thinking) },
                    a.reject && { label: t('desk.call.dismiss'), icon: XCircle, tone: 'danger', onClick: () => run(c, a.reject) },
                ]),
            };
            case 'noshow':
            case 'recall': return {
                main: a.book && { label: t(c.kind === 'noshow' ? 'desk.call.act.rebook' : 'desk.call.act.book'), icon: CalendarPlus, tone: 'primary', onClick: opener(c, a.book) },
                rest: keep([
                    noAnswer,
                    a.dismiss && { label: t('desk.call.dismiss'), icon: XCircle, tone: 'danger', onClick: () => run(c, a.dismiss) },
                ]),
            };
            case 'birthday': return {
                main: a.dismiss && { label: t('desk.call.act.greeted'), icon: Gift, tone: 'pink', onClick: () => run(c, a.dismiss) },
                rest: keep([noAnswer]),
            };
        }
    };

    const progressShown = !!progress && progress.total > 0 && (active === 'all' || active === 'confirm');
    const progressPct = progress && progress.total > 0 ? Math.round((progress.confirmed / progress.total) * 100) : 0;
    const summaryParts = summary ? [
        summary.confirmed > 0 && t('desk.call.sum.confirmed').replace('{n}', String(summary.confirmed)),
        summary.booked > 0 && t('desk.call.sum.booked').replace('{n}', String(summary.booked)),
        summary.cancelled > 0 && t('desk.call.sum.cancelled').replace('{n}', String(summary.cancelled)),
        summary.noAnswer > 0 && t('desk.call.sum.noAnswer').replace('{n}', String(summary.noAnswer)),
    ].filter(Boolean) as string[] : [];

    return (
        <Shell
            icon={PhoneCall}
            tone="bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
            title={t('desk.callsTitle')}
            badge={items.length > 0 ? (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-black">{items.length}</span>
            ) : undefined}
            footer={list.length > CALLS_LIMIT ? (
                <MoreLink
                    text={showAll ? t('desk.showLess') : t('desk.moreAll').replace('{n}', String(list.length - CALLS_LIMIT))}
                    onClick={() => setShowAll(v => !v)}
                />
            ) : undefined}
        >
            {kinds.length > 1 && (
                <div role="group" aria-label={t('desk.call.filter')} className="flex flex-wrap gap-1.5 pb-2.5">
                    {(['all', ...kinds] as const).map(k => {
                        const on = active === k;
                        return (
                            <button
                                key={k}
                                type="button"
                                aria-pressed={on}
                                onClick={() => { setFilter(k); setOpenKey(null); }}
                                className={`shrink-0 flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full text-[11px] font-bold transition-colors ${on
                                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                            >
                                {k === 'all' ? t('desk.call.all') : kindLabel(k)}
                                <span className={`tabular-nums ${on ? 'opacity-70' : 'text-gray-400 dark:text-gray-400'}`}>{k === 'all' ? items.length : counts[k]}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {progressShown && (
                <div className="mb-1 px-3 py-2.5 rounded-2xl bg-sky-50/80 dark:bg-sky-900/20">
                    <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-bold text-sky-900 dark:text-sky-100">
                            {t('desk.call.progressTitle').replace('{day}', dayLabel(progress!.day)).replace('{n}', String(progress!.total))}
                        </span>
                        <span className="shrink-0 text-xs font-black tabular-nums text-sky-800 dark:text-sky-200">{progress!.confirmed}/{progress!.total}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-sky-100 dark:bg-sky-900/50 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress!.total} aria-valuenow={progress!.confirmed}>
                        <div className={`h-full rounded-full transition-[width] duration-500 ${progress!.confirmed >= progress!.total ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className={`mt-1 text-[11px] font-semibold ${progress!.confirmed >= progress!.total ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-800/80 dark:text-sky-200/80'}`}>
                        {progress!.confirmed >= progress!.total
                            ? t('desk.call.progressDone')
                            : t('desk.call.progressLeft').replace('{n}', String(progress!.total - progress!.confirmed))}
                    </p>
                </div>
            )}

            {items.length === 0 ? <Empty text={t('desk.callsEmpty')} /> : (
                <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    <AnimatePresence initial={false}>
                        {visible.map((c, i) => {
                            const open = openKey === c.key;
                            const busy = busyKey === c.key;
                            const { main, rest } = buttons(c);
                            const canOpenCard = c.kind === 'lead' ? !!onOpenLeads : !!c.patientId && !!onPatientClick;
                            return (
                                <motion.li
                                    key={c.key}
                                    layout="position"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    {i === retryFrom && (
                                        <p className="flex items-center gap-1.5 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                            <PhoneMissed className="w-3 h-3" /> {t('desk.call.retryTitle')}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 py-2.5">
                                        <button
                                            type="button"
                                            onClick={() => toggle(c.key)}
                                            aria-expanded={open}
                                            aria-controls={`call-${c.key}`}
                                            className="min-w-0 flex-1 flex items-center gap-2 text-left rounded-xl -mx-1.5 px-1.5 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md ${KIND_CHIP[c.kind]}`}>{kindLabel(c.kind)}</span>
                                                    <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">{c.name}</span>
                                                </span>
                                                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 min-w-0">
                                                    <span className={`max-w-full truncate text-[11px] ${c.kind === 'recall' && c.overdue ? 'text-red-500' : 'text-gray-400'}`}>{detail(c)}</span>
                                                    {c.firstVisit && (
                                                        <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{t('desk.call.firstVisit')}</span>
                                                    )}
                                                    {c.missedBefore && (
                                                        <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{t('desk.call.missedBefore')}</span>
                                                    )}
                                                </span>
                                                {c.attempts > 0 && (
                                                    <span className="flex items-center gap-1 mt-0.5 min-w-0 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                                        <PhoneMissed className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">
                                                            {t('desk.call.attempts').replace('{n}', String(c.attempts)).replace('{time}', hm(c.lastAttemptAt))}
                                                            {c.lastAttemptBy ? ` · ${c.lastAttemptBy}` : ''}
                                                        </span>
                                                    </span>
                                                )}
                                            </span>
                                            <ChevronDown className={`w-4 h-4 shrink-0 text-gray-300 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                                        </button>
                                        {showPhone && <TelButton phone={c.phone} label={t('desk.call')} onClick={() => { setOpenKey(c.key); setAskCancel(null); }} />}
                                    </div>

                                    {open && (
                                        <div id={`call-${c.key}`} className="pb-3 space-y-2">
                                            {(showPhone && (c.phone || c.secondaryPhone)) || canOpenCard ? (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                    {showPhone && c.phone && (
                                                        <a href={telHref(c.phone)} className="font-bold tabular-nums text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">{c.phone}</a>
                                                    )}
                                                    {showPhone && c.secondaryPhone && (
                                                        <a href={telHref(c.secondaryPhone)} className="tabular-nums text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">
                                                            {t('desk.call.secondPhone')}: {c.secondaryPhone}
                                                        </a>
                                                    )}
                                                    {canOpenCard && (
                                                        <button
                                                            type="button"
                                                            onClick={() => (c.kind === 'lead' ? onOpenLeads!() : onPatientClick!(c.patientId!))}
                                                            className="ml-auto flex items-center gap-0.5 font-bold text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                                                        >
                                                            {c.kind === 'lead' ? t('desk.call.openLeads') : t('desk.openCard')} <ArrowUpRight className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : null}

                                            {askCancel === c.key ? (
                                                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                                                    <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-2">{t('desk.call.cancelAsk')}</p>
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        <button type="button" onClick={() => run(c, actions.cancel)} disabled={busy}
                                                            className="h-9 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold">
                                                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t('desk.call.cancelYes')}
                                                        </button>
                                                        <button type="button" onClick={() => setAskCancel(null)} disabled={busy}
                                                            className="h-9 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-white dark:hover:bg-gray-700/50">
                                                            {t('desk.call.cancelNo')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {main && (
                                                        <button type="button" onClick={main.onClick} disabled={busy}
                                                            className={`w-full h-10 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${MAIN_TONE[main.tone]}`}>
                                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <main.icon className="w-4 h-4" />} {main.label}
                                                        </button>
                                                    )}
                                                    {rest.length > 0 && (
                                                        <div className={`grid gap-1.5 ${rest.length >= 3 ? 'grid-cols-3' : rest.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                            {rest.map(b => (
                                                                <button key={b.label} type="button" onClick={b.onClick} disabled={busy}
                                                                    className={`min-w-0 h-9 px-1.5 flex items-center justify-center gap-1 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-60 ${REST_TONE[b.tone === 'danger' ? 'danger' : 'neutral']}`}>
                                                                    <b.icon className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate">{b.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            )}

            {summaryParts.length > 0 && (
                <p className="mt-2 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-bold text-gray-600 dark:text-gray-300">{t('desk.call.summaryToday')}:</span> {summaryParts.join(' · ')}
                </p>
            )}

            <AnimatePresence>
                {done && (
                    <motion.div
                        key={done.id}
                        role="status"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.18 }}
                        className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-xs"
                    >
                        {done.tone === 'danger'
                            ? <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                            : done.tone === 'missed'
                                ? <PhoneMissed className="w-4 h-4 shrink-0 text-amber-300" />
                                : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
                        <span className="flex-1 min-w-0 truncate">{done.text}</span>
                        {done.undo && (
                            <button type="button" onClick={undo} className="shrink-0 flex items-center gap-1 font-bold text-sky-300 hover:text-sky-200">
                                <Undo2 className="w-3.5 h-3.5" /> {t('desk.call.undo')}
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </Shell>
    );
};
