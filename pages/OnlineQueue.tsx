import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Armchair, BellRing, Clock, Megaphone, Plus, Printer, RotateCcw, Tv, UserX, Users, Volume2, VolumeX, CheckCircle } from 'lucide-react';
import { Appointment, Clinic, Doctor, Patient } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { usePerms } from '../context/PermissionsContext';
import { formatDateToISO } from '../utils/dateUtils';
import { buildClinicFlow } from '../utils/flow';
import { waitTone } from '../utils/queue';
import { WaitingRow, callEvents, hhmmOfMinutes, waitingRows } from '../utils/onlineQueue';
import { printTicket } from '../utils/queueCall';
import { useDeskFlow } from '../hooks/useDeskFlow';
import { useCallAnnouncer } from '../hooks/useCallAnnouncer';
import { BookingDone, BookingRequest } from '../components/BookingPanel';
import { QueueTV } from '../components/QueueTV';

/**
 * Onlayn navbat — bosh sahifadagi navbat va xarita bilan BIR XIL ma'lumot:
 * bugungi qabullar (kim kutmoqda) va /api/desk/flow (kim kabinetga chaqirilgan,
 * navbat raqami). Resepshn, shifokor, TV ekrani va bosh sahifa istalgan qurilmada
 * bir xil holatni ko'radi. "Chaqirish" — shifokorning "Kirish"i bilan bir xil:
 * bemor kabinetga o'tadi, TV esa uni ovoz bilan chaqiradi.
 */

interface Props {
    doctors: Doctor[];
    patients: Patient[];
    appointments: Appointment[];
    clinicId: string;
    userRole: string;
    currentClinic?: Clinic | null;
    /** "Navbat qo'shish" — umumiy "Qabul" paneli ("Hozir" rejimida) */
    onOpenBooking?: (req?: BookingRequest) => void;
    onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
    onPatientClick?: (id: string) => void;
}

const POLL_MS = 5000;
const PAGE_SOUND_KEY = 'dentalflow_queue_sound';
const TV_VOICE_KEY = 'dentalflow_queue_tv_voice';
const PRINT_KEY = 'dentalflow_queue_print';

const readFlag = (key: string, fallback: boolean) => {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v === '1';
    } catch { return fallback; }
};
const writeFlag = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ahamiyatsiz */ } };

const tvInUrl = () => {
    try { return new URLSearchParams(window.location.search).get('tv') === '1'; } catch { return false; }
};
const setTvInUrl = (on: boolean) => {
    try {
        const url = new URL(window.location.href);
        if (on) url.searchParams.set('tv', '1'); else url.searchParams.delete('tv');
        window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* manzilni o'zgartirib bo'lmasa ham tablo ishlaydi */ }
};

export const OnlineQueue: React.FC<Props> = ({ doctors, appointments, clinicId, currentClinic, onOpenBooking, onUpdateAppointment, onPatientClick }) => {
    const { t } = useLanguage();
    const perms = usePerms();
    const canEditAppt = perms.can('calendar', 'appts', 'edit') && !!onUpdateAppointment;

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 15000);
        return () => window.clearInterval(id);
    }, []);
    const today = formatDateToISO(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const desk = useDeskFlow(clinicId, today, !!clinicId, { tickets: true, pollMs: POLL_MS });
    const flow = useMemo(
        () => buildClinicFlow(appointments, doctors, desk.entries, today, nowMin),
        [appointments, doctors, desk.entries, today, nowMin]);
    const waiting = useMemo(() => waitingRows(flow, desk.entries, desk.tickets, nowMin), [flow, desk.entries, desk.tickets, nowMin]);
    const todays = useMemo(() => appointments.filter(a => a.date === today), [appointments, today]);
    const events = useMemo(() => callEvents(todays, desk.entries, desk.tickets), [todays, desk.entries, desk.tickets]);
    const noShows = todays.filter(a => a.status === 'No-Show').length;

    // TV rejimi: manzilda ?tv=1 — sahifa yangilansa ham tablo qoladi
    const [isTV, setIsTV] = useState(tvInUrl);
    const [needsStart, setNeedsStart] = useState(tvInUrl);
    const [pageSound, setPageSound] = useState(() => readFlag(PAGE_SOUND_KEY, false));
    const [tvVoice, setTvVoice] = useState(() => readFlag(TV_VOICE_KEY, true));
    const [printOnAdd, setPrintOnAdd] = useState(() => readFlag(PRINT_KEY, true));

    // Chaqiruvni e'lon qilish: TV da doim (ohang + ovoz ixtiyoriy), sahifada — yoqilgan bo'lsa
    useCallAnnouncer(events, {
        ready: desk.ready,
        enabled: isTV ? !needsStart : pageSound,
        voice: isTV ? tvVoice : true,
    });

    const enterTV = () => {
        setTvInUrl(true);
        setIsTV(true);
        setNeedsStart(false);
        void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const exitTV = useCallback(() => {
        setTvInUrl(false);
        setIsTV(false);
        setNeedsStart(false);
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    }, []);
    const startTV = () => {
        setNeedsStart(false);
        void document.documentElement.requestFullscreen?.().catch(() => {});
    };

    const [busy, setBusy] = useState<string | null>(null);
    const run = async (key: string, fn: () => Promise<unknown> | void) => {
        if (busy) return;
        setBusy(key);
        try { await fn(); } finally { setBusy(null); }
    };

    const ticketLabels = {
        title: t('queue.ticket.title'), patient: t('queue.ticket.patient'), phone: t('queue.ticket.phone'),
        doctor: t('queue.ticket.doctor'), service: t('queue.ticket.service'), time: t('queue.ticket.time'), footer: t('queue.ticket.footer'),
    };
    /** fresh — raqamni albatta serverdan olish (yangi qo'shilgan yoki qayta tiklangan qabul) */
    const print = async (a: { id: string; patientName: string; doctorName?: string; type?: string; patientId?: string }, phone?: string, fresh = false) => {
        const number = (!fresh && desk.tickets[a.id]) || await desk.issueTicket(a.id);
        if (!number) { alert(t('queue.ticketFailed')); return; }
        printTicket({
            number, patientName: a.patientName, phone, doctorName: a.doctorName, service: a.type,
            clinicName: currentClinic?.name || 'DentaCRM', clinicPhone: currentClinic?.phone || undefined, labels: ticketLabels,
        });
    };

    const addToQueue = () => onOpenBooking?.({
        mode: 'now',
        onDone: (saved?: BookingDone) => {
            if (!saved) return;
            // Raqam darhol beriladi — TV va boshqa ekranlarda shu raqam bilan chiqadi
            if (printOnAdd) {
                void print({ id: saved.appointmentId, patientName: saved.patientName, doctorName: saved.doctorName, type: saved.service }, saved.phone, true);
            } else {
                void desk.issueTicket(saved.appointmentId);
            }
        },
    });

    const callIn = (a: Appointment, occupant: Appointment | null) => {
        if (occupant && occupant.id !== a.id
            && !window.confirm(t('queue.busyConfirm').replace('{name}', occupant.patientName).replace('{next}', a.patientName))) return;
        return run(`call:${a.id}`, () => desk.set(a.id, true));
    };
    const markNoShow = (a: Appointment) => {
        if (!onUpdateAppointment || !window.confirm(t('queue.noShowConfirm').replace('{name}', a.patientName))) return;
        return run(`noshow:${a.id}`, () => onUpdateAppointment(a.id, { status: 'No-Show' }));
    };

    if (isTV) {
        return (
            <QueueTV
                clinicName={currentClinic?.name || 'DentaCRM'}
                lanes={flow.lanes}
                waiting={waiting}
                events={events}
                log={desk.entries}
                tickets={desk.tickets}
                nowMin={nowMin}
                voice={tvVoice}
                onToggleVoice={() => { const v = !tvVoice; setTvVoice(v); writeFlag(TV_VOICE_KEY, v); }}
                onExit={exitTV}
                needsStart={needsStart}
                onStart={startTV}
            />
        );
    }

    const num = (id: string) => desk.tickets[id];
    const toneCls = (mins: number) => {
        const tone = waitTone(mins);
        return tone === 'late' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
    };
    const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60000)) : 0);
    const waitingByLane = new Map<string, WaitingRow>(waiting.map(w => [w.appointment.id, w] as [string, WaitingRow]));

    const stats = [
        { key: 'waiting', label: t('queue.stats.waiting'), value: flow.counts.waiting, icon: Clock, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
        { key: 'inChair', label: t('queue.stats.inChair'), value: flow.counts.inChair, icon: Armchair, cls: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400' },
        { key: 'done', label: t('queue.stats.done'), value: flow.counts.done, icon: CheckCircle, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' },
        { key: 'noShow', label: t('queue.stats.noShow'), value: noShows, icon: UserX, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' },
    ];

    const btn = 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Sarlavha */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow">
                            <Users className="w-5 h-5 text-white" />
                        </span>
                        {t('queue.title')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('queue.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { const v = !pageSound; setPageSound(v); writeFlag(PAGE_SOUND_KEY, v); }}
                        aria-pressed={pageSound}
                        title={t('queue.soundHint')}
                        className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium transition-colors ${pageSound
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`}
                    >
                        {pageSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        {pageSound ? t('queue.soundOn') : t('queue.soundOff')}
                    </button>
                    <button
                        type="button"
                        onClick={enterTV}
                        className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                    >
                        <Tv className="w-4 h-4" /> {t('queue.tvMode')}
                    </button>
                    {onOpenBooking && (
                        <div className="inline-flex items-center rounded-xl bg-violet-600 text-white shadow-sm">
                            <button type="button" onClick={addToQueue} className="inline-flex items-center gap-2 h-10 pl-4 pr-3 rounded-l-xl text-sm font-semibold hover:bg-violet-700">
                                <Plus className="w-4 h-4" /> {t('queue.add')}
                            </button>
                            <label className="inline-flex items-center gap-1.5 h-10 pl-3 pr-3.5 border-l border-white/25 rounded-r-xl text-xs font-medium cursor-pointer hover:bg-violet-700" title={t('queue.printOnAdd')}>
                                <input
                                    type="checkbox"
                                    checked={printOnAdd}
                                    onChange={e => { setPrintOnAdd(e.target.checked); writeFlag(PRINT_KEY, e.target.checked); }}
                                    className="w-3.5 h-3.5 rounded border-white/40 text-violet-600 focus:ring-0"
                                />
                                <Printer className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t('queue.printShort')}</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Raqamlar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {stats.map(s => (
                    <div key={s.key} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.cls}`}><s.icon className="w-5 h-5" /></span>
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{s.value}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {flow.lanes.length === 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-800">
                    <span className="mx-auto mb-4 flex w-14 h-14 items-center justify-center rounded-full bg-violet-100 text-violet-500 dark:bg-violet-900/30"><Users className="w-7 h-7" /></span>
                    <p className="font-medium text-gray-700 dark:text-gray-200">{t('queue.empty')}</p>
                    {onOpenBooking && <p className="mt-1 text-sm text-gray-400">{t('queue.emptyHint')}</p>}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {flow.lanes.map(lane => {
                        const chair = lane.chair;
                        const chairEntry = chair ? desk.entries[chair.id] : undefined;
                        return (
                            <section key={lane.doctor.id} className="rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800 flex flex-col">
                                <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 dark:text-white truncate">Dr. {lane.doctor.lastName} {lane.doctor.firstName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{lane.doctor.specialty}</p>
                                    </div>
                                    <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400 text-right">
                                        {t('queue.lane.eta').replace('{n}', String(lane.etaMin))}
                                    </span>
                                </header>

                                {/* Kabinetda */}
                                <div className={`mx-3 mt-3 rounded-xl px-3 py-2.5 ${chair ? 'bg-sky-50 dark:bg-sky-900/20' : 'bg-emerald-50 dark:bg-emerald-900/15'}`}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                        <Armchair className="w-3.5 h-3.5" /> {chair ? t('queue.lane.inChair') : t('queue.lane.free')}
                                    </p>
                                    {chair && (
                                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                            <button type="button" onClick={() => onPatientClick?.(chair.patientId)} className="min-w-0 text-left">
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {num(chair.id) ? <span className="mr-1.5 tabular-nums text-sky-700 dark:text-sky-300">№{num(chair.id)}</span> : null}
                                                    {chair.patientName}
                                                </span>
                                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{t('queue.waitMin').replace('{n}', String(minutesSince(chairEntry?.in)))}</span>
                                                {lane.chairExtra > 0 && <span className="ml-2 text-[11px] text-amber-600">+{lane.chairExtra}</span>}
                                            </button>
                                            <span className="flex items-center gap-1.5">
                                                <button type="button" disabled={!!busy} onClick={() => run(`recall:${chair.id}`, () => desk.set(chair.id, true, true))} className={`${btn} bg-white text-sky-700 border border-sky-200 hover:bg-sky-100 dark:bg-gray-900 dark:border-sky-800 dark:text-sky-300`}>
                                                    <BellRing className="w-3.5 h-3.5" /> {t('queue.recall')}
                                                </button>
                                                <button type="button" disabled={!!busy} onClick={() => run(`back:${chair.id}`, () => desk.set(chair.id, false))} title={t('queue.back')} aria-label={t('queue.back')} className={`${btn} px-2 text-gray-500 hover:bg-white dark:hover:bg-gray-900`}>
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Kutmoqda */}
                                <div className="px-3 pt-3 pb-1 flex-1">
                                    <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        {t('queue.lane.waiting')} · {lane.queue.length}
                                    </p>
                                    {lane.queue.length === 0 && <p className="px-1 py-3 text-sm text-gray-400">{t('queue.lane.noQueue')}</p>}
                                    <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                        {lane.queue.map((a, i) => {
                                            const row = waitingByLane.get(a.id);
                                            const mins = row?.waitMin ?? 0;
                                            return (
                                                <li key={a.id} className="flex items-center gap-2 px-1 py-2">
                                                    <span className={`w-11 shrink-0 text-sm font-bold tabular-nums ${i === 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'}`}>{num(a.id) ? `№${num(a.id)}` : '—'}</span>
                                                    <button type="button" onClick={() => onPatientClick?.(a.patientId)} className="min-w-0 flex-1 text-left">
                                                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{a.patientName}</span>
                                                        <span className={`block text-[11px] tabular-nums ${toneCls(mins)}`}>
                                                            {a.time} · {t('queue.waitMin').replace('{n}', String(mins))}{row ? ` · ~${hhmmOfMinutes(row.etaAt)}` : ''}
                                                        </span>
                                                    </button>
                                                    <span className="flex shrink-0 items-center gap-1">
                                                        <button type="button" disabled={!!busy} onClick={() => callIn(a, chair)} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>
                                                            <Megaphone className="w-3.5 h-3.5" /> {t('queue.call')}
                                                        </button>
                                                        <button type="button" disabled={!!busy} onClick={() => run(`print:${a.id}`, () => print(a))} title={t('queue.ticket')} aria-label={t('queue.ticket')} className={`${btn} px-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700`}>
                                                            <Printer className="w-3.5 h-3.5" />
                                                        </button>
                                                        {canEditAppt && (
                                                            <button type="button" disabled={!!busy} onClick={() => markNoShow(a)} title={t('queue.noShow')} aria-label={t('queue.noShow')} className={`${btn} px-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20`}>
                                                                <UserX className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                {/* Keyinroq va qabul qilinganlar */}
                                <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>
                                        {lane.coming.length > 0
                                            ? `${t('queue.lane.later')}: ${t('queue.lane.laterFrom').replace('{n}', String(lane.coming.length)).replace('{time}', lane.coming[0].time)}`
                                            : `${t('queue.lane.later')}: —`}
                                    </span>
                                    <span>{t('queue.lane.done').replace('{n}', String(lane.done.length))}</span>
                                </footer>
                            </section>
                        );
                    })}
                </div>
            )}

            {flow.idle.length > 0 && (
                <p className="text-xs text-gray-400">
                    {t('queue.idle').replace('{names}', flow.idle.map(d => `Dr. ${d.lastName}`).join(', '))}
                </p>
            )}
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5" /> {t('queue.syncNote')}
            </p>
        </div>
    );
};
