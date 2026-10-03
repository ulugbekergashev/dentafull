import React from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { Appointment, Doctor, FlowLog } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { hasArrived, isOpenAppointment, minutesOf } from '../utils/queue';

interface ColleaguesCardProps {
    /** Shu shifokor (o'zi ro'yxatda chiqmaydi) */
    selfId: string;
    doctors: Doctor[];
    appointments: Appointment[];
    /** Kim kabinetda — bosh sahifa xaritasi bilan bir xil manba */
    flowLog: FlowLog;
    today: string;
    nowMin: number;
    /** "Yo'naltirish" — bemorni shu hamkasbga yozish. Qabul yozish ruxsati bo'lmasa berilmaydi */
    onRefer?: (doctor: Doctor) => void;
    /** "Batafsil" — hamkasbning kalendarini ochish. Kalendar bo'limi yopiq bo'lsa berilmaydi */
    onOpenCalendar?: (doctor: Doctor) => void;
}

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time);

/**
 * "Hamkasblar hozir" — shifokor boshqa shifokorlar band yoki bo'shligini ko'radi
 * (masalan, ortodont bemorni xirurgga yuborishdan oldin). Bemorlarning ismi
 * ko'rsatilmaydi: faqat band/bo'sh, navbat va keyingi qabul vaqti.
 */
export const ColleaguesCard: React.FC<ColleaguesCardProps> = ({ selfId, doctors, appointments, flowLog, today, nowMin, onRefer, onOpenCalendar }) => {
    const { t } = useLanguage();
    const others = doctors.filter(d => d.id !== selfId);
    if (others.length === 0) return null;

    const rows = others.map(d => {
        const open = appointments.filter(a => a.date === today && a.doctorId === d.id && isOpenAppointment(a));
        const seated = open.filter(a => !!flowLog[a.id]).sort((a, b) => Date.parse(flowLog[b.id].in) - Date.parse(flowLog[a.id].in));
        const chair = seated[0];
        const waiting = open.filter(a => !flowLog[a.id] && hasArrived(a, nowMin)).length;
        const next = open.filter(a => !flowLog[a.id] && !hasArrived(a, nowMin)).sort(byTime)[0];
        const dayCount = appointments.filter(a => a.date === today && a.doctorId === d.id && a.status !== 'Cancelled').length;
        const off = !chair && (d.status === 'On Leave' || dayCount === 0);
        const busyMin = chair ? Math.max(0, Math.floor((Date.now() - Date.parse(flowLog[chair.id].in)) / 60000)) : 0;
        const line = [
            waiting > 0 ? t('colleagues.waiting').replace('{n}', String(waiting)) : null,
            next ? t('colleagues.next').replace('{time}', next.time) : (!off && waiting === 0 ? t('colleagues.noNext') : null),
        ].filter(Boolean).join(' · ');
        return { d, chair: !!chair, off, busyMin, line };
    });

    return (
        <section aria-labelledby="colleagues-title" className="p-5 sm:p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="colleagues-title" className="text-lg font-black text-gray-900 dark:text-white">{t('colleagues.title')}</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('colleagues.subtitle')}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {rows.map(({ d, chair, off, busyMin, line }) => (
                    <div key={d.id} className="flex items-start gap-3 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color || '#2563EB' }} />
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                                Dr. {d.lastName}
                                {d.specialty && <span className="font-semibold text-gray-400"> · {d.specialty}</span>}
                            </p>
                            <span className={`mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${chair
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : off
                                    ? 'bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                <span aria-hidden="true" className={`w-2 h-2 rounded-full ${chair ? 'bg-blue-600' : off ? 'bg-gray-300 dark:bg-gray-500' : 'bg-emerald-500'}`} />
                                {chair ? t('colleagues.inChair').replace('{m}', String(busyMin)) : off ? t('colleagues.off') : t('colleagues.free')}
                            </span>
                            {line && <p className="mt-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{line}</p>}
                        </div>
                        {(onRefer || onOpenCalendar) && (
                            <div className="shrink-0 flex flex-col items-stretch gap-1.5">
                                {onRefer && (
                                    <button
                                        type="button"
                                        onClick={() => onRefer(d)}
                                        title={t('colleagues.referHint').replace('{doctor}', `Dr. ${d.lastName}`)}
                                        className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 text-xs font-bold hover:bg-primary-50 dark:hover:bg-primary-900/20"
                                    >
                                        {t('colleagues.refer')} <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {onOpenCalendar && (
                                    <button
                                        type="button"
                                        onClick={() => onOpenCalendar(d)}
                                        title={t('colleagues.calendarHint').replace('{doctor}', `Dr. ${d.lastName}`)}
                                        className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        <CalendarDays className="w-3.5 h-3.5" /> {t('colleagues.calendar')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
};
