import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Appointment, Patient } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO, calcAge } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';
import { doctorDone, doctorLater, doctorQueue, healthAlert, minutesOf, nowHHMM, waitMinutes, waitTone } from '../utils/queue';

interface DoctorQueueCardProps {
    doctorId: string;
    appointments: Appointment[];
    patients: Patient[];
    showPhone?: boolean;
    /** Bemor kartasini ochish — bemorlar bo'limi yopiq bo'lsa berilmaydi */
    onPatientClick?: (id: string) => void;
}

const WAIT_CHIP: Record<'normal' | 'warn' | 'late', string> = {
    normal: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    late: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

/**
 * "Mening navbatim" — shifokorning bosh sahifasi. Vaqti kelgan bugungi qabullar
 * navbat tartibida; birinchisi katta, "Kirish" bemor kartasini ochadi. Qabul
 * kartada yakunlanganda bemor navbatdan chiqadi.
 */
export const DoctorQueueCard: React.FC<DoctorQueueCardProps> = ({ doctorId, appointments, patients, showPhone = true, onPatientClick }) => {
    const { t } = useLanguage();
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(x => x + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const today = formatDateToISO(new Date());
    const nowMin = minutesOf(nowHHMM());
    const byId = useMemo(() => new Map(patients.map(p => [p.id, p])), [patients]);

    const queue = doctorQueue(appointments, doctorId, today, nowMin);
    const later = doctorLater(appointments, doctorId, today, nowMin);
    const done = doctorDone(appointments, doctorId, today);

    const waitText = (a: Appointment) => {
        const m = waitMinutes(a, nowMin);
        return m <= 0 ? t('myQueue.justNow') : t('myQueue.waitingMin').replace('{m}', String(m));
    };
    const serviceOf = (a: Appointment) => a.type || t('myQueue.consultation');
    // Ro'yxatda bo'lmagan bemorni (boshqa shifokorga biriktirilgan) App ochishdan oldin yuklaydi
    const canOpen = (a: Appointment) => !!onPatientClick && !!a.patientId;

    const [first, ...rest] = queue;
    const firstPatient = first ? byId.get(first.patientId) : undefined;
    const firstAlert = healthAlert(firstPatient?.medicalHistory);
    const firstAge = calcAge(firstPatient?.dob);
    const firstSub = first ? [
        firstAge !== null && firstAge >= 0 ? t('myQueue.age').replace('{n}', String(firstAge)) : null,
        firstPatient?.phone ? (showPhone ? firstPatient.phone : maskPhone(firstPatient.phone)) : null,
        t('myQueue.bookedAt').replace('{time}', first.time),
    ].filter(Boolean).join(' · ') : '';

    return (
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 xl:gap-7 p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-primary-100 dark:border-primary-900/40 shadow-sm">
            <div className="flex flex-col gap-4 min-w-0">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">
                            {t('myQueue.titleA')} <span className="text-primary">{t('myQueue.titleB')}</span>
                        </h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('myQueue.subtitle')}</p>
                    </div>
                    <span className="flex items-baseline gap-2 shrink-0">
                        <span className="text-4xl sm:text-5xl font-black leading-none text-primary">{queue.length}</span>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{t('myQueue.waitingPeople')}</span>
                    </span>
                </div>

                {first ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 p-5 rounded-3xl bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-600">
                        <span className="hidden sm:flex shrink-0 flex-col items-center justify-center w-[72px] h-[72px] rounded-[20px] bg-primary text-white">
                            <span className="text-[10px] font-bold tracking-widest opacity-80">{t('myQueue.badge')}</span>
                            <span className="text-3xl font-black leading-none">1</span>
                        </span>
                        <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <span className="text-2xl font-extrabold text-gray-900 dark:text-white truncate">{first.patientName}</span>
                            <span className="text-sm text-primary-800 dark:text-primary-300">{firstSub}</span>
                            <span className="flex gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">{serviceOf(first)}</span>
                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${WAIT_CHIP[waitTone(waitMinutes(first, nowMin))]}`}>{waitText(first)}</span>
                                {firstAlert && (
                                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 max-w-full truncate" title={firstAlert}>{firstAlert}</span>
                                )}
                            </span>
                        </span>
                        {canOpen(first) && (
                            <button
                                type="button"
                                onClick={() => onPatientClick!(first.patientId)}
                                className="shrink-0 flex items-center justify-center gap-2 h-14 px-7 rounded-2xl bg-primary hover:bg-primary-700 text-white text-[17px] font-extrabold shadow-lg shadow-primary-500/30 active:scale-95 transition-all"
                            >
                                {t('myQueue.enter')}
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="p-6 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-[15px] text-gray-600 dark:text-gray-300">
                        {t('myQueue.empty')}
                    </div>
                )}

                {rest.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700">
                        <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 text-[15px] font-black text-gray-700 dark:text-gray-200">{i + 2}</span>
                        <span className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-bold text-gray-900 dark:text-white">{a.patientName}</span>
                            <span className="text-[13px] text-gray-500 dark:text-gray-400">{serviceOf(a)}</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${WAIT_CHIP[waitTone(waitMinutes(a, nowMin))]}`}>{waitText(a)}</span>
                            {(() => {
                                const alert = healthAlert(byId.get(a.patientId)?.medicalHistory);
                                return alert ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 max-w-[220px] truncate" title={alert}>{alert}</span> : null;
                            })()}
                        </span>
                        {canOpen(a) && (
                            <button
                                type="button"
                                onClick={() => onPatientClick!(a.patientId)}
                                aria-label={`${t('myQueue.enter')}: ${a.patientName}`}
                                className="shrink-0 h-[38px] px-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 text-[13px] font-bold hover:bg-primary-50 dark:hover:bg-primary-900/20"
                            >
                                {t('myQueue.enter')}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2.5 xl:pl-7 xl:border-l border-gray-100 dark:border-gray-700 min-w-0">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myQueue.later')}</span>
                {later.length === 0 ? (
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('myQueue.noLater')}</p>
                ) : later.map(a => (
                    <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-700/50">
                        <span className="w-12 shrink-0 text-sm font-black text-gray-900 dark:text-white">{a.time}</span>
                        <span className="min-w-0 flex flex-col">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{a.patientName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{serviceOf(a)}</span>
                        </span>
                    </div>
                ))}
                <span className="mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myQueue.done')}</span>
                {done.length === 0 ? (
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('myQueue.noDone')}</p>
                ) : done.map(a => (
                    <div key={a.id} className="flex items-center gap-3 py-1.5">
                        <span className="w-12 shrink-0 text-sm font-bold text-gray-500 dark:text-gray-400">{a.time}</span>
                        <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">{a.patientName}</span>
                        <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">{t('myQueue.completed')}</span>
                    </div>
                ))}
            </div>
        </section>
    );
};
