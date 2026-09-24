import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Appointment, Clinic, Doctor, Patient, Service } from '../types';
import { DateField, weekdayShort, formatDayMonth } from './DateField';
import { useLanguage } from '../context/LanguageContext';
import { searchPatients, prefillFromQuery, findSimilarPatients } from '../utils/patientSearch';
import { formatDateToISO } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';
import { doctorQueue, minutesOf, nowHHMM, planArrival } from '../utils/queue';
import { addDaysISO, daySlots } from '../utils/desk';

type Mode = 'now' | 'today' | 'day';
type NewPatientForm = { lastName: string; firstName: string; phone: string };
const EMPTY_NEW: NewPatientForm = { lastName: '', firstName: '', phone: '' };

export interface BookingPanelProps {
    open: boolean;
    onClose: () => void;
    /** Panel shu bemor tanlangan holda ochiladi */
    initialPatientId?: string;
    patients: Patient[];
    doctors: Doctor[];
    services: Service[];
    appointments: Appointment[];
    currentClinic?: Clinic;
    /** Shifokor o'zi yozsa — o'zi tanlangan bo'ladi */
    defaultDoctorId?: string;
    showPhone?: boolean;
    canAddPatient: boolean;
    /** Qabulni ko'chirish ruxsati (bemor shu kuni allaqachon yozilgan bo'lsa kerak bo'ladi) */
    canMove: boolean;
    onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>, options?: { allowDuplicateName?: boolean }) => Promise<Patient | void>;
    onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<any>;
    onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
}

const initialsOf = (name: string) => name.replace(/^Dr\.\s*/, '').split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase();
const TIME_RE = /^\d{1,2}:\d{2}$/;

/**
 * "Qabul" — o'ngdan ochiladigan panel, istalgan sahifadan. Bemor tanlanadi, keyin:
 *  - Hozir: bemor shu zahoti tanlangan shifokor navbatiga tushadi (eng bo'shi oldindan tanlangan);
 *  - Bugun yoki Boshqa kun: shifokorning bo'sh vaqtlaridan biri tanlanadi.
 * Bir bemorga bir kunda bitta qabul (bazadagi cheklov): o'sha kuni yozilgan bo'lsa
 * yangi qabul ochilmaydi — mavjudi tanlangan vaqtga ko'chadi.
 */
export const BookingPanel: React.FC<BookingPanelProps> = ({
    open, onClose, initialPatientId, patients, doctors, services, appointments, currentClinic,
    defaultDoctorId, showPhone = true, canAddPatient, canMove, onAddPatient, onAddAppointment, onUpdateAppointment,
}) => {
    const { t, language } = useLanguage();
    const isIndividualPlan = currentClinic?.planId === 'individual';
    const startHour = currentClinic?.startHour ?? 8;
    const endHour = currentClinic?.endHour ?? 20;
    const activeDoctors = useMemo(() => doctors.filter(d => d.status !== 'On Leave'), [doctors]);

    const [query, setQuery] = useState('');
    const [patientId, setPatientId] = useState<string | null>(null);
    const [newMode, setNewMode] = useState(false);
    const [newForm, setNewForm] = useState<NewPatientForm>(EMPTY_NEW);
    const [mode, setMode] = useState<Mode>('now');
    const [doctorId, setDoctorId] = useState('');
    // Qo'lda tanlanmagan bo'lsa, "Hozir"da shifokor navbat o'zgarishi bilan eng bo'shiga o'tadi
    const [doctorTouched, setDoctorTouched] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [type, setType] = useState('');
    const [duration, setDuration] = useState(30);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Kutish vaqtlari va "hozir" daqiqa sayin o'zgaradi
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!open) return;
        const id = setInterval(() => setTick(x => x + 1), 30000);
        return () => clearInterval(id);
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const now = new Date();
    const today = formatDateToISO(now);
    const nowStr = nowHHMM(now);
    const nowMin = minutesOf(nowStr);

    const queues = useMemo(() => activeDoctors.map(d => {
        const q = doctorQueue(appointments, d.id, today, nowMin);
        return { doctor: d, n: q.length, wait: q.reduce((s, a) => s + (Number(a.duration) || 30), 0) };
    }), [activeDoctors, appointments, today, nowMin]);
    const bestId = useMemo(() => {
        if (!queues.length) return '';
        const min = Math.min(...queues.map(q => q.n));
        return queues.find(q => q.n === min)!.doctor.id;
    }, [queues]);

    // Har ochilganda toza forma (yoki tanlangan bemor bilan)
    useEffect(() => {
        if (!open) return;
        const pre = initialPatientId ? patients.find(p => p.id === initialPatientId) : undefined;
        setPatientId(pre ? pre.id : null);
        setQuery(pre ? `${pre.lastName} ${pre.firstName}` : '');
        setNewMode(false);
        setNewForm(EMPTY_NEW);
        setMode('now');
        const own = defaultDoctorId && doctors.some(d => d.id === defaultDoctorId) ? defaultDoctorId : '';
        setDoctorTouched(!!own);
        setDoctorId(own || bestId || activeDoctors[0]?.id || doctors[0]?.id || '');
        setDate(addDaysISO(today, 1));
        setTime('');
        setType('');
        setDuration(30);
        setNotes('');
        setError(null);
        setSaving(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (open && mode === 'now' && !doctorTouched && bestId) setDoctorId(bestId);
    }, [open, mode, doctorTouched, bestId]);

    const targetDate = mode === 'day' ? date : today;
    const selected = patientId ? patients.find(p => p.id === patientId) || null : null;
    const doctor = doctors.find(d => d.id === doctorId);
    const existing = patientId
        ? appointments.find(a => a.patientId === patientId && a.date === targetDate && a.status !== 'Cancelled')
        : undefined;

    const slots = useMemo(() => (mode === 'now' || !doctorId || !targetDate ? [] : daySlots(appointments, doctorId, targetDate, {
        startHour, endHour, nowMin: targetDate === today ? nowMin : undefined, ignoreAppointmentId: existing?.id,
    })), [mode, doctorId, targetDate, appointments, startHour, endHour, today, nowMin, existing?.id]);
    const visibleSlots = slots.filter(s => !s.past);

    // Shifokor, kun yoki rejim o'zgarsa — birinchi bo'sh vaqt tanlanadi
    useEffect(() => {
        if (!open || mode === 'now') return;
        const first = slots.find(s => !s.busy && !s.past);
        setTime(first ? first.time : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode, doctorId, targetDate]);

    const q = query.trim();
    const results = useMemo(
        () => (open && q.length >= 2 && !patientId && !newMode ? searchPatients(patients, q, 5) : []),
        [open, patients, q, patientId, newMode]
    );
    const similar = useMemo(() => (newMode ? findSimilarPatients(patients, newForm, 3) : []), [newMode, patients, newForm]);

    const nowPlan = mode === 'now' && patientId ? planArrival(appointments, patientId, today, nowMin) : null;
    const sameTime = mode !== 'now' && doctorId && TIME_RE.test(time)
        ? appointments.find(a => a.doctorId === doctorId && a.date === targetDate && a.time === time && a.status !== 'Cancelled' && a.patientId !== patientId)
        : undefined;
    const overlaps = mode !== 'now' && TIME_RE.test(time) && !sameTime && (() => {
        const s = minutesOf(time);
        const e = s + (Number(duration) || 30);
        return appointments.some(a => a.doctorId === doctorId && a.date === targetDate && a.status !== 'Cancelled'
            && a.patientId !== patientId && minutesOf(a.time) < e && s < minutesOf(a.time) + (Number(a.duration) || 30));
    })();

    const dateLabel = (iso: string) => {
        if (iso === today) return t('booking.today');
        if (iso === addDaysISO(today, 1)) return t('booking.tomorrow');
        const [y, m, d] = iso.split('-').map(Number);
        return formatDayMonth(new Date(y, m - 1, d), false);
    };

    /** Formani yuborishga nima xalal beradi (bo'lmasa null) */
    const blocked: string | null = (() => {
        if (!doctor) return t('booking.noDoctor');
        if (mode === 'now' && nowPlan) {
            if (nowPlan.kind === 'already-done') return t('booking.alreadyDone');
            if (nowPlan.kind === 'already-waiting') return t('booking.alreadyWaiting').replace('{doctor}', nowPlan.appointment.doctorName);
            if (nowPlan.kind === 'move' && !canMove) return t('booking.cantMove').replace('{time}', nowPlan.appointment.time);
        }
        if (mode !== 'now') {
            if (existing?.status === 'Completed') return t('booking.alreadyDoneDay');
            if (existing && !canMove) return t('booking.cantMove').replace('{time}', existing.time);
            if (sameTime) return t('booking.sameTime').replace('{time}', time).replace('{patient}', sameTime.patientName);
        }
        return null;
    })();
    const willMove = mode === 'now'
        ? nowPlan?.kind === 'move' && canMove
        : !!existing && existing.status !== 'Completed' && canMove;

    const patientInfo = (p: Patient): string => {
        if (mode === 'now') {
            const plan = planArrival(appointments, p.id, today, nowMin);
            if (plan.kind === 'already-done') return t('booking.info.done');
            if (plan.kind === 'already-waiting') return t('booking.info.waiting').replace('{doctor}', plan.appointment.doctorName);
            if (plan.kind === 'move') {
                return plan.appointment.status === 'No-Show'
                    ? t('booking.info.noShow')
                    : t('booking.info.later').replace('{time}', plan.appointment.time);
            }
            return t('booking.info.free');
        }
        const ex = appointments.find(a => a.patientId === p.id && a.date === targetDate && a.status !== 'Cancelled');
        return ex
            ? t('booking.info.booked').replace('{date}', dateLabel(targetDate)).replace('{time}', ex.time).replace('{doctor}', ex.doctorName)
            : '';
    };

    const pickPatient = (p: Patient) => {
        setPatientId(p.id);
        setQuery(`${p.lastName} ${p.firstName}`);
        setNewMode(false);
        setError(null);
    };
    const clearPatient = () => {
        setPatientId(null);
        setNewMode(false);
        setNewForm(EMPTY_NEW);
        setQuery('');
        setError(null);
    };
    const chooseDoctor = (id: string) => {
        setDoctorId(id);
        setDoctorTouched(true);
        setError(null);
    };

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (saving) return;
        setError(null);
        if (!patientId && !newMode) { setError(t('booking.pickPatient')); return; }
        if (mode !== 'now' && (!TIME_RE.test(time) || !targetDate)) { setError(t('booking.pickTime')); return; }
        if (blocked) { setError(blocked); return; }
        if (!doctor) return;
        const doctorName = `Dr. ${doctor.lastName}`;
        const apptTime = mode === 'now' ? nowStr : time;
        const dur = Number(duration) || 30;
        setSaving(true);
        try {
            let patient = selected;
            if (newMode) {
                const lastName = newForm.lastName.trim();
                const firstName = newForm.firstName.trim();
                // Server ham ism, familiya va telefonni majburiy so'raydi
                if (!lastName || !firstName || !newForm.phone.trim()) { setError(t('booking.nameRequired')); return; }
                if (!onAddPatient) return;
                const same = patients.some(p =>
                    p.firstName.trim().toLowerCase() === firstName.toLowerCase()
                    && p.lastName.trim().toLowerCase() === lastName.toLowerCase());
                if (same && !window.confirm(t('patientSearch.duplicateConfirm'))) return;
                const created = await onAddPatient({
                    firstName, lastName, phone: newForm.phone.trim(), dob: '', gender: 'Male',
                    medicalHistory: '', status: 'Active', lastVisit: 'Never',
                    // Yangi bemor o'sha shifokorga biriktiriladi — "faqat o'z bemorlari"ni
                    // ko'radigan shifokor ham uning kartasini ocha olsin
                    doctorId: doctor.id,
                } as Omit<Patient, 'id' | 'clinicId'>, { allowDuplicateName: same });
                if (!created || !(created as Patient).id) return;
                patient = created as Patient;
                // Bemor endi bazada: qabul yozilmay qolsa, qayta bosish ikkinchi bemor ochmasin
                setNewMode(false);
                setPatientId(patient.id);
                setQuery(`${patient.lastName} ${patient.firstName}`);
            }
            if (!patient) return;
            const name = `${patient.lastName} ${patient.firstName}`;

            const moveTo = async (appt: Appointment): Promise<boolean> => {
                if (appt.status === 'Completed') { setError(t('booking.alreadyDoneDay')); return false; }
                if (!canMove || !onUpdateAppointment) { setError(t('booking.cantMove').replace('{time}', appt.time)); return false; }
                await onUpdateAppointment(appt.id, {
                    time: apptTime, doctorId: doctor.id, doctorName, duration: dur,
                    ...(type ? { type } : {}),
                    ...(notes.trim() ? { notes: appt.notes ? `${appt.notes}\n${notes.trim()}` : notes.trim() } : {}),
                    // "Kelmadi" deb belgilangan edi — endi keldi yoki qayta yozildi
                    status: appt.status === 'No-Show' ? (mode === 'now' ? 'Confirmed' : 'Pending') : appt.status,
                });
                return true;
            };

            // Ro'yxat eskirgan bo'lishi mumkin — yangi bemorda ham mavjud qabulni qayta tekshiramiz
            const current = appointments.find(a => a.patientId === patient!.id && a.date === targetDate && a.status !== 'Cancelled');
            if (current) {
                if (mode === 'now' && current.status !== 'Completed' && minutesOf(current.time) <= nowMin && current.status !== 'No-Show') {
                    setError(t('booking.alreadyWaiting').replace('{doctor}', current.doctorName));
                    return;
                }
                if (!(await moveTo(current))) return;
            } else {
                const saved: Appointment | undefined = await onAddAppointment({
                    patientId: patient.id, patientName: name, doctorId: doctor.id, doctorName,
                    type: type || 'Konsultatsiya', date: targetDate, time: apptTime, duration: dur,
                    // Hozir kelgan bemor shu yerda — tasdiqlangan; oldindan yozilgan — kutilmoqda
                    status: mode === 'now' ? 'Confirmed' : 'Pending',
                    notes: notes.trim(),
                } as Omit<Appointment, 'id'>);
                // Boshqa xodim hozirgina shu kunga yozgan bo'lsa, server yangisini ochmay o'shani qaytaradi
                if (saved && saved.id && (saved.time !== apptTime || saved.doctorId !== doctor.id)) {
                    if (!(await moveTo(saved))) return;
                }
            }
            onClose();
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi, panel ochiq qoladi
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i + 1));
    const dayCount = (iso: string) => appointments.filter(a => a.date === iso && a.status !== 'Cancelled' && (!doctorId || a.doctorId === doctorId)).length;
    const submitLabel = (() => {
        const dn = doctor ? `Dr. ${doctor.lastName}` : '';
        if (mode === 'now') return willMove ? t('booking.submitMoveNow').replace('{doctor}', dn) : t('booking.submitNow').replace('{doctor}', dn);
        const when = `${dateLabel(targetDate)}, ${TIME_RE.test(time) ? time : '—'}`;
        return (willMove ? t('booking.submitMove') : t('booking.submitBook')).replace('{when}', when).replace('{doctor}', dn);
    })();
    const sectionLabel = 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400';

    return (
        <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="booking-title">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-[1px] animate-in" onClick={onClose} />
            <form onSubmit={submit} className="relative w-full max-w-[480px] h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl animate-in">
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 id="booking-title" className="text-lg font-black text-gray-900 dark:text-white">{t('booking.title')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* Bemor */}
                    <div className="space-y-2">
                        <span className={sectionLabel}>{t('booking.patient')}</span>
                        {selected ? (
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                                <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-white text-sm font-black flex items-center justify-center">{initialsOf(`${selected.lastName} ${selected.firstName}`)}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[15px] font-bold text-gray-900 dark:text-white truncate">{selected.lastName} {selected.firstName}</span>
                                    <span className="block text-xs text-primary-800 dark:text-primary-300 truncate">
                                        {[(showPhone ? selected.phone : maskPhone(selected.phone)) || null, patientInfo(selected) || null].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                                <button type="button" onClick={clearPatient} className="text-xs font-bold text-primary-700 dark:text-primary-300 hover:underline shrink-0">{t('booking.change')}</button>
                            </div>
                        ) : newMode ? (
                            <div className="flex flex-col gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('patientSearch.addNew')}</span>
                                    <button type="button" onClick={clearPatient} aria-label={t('common.cancel')} className="p-1 rounded-md text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={newForm.lastName} onChange={e => setNewForm(f => ({ ...f, lastName: e.target.value }))} placeholder={t('auto.Familiya *')} aria-label={t('auto.Familiya *')} className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                                    <input value={newForm.firstName} onChange={e => setNewForm(f => ({ ...f, firstName: e.target.value }))} placeholder={t('auto.Ism *')} aria-label={t('auto.Ism *')} className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                                </div>
                                <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder={`${t('auto.Telefon')} *`} aria-label={t('auto.Telefon')} inputMode="tel" className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                                {similar.length > 0 && (
                                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                            <AlertTriangle className="w-3.5 h-3.5" /> {t('patientSearch.similarTitle')}
                                        </p>
                                        {similar.map(({ patient: p, reason }) => (
                                            <button key={p.id} type="button" onClick={() => pickPatient(p)} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40">
                                                <span className="truncate text-gray-900 dark:text-white">{p.lastName} {p.firstName}</span>
                                                <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                                                    {reason === 'phone' ? t('patientSearch.samePhone') : t('patientSearch.sameName')} · {t('booking.pickThis')}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus-within:border-primary-400">
                                    <Search className="w-4 h-4 text-gray-400 shrink-0" />
                                    <input
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder={t('booking.searchPlaceholder')}
                                        aria-label={t('booking.patient')}
                                        autoFocus
                                        className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 p-0 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                                    />
                                </label>
                                {q.length >= 2 && (
                                    <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                        {results.map(p => {
                                            const info = patientInfo(p);
                                            return (
                                                <button key={p.id} type="button" onClick={() => pickPatient(p)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                                    <span className="w-8 h-8 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-black flex items-center justify-center">{initialsOf(`${p.lastName} ${p.firstName}`)}</span>
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{p.lastName} {p.firstName}</span>
                                                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                                            {[(showPhone ? p.phone : maskPhone(p.phone)) || '—', info || null].filter(Boolean).join(' · ')}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        {results.length === 0 && <p className="px-3 py-2.5 text-xs text-gray-500">{t('patientSearch.notFound')}</p>}
                                        {canAddPatient && onAddPatient && (
                                            <button type="button" onClick={() => { setNewForm(prefillFromQuery(q)); setNewMode(true); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-primary-600 dark:text-primary-400 bg-gray-50 dark:bg-gray-800/60 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                                                <Plus className="w-4 h-4" /> {t('patientSearch.addNew')}: «{q}»
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Qachon */}
                    <div className="space-y-2">
                        <span className={sectionLabel}>{t('booking.when')}</span>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('booking.when')}>
                            {([
                                ['now', t('booking.modeNow'), t('booking.modeNowSub').replace('{time}', nowStr)],
                                ['today', t('booking.modeToday'), t('booking.modeTodaySub')],
                                ['day', t('booking.modeDay'), t('booking.modeDaySub')],
                            ] as const).map(([m, title, sub]) => (
                                <button
                                    key={m}
                                    type="button"
                                    role="radio"
                                    aria-checked={mode === m}
                                    onClick={() => { setMode(m); setError(null); }}
                                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left transition-colors ${mode === m
                                        ? 'border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                        : 'border border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}
                                >
                                    <span className={`text-sm ${mode === m ? 'font-extrabold text-gray-900 dark:text-white' : 'font-bold text-gray-700 dark:text-gray-200'}`}>{title}</span>
                                    <span className={`text-[11px] ${mode === m ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>{sub}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Shifokor */}
                    {!isIndividualPlan && mode === 'now' && (
                        <div className="space-y-2">
                            <span className={sectionLabel}>{t('booking.doctorQueue')}</span>
                            {queues.length === 0 ? (
                                <p className="text-sm text-gray-500">{t('booking.noDoctors')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {queues.map(({ doctor: d, n, wait }) => {
                                        const sel = d.id === doctorId;
                                        return (
                                            <button
                                                key={d.id}
                                                type="button"
                                                onClick={() => chooseDoctor(d.id)}
                                                aria-pressed={sel}
                                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors ${sel
                                                    ? 'border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                    : 'border border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}
                                            >
                                                <span className="w-9 h-9 shrink-0 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ backgroundColor: d.color || '#2563EB' }}>{initialsOf(`${d.lastName} ${d.firstName}`)}</span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm font-bold text-gray-900 dark:text-white truncate">Dr. {d.lastName} {d.firstName}</span>
                                                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{d.specialty}</span>
                                                </span>
                                                <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${n === 0
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                                    {n === 0 ? t('booking.free') : t('booking.waiting').replace('{n}', String(n)).replace('{m}', String(wait))}
                                                    {d.id === bestId && queues.length > 1 ? ` · ${t('booking.best')}` : ''}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {mode === 'day' && (
                        <div className="space-y-2">
                            <span className={sectionLabel}>{t('booking.day')}</span>
                            <div className="grid grid-cols-7 gap-1.5">
                                {days.map(iso => {
                                    const [y, m, d] = iso.split('-').map(Number);
                                    const dt = new Date(y, m - 1, d);
                                    const sel = iso === date;
                                    const cnt = dayCount(iso);
                                    return (
                                        <button
                                            key={iso}
                                            type="button"
                                            onClick={() => { setDate(iso); setError(null); }}
                                            aria-pressed={sel}
                                            aria-label={`${formatDayMonth(dt)} — ${cnt}`}
                                            className={`flex flex-col items-center py-1.5 rounded-xl transition-colors ${sel
                                                ? 'border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}
                                        >
                                            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{weekdayShort(dt, language)}</span>
                                            <span className="text-base font-black text-gray-900 dark:text-white">{d}</span>
                                            <span className="text-[10px] font-semibold text-gray-400">{cnt > 0 ? cnt : '—'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <span className={`${sectionLabel} block pt-1`}>{t('booking.otherDate')}</span>
                            <DateField value={date} onChange={v => { if (v) setDate(v); }} min={addDaysISO(today, 1)} />
                        </div>
                    )}

                    {mode !== 'now' && (
                        <>
                            {!isIndividualPlan && (
                                <div className="space-y-2">
                                    <span className={sectionLabel}>{t('booking.doctor')}</span>
                                    <select
                                        value={doctorId}
                                        onChange={e => chooseDoctor(e.target.value)}
                                        aria-label={t('booking.doctor')}
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white"
                                    >
                                        {activeDoctors.map(d => (
                                            <option key={d.id} value={d.id}>Dr. {d.lastName} {d.firstName}{d.specialty ? ` — ${d.specialty}` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={sectionLabel}>{t('booking.time').replace('{date}', dateLabel(targetDate))}</span>
                                    <span className="text-[11px] text-gray-400">{t('booking.busyLegend')}</span>
                                </div>
                                {visibleSlots.length === 0 ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('booking.noSlots')}</p>
                                ) : (
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {visibleSlots.map(s => {
                                            const sel = s.time === time;
                                            return (
                                                <button
                                                    key={s.time}
                                                    type="button"
                                                    disabled={s.busy}
                                                    onClick={() => { setTime(s.time); setError(null); }}
                                                    aria-pressed={sel}
                                                    className={`h-9 rounded-lg text-[13px] font-bold tabular-nums transition-colors ${sel
                                                        ? 'bg-primary text-white border-2 border-primary-600'
                                                        : s.busy
                                                            ? 'bg-gray-50 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500 line-through border border-gray-100 dark:border-gray-800 cursor-not-allowed'
                                                            : 'border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:border-primary-400'}`}
                                                >
                                                    {s.time}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    {t('booking.customTime')}
                                    <input
                                        type="time"
                                        value={TIME_RE.test(time) ? time : ''}
                                        onChange={e => { setTime(e.target.value); setError(null); }}
                                        className="h-8 px-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                    />
                                </label>
                                {overlaps && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('booking.overlap')}</p>}
                            </div>
                        </>
                    )}

                    {/* Xizmat va izoh */}
                    <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                        <div className="space-y-2 min-w-0">
                            <span className={sectionLabel}>{t('booking.service')}</span>
                            <select
                                value={type}
                                onChange={e => {
                                    const svc = services.find(s => s.name === e.target.value);
                                    setType(e.target.value);
                                    if (svc?.duration) setDuration(svc.duration);
                                }}
                                aria-label={t('booking.service')}
                                className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                            >
                                <option value="">{t('booking.serviceNone')}</option>
                                {services.map(s => <option key={s.id ?? s.name} value={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <span className={sectionLabel}>{t('booking.duration')}</span>
                            <input type="number" min={5} step={5} value={duration} onChange={e => setDuration(Number(e.target.value))} aria-label={t('booking.duration')} className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white tabular-nums" />
                        </div>
                    </div>
                    <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={t('booking.notes')}
                        aria-label={t('booking.notes')}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                    />

                    {willMove && !blocked && (
                        <p className="text-[13px] px-3 py-2 rounded-xl bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                            {mode === 'now' && nowPlan?.kind === 'move'
                                ? t('booking.willMoveNow').replace('{time}', nowPlan.appointment.time)
                                : existing ? t('booking.willMove').replace('{time}', existing.time).replace('{doctor}', existing.doctorName) : ''}
                        </p>
                    )}
                    {(error || blocked) && (
                        <p role="alert" className="text-[13px] px-3 py-2 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">{error || blocked}</p>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <button
                        type="submit"
                        disabled={saving || !!blocked}
                        className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[15px] font-extrabold shadow-lg shadow-primary-500/20 transition-colors"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitLabel}
                    </button>
                    {mode === 'now' && <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('booking.nowHint').replace('{time}', nowStr)}</p>}
                </div>
            </form>
        </div>
    );
};
