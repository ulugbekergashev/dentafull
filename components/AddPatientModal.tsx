import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Button } from './Common';
import { Patient, Doctor, UserRole } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { ChevronDown, Search, Loader2, AlertTriangle } from 'lucide-react';
import { RegionDistrictSelect } from './RegionDistrictSelect';
import { DateField } from './DateField';
import { findSimilarPatients } from '../utils/patientSearch';
import { formatDateToISO, formatDobDDMMYYYY } from '../utils/dateUtils';

interface AddPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddPatient: (data: Omit<Patient, 'id' | 'clinicId'>, options?: { allowDuplicateName?: boolean }) => Promise<Patient | void>;
    doctors?: Doctor[];
    userRole?: UserRole;
    doctorId?: string; // DOCTOR roli uchun avtomatik biriktirish
    compact?: boolean; // true = faqat asosiy maydonlar ochiq, qolgani yig'iladigan
    onCreated?: (patient: Patient) => void;
    /** Bazadagi bemorlar — berilsa, formada o'xshash (takror) bemorlar ko'rsatiladi */
    patients?: Patient[];
    /** O'xshash bemor ustiga bosilganda — uning kartasini ochish */
    onOpenExisting?: (patientId: string) => void;
    /** Oyna ochilganda formaga qo'yiladigan qiymatlar (masalan qidiruv matni) */
    initialValues?: { firstName?: string; lastName?: string; phone?: string };
}

const emptyForm = {
    firstName: '', lastName: '', phone: '', secondaryPhone: '',
    dob: '', gender: 'Male', address: '', medicalHistory: '', doctorId: '', pinfl: '',
    passport: '', regionCode: '', districtCode: '',
};

// Barcha joylar uchun yagona bemor qo'shish modali.
export const AddPatientModal: React.FC<AddPatientModalProps> = ({
    isOpen, onClose, onAddPatient, doctors = [], userRole, doctorId, compact = false, onCreated,
    patients, onOpenExisting, initialValues,
}) => {
    const { t } = useLanguage();
    const [form, setForm] = useState({ ...emptyForm });
    const [showMore, setShowMore] = useState(!compact);
    const [saving, setSaving] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const isDoctor = userRole === UserRole.DOCTOR;

    const reset = () => { setForm({ ...emptyForm }); setShowMore(!compact); };

    // Qidiruvdan kelganda yozilgan ism/telefon formaga o'tadi
    useEffect(() => {
        if (isOpen && initialValues) setForm({ ...emptyForm, ...initialValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const similar = useMemo(
        () => (patients ? findSimilarPatients(patients, form) : []),
        [patients, form.firstName, form.lastName, form.phone]
    );

    const handleLookupPinfl = async () => {
        if (!form.pinfl || form.pinfl.length < 14) {
            alert(t("auto.JSHSHIR 14 raqamdan iborat bo'lishi kerak"));
            return;
        }
        setLookupLoading(true);
        try {
            const data: any = await api.patients.lookupPinfl(form.pinfl);
            if (data) {
                setForm(f => ({
                    ...f,
                    firstName: data.firstName || f.firstName,
                    lastName: data.lastName || f.lastName,
                    dob: data.dob || data.birthDate || f.dob,
                    gender: data.gender === 'Male' || data.gender === 'Female' ? data.gender : f.gender,
                    address: data.address || f.address,
                    regionCode: data.regionCode || f.regionCode,
                    districtCode: data.districtCode || f.districtCode,
                }));
                setShowMore(true);
            }
        } catch (e: any) {
            alert(e.message || t("auto.JSHSHIR bo'yicha ma'lumot topilmadi"));
        } finally {
            setLookupLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.firstName.trim() || !form.lastName.trim()) {
            alert(t('auto.Ism va familiyani kiriting'));
            return;
        }
        // Bir xil ism-familiya — boshqa odam bo'lishi ham mumkin, shuning uchun
        // to'xtatilmaydi, faqat so'raladi
        const sameName = similar.some(s => s.reason === 'name')
            || (patients || []).some(p =>
                p.firstName.trim().toLowerCase() === form.firstName.trim().toLowerCase()
                && p.lastName.trim().toLowerCase() === form.lastName.trim().toLowerCase());
        if (sameName && !window.confirm(t('patientSearch.duplicateConfirm'))) return;
        setSaving(true);
        try {
            const newPatient = await onAddPatient({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                phone: form.phone,
                secondaryPhone: form.secondaryPhone || undefined,
                dob: form.dob,
                gender: form.gender as 'Male' | 'Female',
                address: form.address || undefined,
                medicalHistory: form.medicalHistory || '',
                doctorId: isDoctor ? doctorId : (form.doctorId || undefined),
                pinfl: form.pinfl || undefined,
                passport: form.passport || undefined,
                regionCode: form.regionCode || undefined,
                districtCode: form.districtCode || undefined,
                status: 'Active',
                lastVisit: 'Never',
            } as Omit<Patient, 'id' | 'clinicId'>, { allowDuplicateName: sameName });
            reset();
            onClose();
            if (newPatient && (newPatient as Patient).id) onCreated?.(newPatient as Patient);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t("auto.Yangi bemor qo'shish")} className="max-w-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Asosiy maydonlar */}
                <div className="grid grid-cols-2 gap-3">
                    <Input label={t('auto.Familiya *')} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
                    <Input label={t('auto.Ism *')} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
                </div>
                <Input label={t('auto.Telefon')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+998 90 123 45 67" />

                {similar.length > 0 && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> {t('patientSearch.similarTitle')}
                        </p>
                        <div className="space-y-1">
                            {similar.map(({ patient: p, reason }) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    disabled={!onOpenExisting}
                                    onClick={() => { onOpenExisting?.(p.id); onClose(); }}
                                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:cursor-default"
                                >
                                    <span className="truncate text-gray-900 dark:text-white">{p.lastName} {p.firstName}</span>
                                    <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                                        {reason === 'phone' ? t('patientSearch.samePhone') : formatDobDDMMYYYY(p.dob) || t('patientSearch.sameName')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Qo'shimcha ma'lumot toggle */}
                {compact && (
                    <button
                        type="button"
                        onClick={() => setShowMore(s => !s)}
                        className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                        <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                        {t("auto.Qo'shimcha ma'lumot")}
                    </button>
                )}

                {showMore && (
                    <div className="space-y-4 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex gap-2 items-end">
                                <Input label={t('auto.JSHSHIR (PINFL)')} containerClassName="flex-1" value={form.pinfl} onChange={e => setForm(f => ({ ...f, pinfl: e.target.value }))} placeholder="14 raqam" maxLength={14} />
                                <Button type="button" variant="secondary" onClick={handleLookupPinfl} disabled={lookupLoading} className="h-10">
                                    {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </Button>
                            </div>
                            <Input label={t('auto.Pasport (seriya, raqam)')} value={form.passport} onChange={e => setForm(f => ({ ...f, passport: e.target.value }))} placeholder="AA1234567" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label={t("auto.Qo'shimcha telefon")} value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                            <DateField label={t("auto.Tug'ilgan sana")} value={form.dob} onChange={dob => setForm(f => ({ ...f, dob }))} max={formatDateToISO(new Date())} />
                        </div>
                        <Input label={t('auto.Manzil')} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                        <RegionDistrictSelect regionCode={form.regionCode} districtCode={form.districtCode} onChange={v => setForm(f => ({ ...f, ...v }))} />

                        {!isDoctor && doctors.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auto.Biriktirilgan shifokor')}</label>
                                <select
                                    value={form.doctorId}
                                    onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}
                                    className="w-full h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 outline-none"
                                >
                                    <option value="">{t('auto.Tanlanmagan')}</option>
                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auto.Jins')}</label>
                            <div className="flex gap-2">
                                {(['Male', 'Female'] as const).map(g => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, gender: g }))}
                                        className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-all ${form.gender === g
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                    >
                                        {g === 'Male' ? t('auto.Erkak') : t('auto.Ayol')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auto.Tibbiy tarix')}</label>
                            <textarea
                                value={form.medicalHistory}
                                onChange={e => setForm(f => ({ ...f, medicalHistory: e.target.value }))}
                                rows={2}
                                placeholder={t('auto.Allergiya, surunkali kasalliklar...')}
                                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{t('auto.Bekor')}</Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('auto.Saqlanmoqda...')}</> : t('auto.Saqlash')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
