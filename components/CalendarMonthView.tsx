import React from 'react';
import { Appointment, Doctor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { weekdayShort } from './DateField';
import { formatDateToISO } from '../utils/dateUtils';

/**
 * Kalendarning "Oy" ko'rinishi (Google Calendar'dagidek): butun oy bir ekranda,
 * har kunda birinchi qabullar va "+N yana". Kun raqami yoki "+N" bosilsa —
 * o'sha kunning soatli ko'rinishi ochiladi; bo'sh joy bosilsa — yangi qabul.
 */

const VISIBLE = 3;

interface CalendarMonthViewProps {
    /** Ko'rsatiladigan oyning istalgan kuni */
    month: Date;
    appointments: Appointment[];
    doctors: Doctor[];
    /** Hamkasb qabuli (ko'rish doirasi "faqat o'zinikini") — bemor ismi o'rniga "Band", bosilsa kun ochiladi */
    isPrivate?: (appt: Appointment) => boolean;
    onOpenDay: (key: string) => void;
    onOpenAppointment: (appt: Appointment) => void;
    /** Bo'sh joy bosilganda yangi qabul (ruxsat bo'lmasa berilmaydi) */
    onCreate?: (key: string) => void;
}

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({ month, appointments, doctors, isPrivate, onOpenDay, onOpenAppointment, onCreate }) => {
    const { t, language } = useLanguage();
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Hafta dushanbadan boshlanadi; oy qancha hafta egallasa, shuncha qator (4–6)
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
    const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const todayKey = formatDateToISO(new Date());

    const byDay = React.useMemo(() => {
        const map: Record<string, Appointment[]> = {};
        appointments.forEach(a => {
            if (a.status === 'Cancelled') return;
            (map[a.date] = map[a.date] || []).push(a);
        });
        Object.values(map).forEach(list => list.sort((a, b) => a.time.localeCompare(b.time)));
        return map;
    }, [appointments]);

    const colorOf = (a: Appointment) => doctors.find(d => d.id === a.doctorId)?.color || '#3B82F6';

    return (
        <div className="h-full min-w-[700px] flex flex-col">
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                {days.slice(0, 7).map(d => (
                    <div key={d.getDay()} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {weekdayShort(d, language)}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${weeks}, minmax(112px, 1fr))` }}>
                {days.map(d => {
                    const key = formatDateToISO(d);
                    const inMonth = d.getMonth() === month.getMonth();
                    const isToday = key === todayKey;
                    const list = byDay[key] || [];
                    const hidden = list.length - VISIBLE;
                    return (
                        <div
                            key={key}
                            onClick={() => onCreate?.(key)}
                            className={`border-r border-b border-gray-100 dark:border-gray-700 p-1.5 flex flex-col gap-0.5 min-w-0 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-gray-50/70 dark:bg-gray-900/40'} ${onCreate ? 'cursor-pointer hover:bg-primary-50/30 dark:hover:bg-primary-900/10' : ''}`}
                        >
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); onOpenDay(key); }}
                                title={t('calendar.openDay')}
                                className={`self-start min-w-[1.75rem] h-7 px-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${isToday
                                    ? 'bg-primary-600 text-white'
                                    : inMonth
                                        ? 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                                        : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-700'}`}
                            >
                                {d.getDate()}
                            </button>
                            {list.slice(0, VISIBLE).map(a => {
                                const busy = !!isPrivate?.(a);
                                const faded = !busy && a.status === 'No-Show';
                                const label = busy ? t('calendar.busy') : a.patientName;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={e => { e.stopPropagation(); if (busy) onOpenDay(key); else onOpenAppointment(a); }}
                                        title={`${a.time} · ${label} · ${a.doctorName}`}
                                        className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-gray-100 dark:hover:bg-gray-700 ${faded ? 'opacity-50 line-through' : ''}`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorOf(a) }} />
                                        <span className="tabular-nums text-gray-500 dark:text-gray-400 shrink-0">{a.time}</span>
                                        <span className={`truncate ${busy ? 'italic text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'} ${!busy && a.status === 'Completed' ? 'opacity-60' : ''}`}>{label}</span>
                                    </button>
                                );
                            })}
                            {hidden > 0 && (
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onOpenDay(key); }}
                                    className="self-start rounded px-1 text-[11px] font-semibold text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                                >
                                    +{hidden} {t('calendar.moreAppts')}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
