import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Appointment, Doctor } from '../types';
import { Card } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';
import { doctorDone, doctorQueue, isOpenAppointment, minutesOf, nowHHMM, waitMinutes, waitTone } from '../utils/queue';

interface DeskTodayProps {
    appointments: Appointment[];
    doctors: Doctor[];
    onPatientClick?: (id: string) => void;
    /** "Keldi" — keyinroqqa yozilgan bemor erta keldi, qabuli hozirga ko'chadi. Ruxsat bo'lmasa berilmaydi */
    onArrived?: (appointment: Appointment) => Promise<void>;
    onOpenBooking?: () => void;
    onSeeAll?: () => void;
}

const LATER_LIMIT = 5;
// Shifokor qatorida ko'rinadigan "qabul qilindi" bemorlar; eskilari "+N" ortida (bosilsa ochiladi)
const DONE_VISIBLE = 3;
const WAIT_CHIP: Record<'normal' | 'warn' | 'late', string> = {
    normal: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    late: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
const initialsOf = (name: string) => name.replace(/^Dr\.\s*/, '').split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase();

/**
 * Bosh sahifaning tepasi — klinikada hozir nima bo'layapti: har bir shifokorning
 * navbati (kim, qancha kutyapti) va bugun keyinroq kimlar keladi.
 * Navbat — vaqti kelgan, yakunlanmagan bugungi qabullar (utils/queue).
 * Qabul qilingan bemor qatordan g'oyib bo'lmaydi — holati "qabul qilindi" ga o'zgaradi.
 */
export const DeskToday: React.FC<DeskTodayProps> = ({ appointments, doctors, onPatientClick, onArrived, onOpenBooking, onSeeAll }) => {
    const { t } = useLanguage();
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(x => x + 1), 30000);
        return () => clearInterval(id);
    }, []);
    const [arriving, setArriving] = useState<string | null>(null);

    const today = formatDateToISO(new Date());
    const nowStr = nowHHMM();
    const nowMin = minutesOf(nowStr);

    const rows = doctors
        .filter(d => d.status !== 'On Leave')
        .map(d => ({ doctor: d, queue: doctorQueue(appointments, d.id, today, nowMin), done: doctorDone(appointments, d.id, today) }));
    // Bugun kimnidir kutayotgan yoki qabul qilgan shifokor — o'z qatori bilan
    const active = rows.filter(r => r.queue.length > 0 || r.done.length > 0);
    // Bugun hali hech kim kelmagan shifokorlar — pastda "Bo'sh" qatorida
    const idle = rows.filter(r => r.queue.length === 0 && r.done.length === 0);
    const queueTotal = rows.reduce((s, r) => s + r.queue.length, 0);
    const [openDone, setOpenDone] = useState<Record<string, boolean>>({});

    const todays = appointments.filter(a => a.date === today && a.status !== 'Cancelled');
    const later = todays
        .filter(a => isOpenAppointment(a) && minutesOf(a.time) > nowMin)
        .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
    const doneCount = todays.filter(a => a.status === 'Completed').length;

    const arrive = async (a: Appointment) => {
        if (!onArrived || arriving) return;
        setArriving(a.id);
        try {
            await onArrived(a);
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi
        } finally {
            setArriving(null);
        }
    };

    return (
        <Card className="rounded-[2rem] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <section className="p-5 sm:p-6 lg:border-r border-gray-100 dark:border-gray-700/70 min-w-0" aria-labelledby="desk-queue-title">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 id="desk-queue-title" className="text-lg font-black text-gray-900 dark:text-white">
                            {t('desk.queueTitle')}
                            <span className={`ml-2 text-sm font-black ${queueTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>{queueTotal}</span>
                        </h2>
                        <span className="text-xs font-semibold text-gray-400 tabular-nums">{t('desk.now').replace('{time}', nowStr)}</span>
                    </div>

                    {rows.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('desk.noDoctors')}</p>
                    ) : (
                        <>
                            {active.map(({ doctor, queue, done }) => {
                                const hiddenDone = openDone[doctor.id] ? 0 : Math.max(0, done.length - DONE_VISIBLE);
                                return (
                                <div key={doctor.id} className="flex items-start gap-3 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
                                    <span className="w-8 h-8 mt-0.5 shrink-0 rounded-full text-white text-[11px] font-black flex items-center justify-center" style={{ backgroundColor: doctor.color || '#2563EB' }}>
                                        {initialsOf(`${doctor.lastName} ${doctor.firstName}`)}
                                    </span>
                                    <span className="w-32 shrink-0 min-w-0 pt-1.5">
                                        <span className="block text-sm font-bold text-gray-900 dark:text-white truncate">Dr. {doctor.lastName}</span>
                                    </span>
                                    <span className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                                        {hiddenDone > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setOpenDone(s => ({ ...s, [doctor.id]: true }))}
                                                title={t('desk.doneMore').replace('{n}', String(hiddenDone))}
                                                aria-label={t('desk.doneMore').replace('{n}', String(hiddenDone))}
                                                className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/10 hover:border-emerald-400 text-emerald-700 dark:text-emerald-300 text-[12px] font-bold tabular-nums transition-colors"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" /> +{hiddenDone}
                                            </button>
                                        )}
                                        {done.slice(hiddenDone).map(a => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => onPatientClick?.(a.patientId)}
                                                disabled={!onPatientClick}
                                                title={a.type || undefined}
                                                aria-label={`${a.patientName}: ${t('desk.chipDone')}`}
                                                className="flex items-center gap-1.5 h-8 pl-2 pr-2 sm:pr-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/10 hover:border-emerald-400 disabled:hover:border-emerald-200 transition-colors max-w-full"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-[13px] font-semibold text-gray-600 dark:text-gray-300 truncate">{a.patientName}</span>
                                                {/* Tor ekranda faqat belgi — ismga joy qolsin */}
                                                <span className="hidden sm:inline shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{t('desk.chipDone')}</span>
                                            </button>
                                        ))}
                                        {queue.map((a, i) => {
                                            const wait = waitMinutes(a, nowMin);
                                            return (
                                                <button
                                                    key={a.id}
                                                    type="button"
                                                    onClick={() => onPatientClick?.(a.patientId)}
                                                    disabled={!onPatientClick}
                                                    title={a.type || undefined}
                                                    className="flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:border-primary-400 disabled:hover:border-gray-200 transition-colors max-w-full"
                                                >
                                                    <span className="text-[11px] font-black text-gray-400 tabular-nums">{i + 1}</span>
                                                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{a.patientName}</span>
                                                    <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${WAIT_CHIP[waitTone(wait)]}`}>
                                                        {wait <= 0 ? t('desk.justCame') : t('desk.waitMin').replace('{m}', String(wait))}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        {queue.length === 0 && (
                                            <span className="flex items-center h-8 px-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t('desk.doctorFree')}</span>
                                        )}
                                    </span>
                                </div>
                                );
                            })}
                            {active.length === 0 && (
                                <p className="py-2.5 border-t border-gray-100 dark:border-gray-700/60 text-sm text-gray-500 dark:text-gray-400">{t('desk.queueEmpty')}</p>
                            )}
                            {idle.length > 0 && (
                                <p className="pt-2.5 border-t border-gray-100 dark:border-gray-700/60 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {t('desk.freeDoctors')}: {idle.map(r => `Dr. ${r.doctor.lastName}`).join(', ')}
                                </p>
                            )}
                        </>
                    )}
                </section>

                <section className="p-5 sm:p-6 border-t lg:border-t-0 border-gray-100 dark:border-gray-700/70 min-w-0" aria-labelledby="desk-later-title">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 id="desk-later-title" className="text-lg font-black text-gray-900 dark:text-white">
                            {t('desk.laterTitle')}
                            <span className="ml-2 text-sm font-black text-gray-400">{later.length}</span>
                        </h2>
                        {doneCount > 0 && (
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t('desk.doneCount').replace('{n}', String(doneCount))}</span>
                        )}
                    </div>

                    {later.length === 0 ? (
                        <div className="py-2.5 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('desk.laterEmpty')}</p>
                            {onOpenBooking && (
                                <button type="button" onClick={onOpenBooking} className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">
                                    <Plus className="w-3.5 h-3.5" /> {t('desk.book')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {later.slice(0, LATER_LIMIT).map(a => (
                                <div key={a.id} className="flex items-center gap-3 py-2 border-t border-gray-100 dark:border-gray-700/60">
                                    <span className="w-12 shrink-0 text-sm font-black text-gray-900 dark:text-white tabular-nums">{a.time}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-1 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => onPatientClick?.(a.patientId)}
                                                disabled={!onPatientClick}
                                                className="block min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left"
                                            >
                                                {a.patientName}
                                            </button>
                                            {/* Qo'ng'iroqda yoki botda tasdiqlangan */}
                                            {a.status === 'Confirmed' && (
                                                <span title={t('desk.confirmed')} aria-label={t('desk.confirmed')} className="shrink-0 text-emerald-500">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{[a.doctorName, a.type].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    {onArrived && (
                                        <button
                                            type="button"
                                            onClick={() => arrive(a)}
                                            disabled={!!arriving}
                                            title={t('desk.arrivedHint')}
                                            className="shrink-0 flex items-center gap-1 h-8 px-3 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 text-xs font-bold hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50"
                                        >
                                            {arriving === a.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            {t('desk.arrived')}
                                        </button>
                                    )}
                                </div>
                            ))}
                            {later.length > LATER_LIMIT && onSeeAll && (
                                <button type="button" onClick={onSeeAll} className="w-full pt-2.5 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600">
                                    {t('desk.moreLater').replace('{n}', String(later.length - LATER_LIMIT))} <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </section>
            </div>
        </Card>
    );
};
