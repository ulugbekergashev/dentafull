import React, { useState, useMemo } from 'react';
import { Modal, Button } from './Common';
import { Patient, Doctor, Transaction, PaymentMethod } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { PaymentPart, balanceUsed, buildPaymentRecords, splitError } from '../utils/paymentSplit';
import { formatDateToISO } from '../utils/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import { tLabel } from '../i18n/labels';
import { PaymentSplitRows } from './PaymentSplitRows';
import { DateField } from './DateField';
import { Plus, Loader2, ChevronDown, X } from 'lucide-react';

/** Bemor profilidagi kabi: id bo'lmasa ham ishlaydi, tanlov nom bo'yicha ketadi */
type ServiceOption = {
    id?: number;
    name: string;
    price: number;
    duration?: number;
    categoryId?: string;
    category?: { id: string; name: string } | null;
};

interface QuickPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    patients: Patient[];
    doctors: Doctor[];
    services: ServiceOption[];
    clinicId: string;
    onAddTransaction: (tx: Omit<Transaction, 'id'>) => Promise<any>;
    presetPatientId?: string;
    presetDoctorId?: string;
    presetService?: string;
    presetAmount?: number;
    presetDate?: string; // Qabul sanasi — isAppointmentPaid shu sana bo'yicha moslashtiradi
    /**
     * O'tgan sanaga to'lov yozish (Exceldan ko'chirish, unutilgan to'lov).
     * Faqat klinika admini uchun — kassir yopilgan kunga orqadan pul yozmasligi kerak.
     * Qabul to'lovida (presetDate) sana qabulniki bo'lib qoladi, aks holda qabul to'lanmagan ko'rinardi.
     */
    canChangeDate?: boolean;
}

const emptyForm = {
    patientId: '', doctorId: '', service: '', amount: '',
    paidAmount: '', debtAmount: '0', discount: '',
    type: 'Cash' as PaymentMethod,
};

const inputCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/30 dark:text-white";
const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

/**
 * To'lov qabul qilish oynasi (Bosh sahifa, Kassa, Moliya).
 * Bemor profilidagi oyna bilan bir xil imkoniyatlar: bir nechta xizmat,
 * chegirma (foiz yoki summa), qisman to'lov va qolgan qarz.
 * Chegirma qo'yish uchun bemor profiliga o'tish shart emas.
 */
export const QuickPaymentModal: React.FC<QuickPaymentModalProps> = ({
    isOpen, onClose, patients, doctors, services, clinicId, onAddTransaction,
    presetPatientId, presetDoctorId, presetService, presetAmount, presetDate, canChangeDate = false,
}) => {
    const { t } = useLanguage();
    const buildPresetForm = () => ({
        ...emptyForm,
        patientId: presetPatientId || '',
        doctorId: presetDoctorId || '',
        service: presetService || '',
        amount: presetAmount ? String(presetAmount) : '',
        paidAmount: presetAmount ? String(presetAmount) : '',
    });
    const [form, setForm] = useState(buildPresetForm);
    const [saving, setSaving] = useState(false);
    const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
    /** Xizmatlar ro'yxati ochiqmi. Yopiq holatda faqat tanlanganlar ko'rinadi. */
    const [servicesOpen, setServicesOpen] = useState(false);
    const [categoryId, setCategoryId] = useState('');
    /** Tanlangan xizmat nomlari va ularning (o'zgartirilishi mumkin bo'lgan) narxlari */
    const [picked, setPicked] = useState<string[]>([]);
    const [prices, setPrices] = useState<Record<string, string>>({});
    /** Asosiy usuldan tashqari usullar (bitta to'lovni bo'lish) */
    const [extras, setExtras] = useState<PaymentPart[]>([]);
    const todayKey = formatDateToISO(new Date());
    const [date, setDate] = useState(presetDate || todayKey);
    const dateEditable = canChangeDate && !presetDate;

    React.useEffect(() => {
        if (!isOpen) return;
        setForm(buildPresetForm());
        setDiscountType('percent');
        setServicesOpen(false);
        setCategoryId('');
        setPicked([]);
        setPrices({});
        setExtras([]);
        setDate(presetDate || formatDateToISO(new Date()));
    }, [isOpen, presetPatientId, presetDoctorId, presetService, presetAmount, presetDate]);

    // Xizmat kategoriyalari ro'yxatning o'zidan olinadi — qo'shimcha prop kerak emas
    const categories = useMemo(() => {
        const map = new Map<string, string>();
        services.forEach(s => {
            const id = s.categoryId || s.category?.id;
            const name = s.category?.name;
            if (id && name && !map.has(id)) map.set(id, name);
        });
        return [...map.entries()].map(([id, name]) => ({ id, name }));
    }, [services]);

    const visibleServices = useMemo(() => (
        categoryId ? services.filter(s => (s.categoryId || s.category?.id) === categoryId) : services
    ), [services, categoryId]);

    /** Qabuldan kelgan tayyor ro'yxat ("nom|narx||...||TOTAL|jami") */
    const presetBreakdown = presetService && presetService.includes('|') && picked.length === 0
        ? presetService.split('||').filter(Boolean).map(i => i.split('|'))
        : null;

    // Tanlangan xizmatlardan "nom|narx||...||TOTAL|jami" matnini va jami summani quradi
    const applyPicked = (names: string[], priceMap: Record<string, string>) => {
        const rows = names.map(n => ({ name: n, price: Number(priceMap[n]) || 0 }));
        const total = rows.reduce((sum, r) => sum + r.price, 0);
        const service = rows.length === 0 ? ''
            : rows.length === 1 ? rows[0].name
                : rows.map(r => `${r.name}|${r.price}`).join('||') + `||TOTAL|${total}`;
        setForm(f => ({
            ...f,
            service,
            amount: rows.length ? String(total) : '',
            paidAmount: rows.length ? String(total) : '',
            debtAmount: '0',
            discount: '',
        }));
    };

    const toggleService = (name: string) => {
        const svc = services.find(s => s.name === name);
        if (!svc) return;
        const names = picked.includes(name) ? picked.filter(n => n !== name) : [...picked, name];
        const priceMap = { ...prices };
        if (names.includes(name)) priceMap[name] = String(svc.price);
        else delete priceMap[name];
        setPicked(names);
        setPrices(priceMap);
        applyPicked(names, priceMap);
    };

    const changePrice = (name: string, value: string) => {
        const priceMap = { ...prices, [name]: value };
        setPrices(priceMap);
        applyPicked(picked, priceMap);
    };

    const baseTotal = Number(form.amount) || 0;
    const discountVal = Number(form.discount) || 0;
    /** Chegirmadan keyingi to'lanishi kerak bo'lgan summa */
    const discountedTotal = discountType === 'percent'
        ? Math.round(baseTotal * (1 - discountVal / 100))
        : Math.max(0, baseTotal - discountVal);

    const setDiscount = (raw: string) => {
        const val = Number(raw) || 0;
        if (val < 0) return;
        if (discountType === 'percent' && val > 100) return;
        const total = discountType === 'percent'
            ? Math.round(baseTotal * (1 - val / 100))
            : Math.max(0, baseTotal - val);
        setForm(f => ({
            ...f,
            discount: raw,
            paidAmount: baseTotal > 0 ? String(total) : f.paidAmount,
            debtAmount: '0',
        }));
    };

    const paidAmount = Number(form.paidAmount) || 0;
    const debtAmount = Number(form.debtAmount) || 0;
    const grandTotal = paidAmount + debtAmount;

    const selectedPatient = patients.find(p => p.id === form.patientId);
    const patientBalance = selectedPatient?.balance || 0;
    const splitProblem = splitError(paidAmount, extras, patientBalance);

    const handleSave = async () => {
        if (grandTotal <= 0 || !form.patientId || splitProblem) return;
        if (balanceUsed(form.type, paidAmount, extras) > patientBalance) {
            alert(t('patients.details.alerts.insufficientBalance'));
            return;
        }
        setSaving(true);
        try {
            const patient = selectedPatient;
            const doctor = doctors.find(d => d.id === form.doctorId);
            const serviceName = form.service || t("auto.To'lov");
            // Chegirma bazada har doim foiz + summa ko'rinishida saqlanadi
            const discountPercent = discountType === 'percent'
                ? discountVal
                : (baseTotal > 0 ? Math.round((discountVal / baseTotal) * 100) : 0);
            const discountAmount = discountType === 'percent'
                ? Math.round(baseTotal * (discountVal / 100))
                : discountVal;
            const common = {
                patientName: patient ? `${patient.lastName} ${patient.firstName}` : '',
                date: dateEditable ? date : (presetDate || todayKey),
                clinicId,
                patientId: form.patientId || undefined,
                doctorId: form.doctorId || undefined,
                doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : undefined,
                discountPercent,
            };

            const records = buildPaymentRecords({
                service: serviceName,
                primaryMethod: form.type,
                paidAmount,
                extras,
                debtAmount,
                discountAmount,
            });
            for (const record of records) {
                await onAddTransaction({ ...common, ...record } as any);
            }
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t("auto.💰 To'lov qo'shish")} className="max-w-lg">
            <div className="space-y-4">
                <div>
                    <label className={labelCls}>{t('auto.Bemor *')}</label>
                    <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} className={inputCls}>
                        <option value="">{t('auto.Bemorni tanlang...')}</option>
                        {patients.map(p => <option key={p.id} value={p.id}>{p.lastName} {p.firstName} — {p.phone}</option>)}
                    </select>
                </div>

                <div>
                    <label className={labelCls}>{t('auto.Shifokor')}</label>
                    <select value={form.doctorId} onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))} className={inputCls}>
                        <option value="">{t('auto.Tanlanmagan (ixtiyoriy)')}</option>
                        {doctors.map(d => <option key={d.id} value={d.id}>{d.lastName} {d.firstName} — {d.specialty}</option>)}
                    </select>
                </div>

                {presetBreakdown ? (
                    /* Qabuldan kelgan tayyor ro'yxat — o'zgartirish shart emas */
                    <div className="rounded-lg border border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-900/10 p-3 space-y-1">
                        {presetBreakdown.map((parts, idx) => parts[0] === 'TOTAL' ? (
                            <div key={idx} className="flex justify-between items-center pt-2 mt-1 border-t border-primary-200 dark:border-primary-800 font-bold text-primary-700 dark:text-primary-300">
                                <span>{t('auto.JAMI')}:</span><span>{parts[1]} UZS</span>
                            </div>
                        ) : (
                            <div key={idx} className="flex justify-between items-center text-sm">
                                <span className="text-gray-700 dark:text-gray-200">{parts[0]}</span>
                                <span className="text-gray-500">{Number(parts[1]).toLocaleString()} UZS</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {categories.length > 0 && (
                            <div>
                                <label className={labelCls}>{t('auto.Kategoriya')}</label>
                                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                                    <option value="">{t('auto.Barcha kategoriyalar')}</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className={labelCls}>
                                {t('auto.Xizmat')}{picked.length > 0 && <span className="ml-1 text-primary-600">({picked.length})</span>}
                            </label>
                            <button
                                type="button"
                                onClick={() => setServicesOpen(v => !v)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:border-primary-400 transition-colors"
                            >
                                <span className="truncate text-left">
                                    {picked.length === 0
                                        ? t('auto.Xizmatni tanlang...')
                                        : t('auto.{n} ta tanlandi').replace('{n}', String(picked.length))}
                                </span>
                                <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${servicesOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Yopiq holatda ham tanlanganlar va narxlari ko'rinib turadi */}
                            {!servicesOpen && picked.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                    {picked.map(name => (
                                        <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50">
                                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-white">{name}</span>
                                            <input
                                                type="number"
                                                value={prices[name] ?? ''}
                                                onChange={e => changePrice(name, e.target.value)}
                                                onWheel={e => e.currentTarget.blur()}
                                                aria-label={`${t('auto.Narx')}: ${name}`}
                                                className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500/30 outline-none"
                                            />
                                            <button type="button" onClick={() => toggleService(name)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {servicesOpen && (
                                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                                    {visibleServices.map((s, i) => {
                                        const checked = picked.includes(s.name);
                                        return (
                                            <div key={s.id ?? i} className={`flex items-center gap-3 px-3 py-2 ${checked ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}>
                                                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleService(s.name)}
                                                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="text-sm text-gray-900 dark:text-white truncate">{s.name}</span>
                                                </label>
                                                {checked ? (
                                                    <input
                                                        type="number"
                                                        value={prices[s.name] ?? ''}
                                                        onChange={e => changePrice(s.name, e.target.value)}
                                                        onWheel={e => e.currentTarget.blur()}
                                                        aria-label={`${t('auto.Narx')}: ${s.name}`}
                                                        className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500/30 outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">{s.price.toLocaleString()} UZS</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div>
                    <label className={labelCls}>{t('auto.Summa (UZS) *')}</label>
                    <input
                        type="number"
                        placeholder="0"
                        value={form.amount}
                        onChange={e => {
                            const total = Number(e.target.value) || 0;
                            setForm(f => ({ ...f, amount: e.target.value, paidAmount: String(total), debtAmount: '0', discount: '' }));
                        }}
                        onWheel={e => e.currentTarget.blur()}
                        className={inputCls}
                    />
                </div>

                {/* ── Chegirma ── */}
                <div>
                    <label className={labelCls}>{t('auto.Chegirma')}</label>
                    <div className="flex gap-2">
                        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                            {(['percent', 'amount'] as const).map(kind => (
                                <button
                                    key={kind}
                                    type="button"
                                    onClick={() => { setDiscountType(kind); setForm(f => ({ ...f, discount: '', paidAmount: String(baseTotal || 0), debtAmount: '0' })); }}
                                    className={`px-3 py-2 text-sm font-medium transition-colors ${discountType === kind
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                >
                                    {kind === 'percent' ? t('auto.Foiz (%)') : t('auto.Summa')}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            min="0"
                            max={discountType === 'percent' ? 100 : undefined}
                            value={form.discount}
                            onChange={e => setDiscount(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0"
                            className={`${inputCls} flex-1`}
                        />
                    </div>
                    {discountVal > 0 && baseTotal > 0 && (
                        <div className="mt-2 p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-200">
                            {t('auto.Chegirma summasi')}: <strong>{(baseTotal - discountedTotal).toLocaleString()} UZS</strong>
                            {' '}({discountType === 'percent' ? `${discountVal}%` : `${Math.round((discountVal / baseTotal) * 100)}%`})
                        </div>
                    )}
                </div>

                {/* ── To'langan va qolgan qarz ── */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>{t("auto.To'lanayotgan Summa")}</label>
                        <input
                            type="number"
                            value={form.paidAmount}
                            onChange={e => {
                                const paid = Number(e.target.value) || 0;
                                setForm(f => ({
                                    ...f,
                                    paidAmount: e.target.value,
                                    debtAmount: discountedTotal > 0 ? String(Math.max(0, discountedTotal - paid)) : f.debtAmount,
                                }));
                            }}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0.00"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>{t('auto.Qolgan Qarzdorlik')}</label>
                        <input
                            type="number"
                            value={form.debtAmount}
                            onChange={e => {
                                const debt = Number(e.target.value) || 0;
                                setForm(f => ({
                                    ...f,
                                    debtAmount: e.target.value,
                                    paidAmount: discountedTotal > 0 ? String(Math.max(0, discountedTotal - debt)) : f.paidAmount,
                                }));
                            }}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0.00"
                            className={inputCls}
                        />
                    </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{t('auto.Jami Summa')}:</span>
                    <span className="text-gray-900 dark:text-white font-bold text-lg">{grandTotal.toLocaleString()} UZS</span>
                </div>

                <div>
                    <label className={labelCls}>{t("auto.To'lov usuli")}</label>
                    <div className="flex gap-2 flex-wrap">
                        {[...INCOMING_PAYMENT_METHODS, 'Balance' as PaymentMethod].map(type => (
                            <button
                                key={type}
                                onClick={() => setForm(f => ({ ...f, type }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${form.type === type
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                            >
                                {tLabel(t, getPaymentMethodLabel(type))}
                            </button>
                        ))}
                    </div>
                    {form.type === 'Balance' && (
                        <p className="mt-1.5 text-xs text-gray-500">
                            {t("auto.Avansdagi mablag'")}: <strong>{patientBalance.toLocaleString()} UZS</strong>
                        </p>
                    )}
                    <PaymentSplitRows
                        paidAmount={paidAmount}
                        primaryMethod={form.type}
                        extras={extras}
                        onChange={setExtras}
                        methods={patientBalance > 0 ? [...INCOMING_PAYMENT_METHODS, 'Balance'] : INCOMING_PAYMENT_METHODS}
                        balance={patientBalance}
                    />
                </div>

                {dateEditable && (
                    <DateField
                        label={t('payment.date')}
                        value={date}
                        onChange={setDate}
                        max={todayKey}
                        required
                        helperText={date !== todayKey ? t('payment.dateHint') : undefined}
                    />
                )}

                <div className="flex gap-2 pt-2">
                    <Button variant="secondary" className="flex-1" onClick={onClose}>{t('auto.Bekor')}</Button>
                    <button
                        disabled={saving || grandTotal <= 0 || !form.patientId || !!splitProblem}
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-success hover:bg-success-700 disabled:bg-success/50 disabled:cursor-not-allowed transition-all"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {t('auto.Saqlash')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
