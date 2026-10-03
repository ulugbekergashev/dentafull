import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Doctor } from '../types';
import { MonthGrid } from './DateField';
import { statusLabel } from './Common';
import { useLanguage } from '../context/LanguageContext';

interface CalendarSidebarProps {
    /** Tanlangan kun (YYYY-MM-DD) — mini kalendar shu oyni ko'rsatadi */
    dateKey: string;
    /** Hafta ko'rinishida — hafta chegaralari (mini kalendarda belgilanadi) */
    rangeFrom?: string;
    rangeTo?: string;
    /** Kunlar bo'yicha qabullar soni (mini kalendarda raqam) */
    dayCounts: Record<string, number>;
    onPickDate: (key: string) => void;
    doctors: Doctor[];
    /** null — barcha shifokorlar */
    selectedDoctorIds: string[] | null;
    /** Ko'rinib turgan davrdagi (kun / hafta / oy) qabullar soni, shifokor bo'yicha */
    doctorCounts: Record<string, number>;
    onShowAll: () => void;
    onToggleDoctor: (id: string) => void;
    /** Hamkasb qabullari "Band" bo'lib ko'rinadi — izohda ham shu namuna bo'lsin */
    showBusy?: boolean;
}

const SAMPLE = '#3B82F6';

/**
 * Kalendar yon paneli (keng ekranda): sanaga tez o'tish uchun oylik kalendar,
 * shifokorlar filtri (qabullar soni bilan) va blok ko'rinishlari izohi.
 */
export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
    dateKey, rangeFrom, rangeTo, dayCounts, onPickDate, doctors, selectedDoctorIds, doctorCounts, onShowAll, onToggleDoctor, showBusy,
}) => {
    const { t, language } = useLanguage();
    const total = doctors.reduce((s, d) => s + (doctorCounts[d.id] || 0), 0);
    const legend: { status: string; style: React.CSSProperties; extra?: React.ReactNode; strike?: boolean }[] = [
        { status: 'Pending', style: { backgroundColor: `${SAMPLE}26`, borderLeft: `3px dashed ${SAMPLE}` } },
        { status: 'Confirmed', style: { backgroundColor: `${SAMPLE}26`, borderLeft: `3px solid ${SAMPLE}` } },
        { status: 'Checked-In', style: { backgroundColor: `${SAMPLE}26`, borderLeft: `3px solid ${SAMPLE}` }, extra: <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> },
        { status: 'Completed', style: { backgroundColor: `${SAMPLE}1A`, borderLeft: `3px solid ${SAMPLE}`, opacity: 0.7 }, extra: <CheckCircle className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> },
        { status: 'No-Show', style: { backgroundColor: 'rgba(156, 163, 175, 0.16)', borderLeft: '3px solid #9CA3AF' }, strike: true },
    ];

    return (
        <aside className="hidden 2xl:flex w-64 shrink-0 flex-col gap-6 border-r border-gray-100 dark:border-gray-700 p-4 overflow-y-auto">
            <MonthGrid value={dateKey} onPick={onPickDate} counts={dayCounts} rangeFrom={rangeFrom} rangeTo={rangeTo} />

            {doctors.length > 1 && (
                <section role="group" aria-label={t('calendar.doctorFilter')} data-tour="cal-doctors">
                    <h3 className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('calendar.sidebar.doctors')}</h3>
                    <button
                        type="button"
                        onClick={onShowAll}
                        aria-pressed={!selectedDoctorIds}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${!selectedDoctorIds
                            ? 'bg-primary-50 text-primary-700 font-semibold dark:bg-primary-900/30 dark:text-primary-200'
                            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/60'}`}
                    >
                        <span className="w-3.5 h-3.5 rounded-full shrink-0 border-2 border-current opacity-70" />
                        <span className="flex-1 text-left truncate">{t('calendar.allDoctors')}</span>
                        <span className="text-xs tabular-nums opacity-70">{total}</span>
                    </button>
                    {doctors.map(doc => {
                        const color = doc.color || SAMPLE;
                        const on = !!selectedDoctorIds?.includes(doc.id);
                        return (
                            <button
                                key={doc.id}
                                type="button"
                                onClick={() => onToggleDoctor(doc.id)}
                                aria-pressed={on}
                                title={doc.specialty}
                                style={on ? { backgroundColor: `${color}1F` } : undefined}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${on
                                    ? 'text-gray-900 font-semibold dark:text-white'
                                    : `text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/60 ${selectedDoctorIds ? 'opacity-60 hover:opacity-100' : ''}`}`}
                            >
                                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="flex-1 min-w-0 text-left">
                                    <span className="block truncate">Dr. {doc.lastName}</span>
                                    {doc.specialty && <span className="block truncate text-[11px] font-normal text-gray-400">{doc.specialty}</span>}
                                </span>
                                <span className="text-xs tabular-nums text-gray-400">{doctorCounts[doc.id] || 0}</span>
                            </button>
                        );
                    })}
                </section>
            )}

            <section>
                <h3 className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('calendar.sidebar.statuses')}</h3>
                <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 px-2">
                    {legend.map(item => (
                        <li key={item.status} className="flex items-center gap-2 min-w-0 text-xs text-gray-600 dark:text-gray-300">
                            <span className="w-6 h-4 rounded-sm shrink-0 flex items-center justify-end pr-0.5" style={item.style}>{item.extra}</span>
                            <span className={`truncate ${item.strike ? 'line-through decoration-gray-400' : ''}`}>{statusLabel(item.status, language)}</span>
                        </li>
                    ))}
                    {showBusy && (
                        <li className="flex items-center gap-2 min-w-0 text-xs text-gray-600 dark:text-gray-300">
                            <span className="w-6 h-4 rounded-sm shrink-0" style={{ backgroundImage: `repeating-linear-gradient(135deg, ${SAMPLE}33 0 4px, transparent 4px 8px)`, borderLeft: `3px solid ${SAMPLE}` }} />
                            <span>{t('calendar.busy')}</span>
                        </li>
                    )}
                </ul>
            </section>
        </aside>
    );
};
