import React, { useState } from 'react';
import { Wallet, FlaskConical, PhoneCall, Phone, ChevronRight, CheckCircle2, XCircle, ArrowUpRight } from 'lucide-react';
import { LabOrder, Patient } from '../types';
import { Card } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { UnpaidRow } from '../utils/unpaid';
import { CallItem, InstallmentDue, LabSummary } from '../utils/desk';

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

const TelButton: React.FC<{ phone?: string; label: string }> = ({ phone, label }) => phone ? (
    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} title={phone} aria-label={`${label}: ${phone}`}
        className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-[11px] font-bold transition-colors">
        <Phone className="w-3.5 h-3.5" /> {label}
    </a>
) : null;

// ── Pul ──────────────────────────────────────────────────────────────────────

interface DeskMoneyCardProps {
    /** Kassada kutilayotgan (qabul tugagan, pul olinmagan) */
    awaiting: UnpaidRow[];
    debts: UnpaidRow[];
    installments: InstallmentDue[];
    today: string;
    showAmounts: boolean;
    /** Dashboard'dagi mavjud qator: "To'lovni olish" va "Bepul" tugmalari bilan */
    renderRow: (row: UnpaidRow) => React.ReactNode;
    onPatientClick?: (id: string) => void;
    onSeeAll?: () => void;
}

export const DeskMoneyCard: React.FC<DeskMoneyCardProps> = ({ awaiting, debts, installments, today, showAmounts, renderRow, onPatientClick, onSeeAll }) => {
    const { t } = useLanguage();
    // Shifokor kassaga yuborgan bemor hozir kassa oldida turibdi — birinchi
    const atDesk = (r: UnpaidRow) => (r.source === 'appointment' && r.sentToCashier ? 1 : 0);
    const sortedAwaiting = [...awaiting].sort((a, b) => atDesk(b) - atDesk(a) || b.date.localeCompare(a.date));
    const total = [...awaiting, ...debts].reduce((s, r) => s + (r.amount || 0), 0)
        + installments.reduce((s, d) => s + d.amount, 0);
    const count = awaiting.length + debts.length + installments.length;
    const hidden = Math.max(0, awaiting.length - SECTION_LIMIT) + Math.max(0, debts.length - SECTION_LIMIT) + Math.max(0, installments.length - SECTION_LIMIT);

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
                <>
                    {sortedAwaiting.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.moneyAwaiting')} count={awaiting.length} tone="text-amber-600 dark:text-amber-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">{sortedAwaiting.slice(0, SECTION_LIMIT).map(renderRow)}</div>
                        </>
                    )}
                    {debts.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.moneyDebts')} count={debts.length} tone="text-red-600 dark:text-red-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">{debts.slice(0, SECTION_LIMIT).map(renderRow)}</div>
                        </>
                    )}
                    {installments.length > 0 && (
                        <>
                            <SectionTitle text={t('desk.moneyInstallments')} count={installments.length} tone="text-violet-600 dark:text-violet-400" />
                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {installments.slice(0, SECTION_LIMIT).map(d => (
                                    <div key={d.key} className="flex items-center gap-3 py-3">
                                        <div className="min-w-0 flex-1">
                                            <button type="button" onClick={() => onPatientClick?.(d.patientId)} disabled={!onPatientClick}
                                                className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left">
                                                {d.patientName || '—'}
                                            </button>
                                            <p className="text-[11px] text-gray-400 truncate">
                                                <span className={d.overdue ? 'text-red-500 font-semibold' : d.expectedDate === today ? 'text-amber-600 font-semibold' : ''}>
                                                    {d.overdue ? t('desk.overdueSince').replace('{date}', ddmm(d.expectedDate)) : d.expectedDate === today ? t('desk.dueToday') : t('desk.dueOn').replace('{date}', ddmm(d.expectedDate))}
                                                </span>
                                                {d.service ? ` · ${d.service}` : ''}
                                            </p>
                                        </div>
                                        {showAmounts && <span className="text-sm font-bold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{d.amount.toLocaleString()}</span>}
                                        {onPatientClick && (
                                            <button type="button" onClick={() => onPatientClick(d.patientId)} aria-label={t('desk.openCard')} title={t('desk.openCard')}
                                                className="shrink-0 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary-600 hover:border-primary-400">
                                                <ArrowUpRight className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
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

const KIND_CHIP: Record<CallItem['kind'], string> = {
    noshow: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    lead: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    confirm: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    recall: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    birthday: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
};
const CALLS_LIMIT = 6;

interface DeskCallsCardProps {
    items: CallItem[];
    showPhone: boolean;
    onPatientClick?: (id: string) => void;
    onOpenLeads?: () => void;
    onDismissRecall?: (id: string) => void;
}

export const DeskCallsCard: React.FC<DeskCallsCardProps> = ({ items, showPhone, onPatientClick, onOpenLeads, onDismissRecall }) => {
    const { t } = useLanguage();
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? items : items.slice(0, CALLS_LIMIT);

    const detail = (c: CallItem): string => {
        switch (c.kind) {
            case 'noshow': return t('desk.call.noshowDetail').replace('{time}', c.time || '').replace('{doctor}', c.doctorName || '');
            case 'lead': return c.note || t('desk.call.leadDetail');
            case 'confirm': return t('desk.call.confirmDetail').replace('{time}', c.time || '').replace('{doctor}', c.doctorName || '');
            case 'recall': return [c.overdue ? t('desk.overdueSince').replace('{date}', ddmm(c.date || '')) : t('desk.dueOn').replace('{date}', ddmm(c.date || '')), c.note].filter(Boolean).join(' · ');
            case 'birthday': return c.age ? t('desk.call.birthdayAge').replace('{n}', String(c.age)) : t('desk.call.birthdayDetail');
        }
    };
    const open = (c: CallItem) => {
        if (c.kind === 'lead') onOpenLeads?.();
        else if (c.patientId) onPatientClick?.(c.patientId);
    };

    return (
        <Shell
            icon={PhoneCall}
            tone="bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
            title={t('desk.callsTitle')}
            badge={items.length > 0 ? (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-black">{items.length}</span>
            ) : undefined}
            footer={items.length > CALLS_LIMIT ? (
                <MoreLink
                    text={showAll ? t('desk.showLess') : t('desk.moreAll').replace('{n}', String(items.length - CALLS_LIMIT))}
                    onClick={() => setShowAll(v => !v)}
                />
            ) : undefined}
        >
            {items.length === 0 ? <Empty text={t('desk.callsEmpty')} /> : (
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {visible.map(c => (
                        <div key={c.key} className="flex items-center gap-2.5 py-2.5">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md ${KIND_CHIP[c.kind]}`}>{t(`desk.call.${c.kind}` as any)}</span>
                                    <button type="button" onClick={() => open(c)}
                                        disabled={c.kind === 'lead' ? !onOpenLeads : !c.patientId || !onPatientClick}
                                        className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left">
                                        {c.name}
                                    </button>
                                </div>
                                <p className={`text-[11px] truncate mt-0.5 ${c.kind === 'recall' && c.overdue ? 'text-red-500' : 'text-gray-400'}`}>{detail(c)}</p>
                            </div>
                            {showPhone && <TelButton phone={c.phone} label={t('desk.call')} />}
                            {c.recallId && onDismissRecall && (
                                <button type="button" onClick={() => onDismissRecall(c.recallId!)} title={t('desk.call.dismiss')} aria-label={t('desk.call.dismiss')}
                                    className="shrink-0 p-1 text-gray-300 hover:text-red-500">
                                    <XCircle className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Shell>
    );
};
