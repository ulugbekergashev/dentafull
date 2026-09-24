import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, ArrowUpRight, Loader2, AlertTriangle, CalendarPlus } from 'lucide-react';
import { Appointment, Doctor, Patient } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { searchPatients, prefillFromQuery, findSimilarPatients } from '../utils/patientSearch';
import { formatDateToISO } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';
import { doctorQueue, minutesOf, nowHHMM, planArrival } from '../utils/queue';

interface ArrivalCardProps {
    patients: Patient[];
    appointments: Appointment[];
    doctors: Doctor[];
    showPhone?: boolean;
    /** Yangi bemor qo'shish ruxsati — bo'lmasa faqat bazadagi bemorni navbatga qo'yish mumkin */
    canAddPatient: boolean;
    onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>, options?: { allowDuplicateName?: boolean }) => Promise<Patient | void>;
    onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<any>;
    onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
    onPatientClick?: (id: string) => void;
    /** "Boshqa kun yoki vaqtga" — qabul oynasini shu bemor bilan ochish */
    onBookLater?: (sel: { patientId?: string; newPatient?: { lastName: string; firstName: string; phone: string } }) => void;
}

const initialsOf = (name: string) => name.replace(/^Dr\.\s*/, '').split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase();

/**
 * "Hozir keldi" — resepshn oldindan yozilmagan bemorni shu zahoti hozirgi vaqtga
 * yozadi, Kalendarga kirmasdan. Bemor tanlanadi, keyin shifokor kartochkasi bosiladi.
 * Kartochkada har bir shifokorning hozirgi navbati ko'rinadi, eng bo'shi ajratiladi.
 */
export const ArrivalCard: React.FC<ArrivalCardProps> = ({
    patients, appointments, doctors, showPhone = true, canAddPatient,
    onAddPatient, onAddAppointment, onUpdateAppointment, onPatientClick, onBookLater,
}) => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newMode, setNewMode] = useState(false);
    const [form, setForm] = useState({ lastName: '', firstName: '', phone: '' });
    const [savingDoctor, setSavingDoctor] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
    // Kutish vaqtlari va "vaqti kelgan" qabullar daqiqa sayin o'zgaradi
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(x => x + 1), 30000);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        if (!notice) return;
        const id = setTimeout(() => setNotice(null), 8000);
        return () => clearTimeout(id);
    }, [notice]);

    const today = formatDateToISO(new Date());
    const nowStr = nowHHMM();
    const nowMin = minutesOf(nowStr);

    const q = query.trim();
    const results = useMemo(
        () => (q.length >= 2 && !selectedId && !newMode ? searchPatients(patients, q, 4) : []),
        [patients, q, selectedId, newMode]
    );
    const selected = selectedId ? patients.find(p => p.id === selectedId) || null : null;
    // Yangi bemor yozilayotganda bazadagi o'xshashi (telefon yoki ism bir xil) — takror ochilmasin
    const similar = useMemo(
        () => (newMode ? findSimilarPatients(patients, form, 3) : []),
        [newMode, patients, form]
    );
    const ready = !!selected || newMode;

    const activeDoctors = doctors.filter(d => d.status !== 'On Leave');
    const queues = activeDoctors.map(d => ({ doctor: d, queue: doctorQueue(appointments, d.id, today, nowMin) }));
    const minLoad = queues.length ? Math.min(...queues.map(x => x.queue.length)) : 0;

    const todayInfo = (patientId: string): string => {
        const plan = planArrival(appointments, patientId, today, nowMin);
        if (plan.kind === 'already-done') return t('arrival.info.done');
        if (plan.kind === 'already-waiting') return t('arrival.info.waiting').replace('{doctor}', plan.appointment.doctorName);
        if (plan.kind === 'move') {
            return plan.appointment.status === 'No-Show'
                ? t('arrival.info.noShow')
                : t('arrival.info.later').replace('{time}', plan.appointment.time);
        }
        return t('arrival.info.new');
    };

    const reset = () => {
        setQuery('');
        setSelectedId(null);
        setNewMode(false);
        setForm({ lastName: '', firstName: '', phone: '' });
    };

    const openNew = () => {
        const pre = prefillFromQuery(q);
        setForm({ lastName: pre.lastName, firstName: pre.firstName, phone: pre.phone });
        setSelectedId(null);
        setNewMode(true);
    };

    const handleDoctor = async (doctor: Doctor) => {
        if (!ready) {
            setNotice({ text: t('arrival.pickFirst'), tone: 'warn' });
            return;
        }
        if (savingDoctor) return;
        const doctorName = `Dr. ${doctor.lastName}`;
        setSavingDoctor(doctor.id);
        try {
            let patient = selected;
            if (newMode) {
                const lastName = form.lastName.trim();
                const firstName = form.firstName.trim();
                // Server ham ism, familiya va telefonni majburiy so'raydi
                if (!lastName || !firstName || !form.phone.trim()) {
                    setNotice({ text: t('arrival.nameRequired'), tone: 'warn' });
                    return;
                }
                if (!onAddPatient) return;
                const same = patients.some(p =>
                    p.firstName.trim().toLowerCase() === firstName.toLowerCase()
                    && p.lastName.trim().toLowerCase() === lastName.toLowerCase());
                if (same && !window.confirm(t('patientSearch.duplicateConfirm'))) return;
                const created = await onAddPatient({
                    firstName, lastName, phone: form.phone.trim(), dob: '', gender: 'Male',
                    medicalHistory: '', status: 'Active', lastVisit: 'Never',
                    // Yangi bemor o'sha shifokorga biriktiriladi — "faqat o'z bemorlari"ni
                    // ko'radigan shifokor ham uning kartasini ocha olsin
                    doctorId: doctor.id,
                } as Omit<Patient, 'id' | 'clinicId'>, { allowDuplicateName: same });
                if (!created || !(created as Patient).id) return;
                patient = created as Patient;
                // Bemor endi bazada: qabul yozilmay qolsa, qayta bosish ikkinchi bemor ochmasin
                setNewMode(false);
                setSelectedId(patient.id);
                setQuery(`${patient.lastName} ${patient.firstName}`);
            }
            if (!patient) return;
            const name = `${patient.lastName} ${patient.firstName}`;
            const plan = planArrival(appointments, patient.id, today, nowMin);
            if (plan.kind === 'already-done') {
                setNotice({ text: `${name} — ${t('arrival.info.done').toLowerCase()}`, tone: 'warn' });
                return;
            }
            if (plan.kind === 'already-waiting') {
                setNotice({ text: `${name} — ${t('arrival.info.waiting').replace('{doctor}', plan.appointment.doctorName).toLowerCase()}`, tone: 'warn' });
                return;
            }
            if (plan.kind === 'move') {
                if (!onUpdateAppointment) {
                    setNotice({ text: `${name} — ${t('arrival.cantMove').replace('{time}', plan.appointment.time)}`, tone: 'warn' });
                    return;
                }
                await onUpdateAppointment(plan.appointment.id, {
                    time: nowStr, doctorId: doctor.id, doctorName,
                    status: plan.appointment.status === 'No-Show' ? 'Confirmed' : plan.appointment.status,
                });
            } else {
                const saved: Appointment | undefined = await onAddAppointment({
                    patientId: patient.id, patientName: name, doctorId: doctor.id, doctorName,
                    type: 'Konsultatsiya', date: today, time: nowStr, duration: 30, status: 'Confirmed', notes: '',
                } as Omit<Appointment, 'id'>);
                // Bir bemorga bir kunda bitta qabul: boshqa resepshn hozirgina yozgan bo'lsa,
                // server yangisini ochmay o'sha qabulni qaytaradi — uni ham hozirga ko'chiramiz
                if (saved && saved.id && (saved.time !== nowStr || saved.doctorId !== doctor.id)) {
                    if (saved.status === 'Completed') {
                        setNotice({ text: `${name} — ${t('arrival.info.done').toLowerCase()}`, tone: 'warn' });
                        return;
                    }
                    if (!onUpdateAppointment) {
                        setNotice({ text: `${name} — ${t('arrival.cantMove').replace('{time}', saved.time)}`, tone: 'warn' });
                        return;
                    }
                    await onUpdateAppointment(saved.id, {
                        time: nowStr, doctorId: doctor.id, doctorName,
                        status: saved.status === 'No-Show' ? 'Confirmed' : saved.status,
                    });
                }
            }
            const position = doctorQueue(appointments, doctor.id, today, nowMin).length + 1;
            setNotice({
                text: t('arrival.done').replace('{patient}', name).replace('{doctor}', doctorName).replace('{n}', String(position)),
                tone: 'ok',
            });
            reset();
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi
        } finally {
            setSavingDoctor(null);
        }
    };

    return (
        <section className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-6 p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-primary-100 dark:border-primary-900/40 shadow-sm">
            <div className="flex flex-col gap-3 min-w-0">
                <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white">
                        {t('arrival.titleA')} <span className="text-primary">{t('arrival.titleB')}</span>
                    </h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('arrival.subtitle')}</p>
                </div>

                <label className={`flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-gray-100 dark:bg-gray-900/60 border-2 transition-colors ${ready ? 'border-primary-500' : 'border-transparent focus-within:border-primary-300'}`}>
                    <Search className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedId(null); setNewMode(false); }}
                        placeholder={t('arrival.searchPlaceholder')}
                        aria-label={t('arrival.searchPlaceholder')}
                        className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                </label>

                {results.length > 0 || (q.length >= 2 && !selectedId && !newMode) ? (
                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        {results.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { setSelectedId(p.id); setQuery(`${p.lastName} ${p.firstName}`); }}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                            >
                                <span className="w-8 h-8 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-black flex items-center justify-center">{initialsOf(`${p.lastName} ${p.firstName}`)}</span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{p.lastName} {p.firstName}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {(showPhone ? p.phone : maskPhone(p.phone)) || '—'} · {todayInfo(p.id)}
                                    </span>
                                </span>
                            </button>
                        ))}
                        {results.length === 0 && <p className="px-3.5 py-2.5 text-xs text-gray-500">{t('patientSearch.notFound')}</p>}
                        {canAddPatient && onAddPatient && (
                            <button type="button" onClick={openNew} className="w-full flex items-center gap-2 px-3.5 py-3 text-left text-sm font-bold text-primary-600 dark:text-primary-400 bg-gray-50 dark:bg-gray-900/40 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                                <Plus className="w-4 h-4" /> {t('patientSearch.addNew')}: «{q}»
                            </button>
                        )}
                    </div>
                ) : null}

                {selected && (
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                        <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-white text-sm font-black flex items-center justify-center">{initialsOf(`${selected.lastName} ${selected.firstName}`)}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-[15px] font-bold text-gray-900 dark:text-white truncate">{selected.lastName} {selected.firstName}</span>
                            <span className="block text-xs text-primary-800 dark:text-primary-300">{todayInfo(selected.id)}</span>
                        </span>
                        {onPatientClick && (
                            <button type="button" onClick={() => onPatientClick(selected.id)} title={t('arrival.openCard')} aria-label={t('arrival.openCard')} className="p-2 rounded-lg text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40">
                                <ArrowUpRight className="w-4 h-4" />
                            </button>
                        )}
                        <button type="button" onClick={reset} aria-label={t('auto.Bekor')} className="p-2 rounded-lg text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {newMode && (
                    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('arrival.newPatient')}</span>
                            <button type="button" onClick={reset} aria-label={t('auto.Bekor')} className="p-1 rounded-md text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder={t('auto.Familiya *')} aria-label={t('auto.Familiya *')} className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                            <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder={t('auto.Ism *')} aria-label={t('auto.Ism *')} className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                        </div>
                        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={`${t('auto.Telefon')} *`} aria-label={t('auto.Telefon')} inputMode="tel" className="h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                        {similar.length > 0 ? (
                            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {t('patientSearch.similarTitle')}
                                </p>
                                {similar.map(({ patient: p, reason }) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => { setNewMode(false); setSelectedId(p.id); setQuery(`${p.lastName} ${p.firstName}`); }}
                                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                    >
                                        <span className="truncate text-gray-900 dark:text-white">{p.lastName} {p.firstName}</span>
                                        <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                                            {reason === 'phone' ? t('patientSearch.samePhone') : t('patientSearch.sameName')} · {t('arrival.pickThis')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('arrival.newHint')}</p>
                        )}
                    </div>
                )}

                {!ready && q.length < 2 && (
                    <p className="text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{t('arrival.idle')}</p>
                )}

                {onBookLater && (
                    <button
                        type="button"
                        onClick={() => onBookLater(selected ? { patientId: selected.id } : newMode ? { newPatient: { ...form } } : {})}
                        className="self-start inline-flex items-center gap-1.5 text-[13px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                        <CalendarPlus className="w-4 h-4" /> {t('arrival.otherTime')}
                    </button>
                )}

                {notice && (
                    <p role="status" className={`text-[13px] font-medium px-3 py-2 rounded-xl ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'}`}>
                        {notice.text}
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('arrival.doctorsNow')}</span>
                    <span className={`text-xs font-semibold ${ready ? 'text-primary-700 dark:text-primary-300' : 'text-gray-400'}`}>
                        {ready ? t('arrival.pickDoctor') : t('arrival.noPatient')}
                    </span>
                </div>
                {queues.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('arrival.noDoctors')}</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                        {queues.map(({ doctor, queue }) => {
                            const n = queue.length;
                            const best = ready && n === minLoad;
                            const waitSum = queue.reduce((s, a) => s + (Number(a.duration) || 30), 0);
                            const busy = savingDoctor === doctor.id;
                            return (
                                <button
                                    key={doctor.id}
                                    type="button"
                                    onClick={() => handleDoctor(doctor)}
                                    disabled={!!savingDoctor}
                                    aria-label={`Dr. ${doctor.lastName} ${doctor.firstName} — ${n} ${t('arrival.waitingPeople')}`}
                                    className={`text-left flex flex-col gap-3 p-4 rounded-3xl border-2 transition-all disabled:opacity-60 ${best
                                        ? 'border-primary-600 bg-primary-50/40 dark:bg-primary-900/10 shadow-md shadow-primary-500/10'
                                        : ready ? 'border-primary-100 dark:border-primary-900/40 hover:border-primary-400' : 'border-gray-100 dark:border-gray-700 cursor-default'}`}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <span className="w-10 h-10 shrink-0 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ backgroundColor: doctor.color || '#2563EB' }}>
                                            {initialsOf(`${doctor.lastName} ${doctor.firstName}`)}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[15px] font-bold text-gray-900 dark:text-white truncate">Dr. {doctor.lastName}</span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{doctor.specialty}</span>
                                        </span>
                                    </span>
                                    <span className="flex items-baseline gap-2">
                                        <span className={`text-4xl font-black leading-none ${n >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{n}</span>
                                        <span className="text-[13px] font-semibold text-gray-600 dark:text-gray-300">{t('arrival.waitingPeople')}</span>
                                    </span>
                                    <span className="flex items-center min-h-[28px]">
                                        {queue.slice(0, 4).map((a, i) => (
                                            <span key={a.id} title={a.patientName} className={`w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-white dark:border-gray-800 text-[10px] font-black text-gray-700 dark:text-gray-200 flex items-center justify-center ${i > 0 ? '-ml-2' : ''}`}>
                                                {initialsOf(a.patientName)}
                                            </span>
                                        ))}
                                        {n > 4 && <span className="ml-1 text-xs font-bold text-gray-500">+{n - 4}</span>}
                                        <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${n === 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                            {n === 0 ? t('arrival.free') : t('arrival.waitApprox').replace('{m}', String(waitSum))}
                                        </span>
                                    </span>
                                    <span className={`flex items-center justify-center gap-1.5 h-9 rounded-xl text-[13px] font-bold ${ready
                                        ? best ? 'bg-primary text-white' : 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                        : 'bg-gray-50 dark:bg-gray-900/40 text-gray-400'}`}
                                    >
                                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : ready ? <Plus className="w-4 h-4" /> : null}
                                        {ready ? (best ? t('arrival.addBest') : t('arrival.add')) : t('arrival.pickFirstShort')}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
