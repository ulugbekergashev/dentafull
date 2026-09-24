import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Appointment, Clinic, Doctor, Patient, Service } from '../types';
import { Modal, Button, Input, Select } from './Common';
import { DateField } from './DateField';
import { useLanguage } from '../context/LanguageContext';
import { searchPatients, prefillFromQuery, findSimilarPatients } from '../utils/patientSearch';
import { formatDateToISO } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';
import { minutesOf, nextSlotHHMM } from '../utils/queue';

type NewPatientForm = { lastName: string; firstName: string; phone: string };

interface AppointmentQuickModalProps {
    isOpen: boolean;
    onClose: () => void;
    patients: Patient[];
    doctors: Doctor[];
    services: Service[];
    appointments: Appointment[];
    currentClinic?: Clinic;
    /** Shifokor o'zi yozsa — o'zi tanlangan bo'ladi */
    defaultDoctorId?: string;
    /** "Hozir keldi" kartasida tanlangan bemor bilan ochish */
    initialPatientId?: string;
    initialNewPatient?: NewPatientForm;
    showPhone?: boolean;
    canAddPatient: boolean;
    /** Qabulni ko'chirish ruxsati (bemor shu kuni allaqachon yozilgan bo'lsa kerak bo'ladi) */
    canMove: boolean;
    onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>, options?: { allowDuplicateName?: boolean }) => Promise<Patient | void>;
    onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<any>;
    onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
}

const EMPTY_NEW: NewPatientForm = { lastName: '', firstName: '', phone: '' };

/**
 * Bosh sahifadan qabul yozish — Kalendarga o'tmasdan. Istalgan kun va vaqtga.
 * Tanlangan shifokorning o'sha kungi band vaqtlari shu yerning o'zida ko'rinadi.
 * Bir bemorga bir kunda bitta qabul (bazadagi cheklov): bemor shu kuni allaqachon
 * yozilgan bo'lsa yangi qabul ochilmaydi — mavjudi tanlangan vaqtga ko'chadi.
 */
export const AppointmentQuickModal: React.FC<AppointmentQuickModalProps> = ({
    isOpen, onClose, patients, doctors, services, appointments, currentClinic, defaultDoctorId,
    initialPatientId, initialNewPatient, showPhone = true, canAddPatient, canMove,
    onAddPatient, onAddAppointment, onUpdateAppointment,
}) => {
    const { t } = useLanguage();
    const isIndividualPlan = currentClinic?.planId === 'individual';
    const activeDoctors = doctors.filter(d => d.status !== 'On Leave');

    const [query, setQuery] = useState('');
    const [patientId, setPatientId] = useState<string | null>(null);
    const [newMode, setNewMode] = useState(false);
    const [newForm, setNewForm] = useState<NewPatientForm>(EMPTY_NEW);
    const [doctorId, setDoctorId] = useState('');
    const [type, setType] = useState('');
    const [date, setDate] = useState(formatDateToISO(new Date()));
    const [time, setTime] = useState('09:00');
    const [duration, setDuration] = useState(30);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Har ochilganda toza forma (yoki tanlangan bemor bilan)
    useEffect(() => {
        if (!isOpen) return;
        const now = new Date();
        const startHour = currentClinic?.startHour ?? 9;
        const pre = initialPatientId ? patients.find(p => p.id === initialPatientId) : undefined;
        setPatientId(pre ? pre.id : null);
        setQuery(pre ? `${pre.lastName} ${pre.firstName}` : '');
        setNewMode(!pre && !!initialNewPatient);
        setNewForm(initialNewPatient || EMPTY_NEW);
        const own = defaultDoctorId && doctors.some(d => d.id === defaultDoctorId) ? defaultDoctorId : '';
        setDoctorId(own || activeDoctors[0]?.id || doctors[0]?.id || '');
        setType('');
        setDate(formatDateToISO(now));
        setTime(nextSlotHHMM(now, startHour));
        setDuration(30);
        setNotes('');
        setError(null);
        setSaving(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const q = query.trim();
    const results = useMemo(
        () => (isOpen && q.length >= 2 && !patientId && !newMode ? searchPatients(patients, q, 5) : []),
        [isOpen, patients, q, patientId, newMode]
    );
    const selected = patientId ? patients.find(p => p.id === patientId) || null : null;
    const similar = useMemo(
        () => (newMode ? findSimilarPatients(patients, newForm, 3) : []),
        [newMode, patients, newForm]
    );
    const doctor = doctors.find(d => d.id === doctorId);

    // Shifokorning o'sha kungi band vaqtlari
    const dayList = useMemo(
        () => appointments
            .filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'Cancelled')
            .sort((a, b) => minutesOf(a.time) - minutesOf(b.time)),
        [appointments, doctorId, date]
    );
    const start = minutesOf(time);
    const end = start + (Number(duration) || 30);
    const sameTime = dayList.find(a => a.time === time && a.patientId !== patientId);
    const overlaps = dayList.filter(a => {
        if (a.patientId === patientId) return false;
        const s = minutesOf(a.time);
        return s < end && start < s + (Number(a.duration) || 30);
    });
    // Bemor shu kuni allaqachon yozilganmi (bir kunda bitta qabul)
    const existing = patientId
        ? appointments.find(a => a.patientId === patientId && a.date === date && a.status !== 'Cancelled')
        : undefined;
    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        appointments.forEach(a => { if (a.status !== 'Cancelled') c[a.date] = (c[a.date] || 0) + 1; });
        return c;
    }, [appointments]);

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
    };

    const blocked: string | null = !doctor
        ? t('quickAppt.noDoctor')
        : sameTime
            ? t('quickAppt.sameTime').replace('{time}', time).replace('{patient}', sameTime.patientName)
            : existing?.status === 'Completed'
                ? t('quickAppt.alreadyDone')
                : existing && !canMove
                    ? t('quickAppt.existsNoMove').replace('{time}', existing.time).replace('{doctor}', existing.doctorName)
                    : null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setError(null);
        if (!patientId && !newMode) { setError(t('quickAppt.pickPatient')); return; }
        if (!/^\d{1,2}:\d{2}$/.test(time) || !date) { setError(t('quickAppt.badTime')); return; }
        if (blocked) { setError(blocked); return; }
        if (!doctor) return;
        const doctorName = `Dr. ${doctor.lastName}`;
        setSaving(true);
        try {
            let patient = selected;
            if (newMode) {
                const lastName = newForm.lastName.trim();
                const firstName = newForm.firstName.trim();
                if (!lastName || !firstName || !newForm.phone.trim()) { setError(t('arrival.nameRequired')); return; }
                if (!onAddPatient) return;
                const same = patients.some(p =>
                    p.firstName.trim().toLowerCase() === firstName.toLowerCase()
                    && p.lastName.trim().toLowerCase() === lastName.toLowerCase());
                if (same && !window.confirm(t('patientSearch.duplicateConfirm'))) return;
                const created = await onAddPatient({
                    firstName, lastName, phone: newForm.phone.trim(), dob: '', gender: 'Male',
                    medicalHistory: '', status: 'Active', lastVisit: 'Never', doctorId: doctor.id,
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
            const svc = type || undefined;
            // Ro'yxat eskirgan bo'lishi mumkin — yangi bemorda ham mavjud qabulni qayta tekshiramiz
            const current = appointments.find(a => a.patientId === patient!.id && a.date === date && a.status !== 'Cancelled');
            const moveTo = async (appt: Appointment) => {
                if (appt.status === 'Completed') { setError(t('quickAppt.alreadyDone')); return false; }
                if (!canMove || !onUpdateAppointment) {
                    setError(t('quickAppt.existsNoMove').replace('{time}', appt.time).replace('{doctor}', appt.doctorName));
                    return false;
                }
                await onUpdateAppointment(appt.id, {
                    time, doctorId: doctor.id, doctorName, duration: Number(duration) || 30,
                    ...(svc ? { type: svc } : {}),
                    ...(notes.trim() ? { notes: appt.notes ? `${appt.notes}\n${notes.trim()}` : notes.trim() } : {}),
                    status: appt.status === 'No-Show' ? 'Pending' : appt.status,
                });
                return true;
            };
            if (current) {
                if (!(await moveTo(current))) return;
            } else {
                const saved: Appointment | undefined = await onAddAppointment({
                    patientId: patient.id, patientName: name, doctorId: doctor.id, doctorName,
                    type: svc || 'Konsultatsiya', date, time, duration: Number(duration) || 30,
                    status: 'Pending', notes: notes.trim(),
                } as Omit<Appointment, 'id'>);
                // Boshqa xodim hozirgina shu kunga yozgan bo'lsa server o'sha qabulni qaytaradi
                if (saved && saved.id && (saved.time !== time || saved.doctorId !== doctor.id)) {
                    if (!(await moveTo(saved))) return;
                }
            }
            onClose();
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi, forma ochiq qoladi
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('calendar.newAppointment')}>
            <form onSubmit={submit} className="space-y-4">
                {/* Bemor */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.patient')}</label>
                    {selected ? (
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-gray-900 dark:text-white truncate">{selected.lastName} {selected.firstName}</span>
                                <span className="block text-xs text-primary-800 dark:text-primary-300">{(showPhone ? selected.phone : maskPhone(selected.phone)) || '—'}</span>
                            </span>
                            <button type="button" onClick={clearPatient} aria-label={t('common.cancel')} className="p-1.5 rounded-lg text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : newMode ? (
                        <div className="flex flex-col gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('arrival.newPatient')}</span>
                                <button type="button" onClick={clearPatient} aria-label={t('common.cancel')} className="p-1 rounded-md text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={newForm.lastName} onChange={e => setNewForm(f => ({ ...f, lastName: e.target.value }))} placeholder={t('auto.Familiya *')} aria-label={t('auto.Familiya *')} className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                                <input value={newForm.firstName} onChange={e => setNewForm(f => ({ ...f, firstName: e.target.value }))} placeholder={t('auto.Ism *')} aria-label={t('auto.Ism *')} className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                            </div>
                            <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder={`${t('auto.Telefon')} *`} aria-label={t('auto.Telefon')} inputMode="tel" className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white" />
                            {similar.length > 0 && (
                                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                        <AlertTriangle className="w-3.5 h-3.5" /> {t('patientSearch.similarTitle')}
                                    </p>
                                    {similar.map(({ patient: p, reason }) => (
                                        <button key={p.id} type="button" onClick={() => pickPatient(p)} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40">
                                            <span className="truncate text-gray-900 dark:text-white">{p.lastName} {p.firstName}</span>
                                            <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                                                {reason === 'phone' ? t('patientSearch.samePhone') : t('patientSearch.sameName')} · {t('arrival.pickThis')}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-700 focus-within:ring-2 focus-within:ring-primary-500">
                                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder={t('arrival.searchPlaceholder')}
                                    aria-label={t('calendar.patient')}
                                    autoFocus
                                    className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 p-0 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                                />
                            </label>
                            {q.length >= 2 && (
                                <div className="mt-1.5 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                    {results.map(p => (
                                        <button key={p.id} type="button" onClick={() => pickPatient(p)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.lastName} {p.firstName}</span>
                                            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{(showPhone ? p.phone : maskPhone(p.phone)) || '—'}</span>
                                        </button>
                                    ))}
                                    {results.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">{t('patientSearch.notFound')}</p>}
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

                {!isIndividualPlan && (
                    <Select
                        label={t('calendar.doctor')}
                        options={activeDoctors.map(d => ({ value: d.id, label: `Dr. ${d.lastName} ${d.firstName}` }))}
                        value={doctorId}
                        onChange={e => setDoctorId(e.target.value)}
                    />
                )}

                <div className="grid grid-cols-2 gap-4">
                    <DateField label={t('calendar.date')} value={date} onChange={setDate} counts={counts} required />
                    <Input label={t('calendar.time')} type="time" value={time} onChange={e => setTime(e.target.value)} required />
                </div>

                {/* Shifokorning o'sha kungi band vaqtlari — Kalendarni ochmasdan bo'sh vaqtni tanlash uchun */}
                {doctor && (
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            {t('quickAppt.busy').replace('{doctor}', `Dr. ${doctor.lastName}`)}
                        </p>
                        {dayList.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('quickAppt.dayFree')}</p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {dayList.map(a => {
                                    const clash = overlaps.includes(a);
                                    return (
                                        <span key={a.id} title={a.patientName} className={`text-xs px-2 py-1 rounded-lg ${clash ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-semibold' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'}`}>
                                            <b>{a.time}</b> {a.patientName.split(' ')[0]}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        {overlaps.length > 0 && !sameTime && (
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('quickAppt.overlap')}</p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Select
                        label={t('calendar.serviceType')}
                        options={[{ value: '', label: t('common.select') }, ...services.map(s => ({ value: s.name, label: s.name }))]}
                        value={type}
                        onChange={e => {
                            const svc = services.find(s => s.name === e.target.value);
                            setType(e.target.value);
                            if (svc?.duration) setDuration(svc.duration);
                        }}
                    />
                    <Input label={t('calendar.duration')} type="number" min={5} value={duration} onChange={e => setDuration(Number(e.target.value))} />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.notes')}</label>
                    <textarea
                        className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm h-16 dark:border-gray-700 dark:text-white"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>

                {existing && existing.status !== 'Completed' && canMove && (
                    <p className="text-[13px] px-3 py-2 rounded-xl bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                        {t('quickAppt.willMove').replace('{time}', existing.time).replace('{doctor}', existing.doctorName)}
                    </p>
                )}
                {(error || blocked) && (
                    <p role="alert" className="text-[13px] px-3 py-2 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">{error || blocked}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button type="submit" disabled={saving || !!blocked}>
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                        {existing && existing.status !== 'Completed' && canMove ? t('quickAppt.moveBtn') : t('calendar.book')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
