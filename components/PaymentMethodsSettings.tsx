import React, { useState } from 'react';
import { CheckCircle, CreditCard } from 'lucide-react';
import { Card, Button } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { tLabel } from '../i18n/labels';
import { api } from '../services/api';
import {
    DEFAULT_INCOMING_METHODS, INCOMING_PAYMENT_METHODS, PAYMENT_METHODS, SELECTABLE_PAYMENT_METHODS, PaymentMethod,
} from '../utils/paymentMethods';

const sameAsDefault = (list: PaymentMethod[]) =>
    list.length === DEFAULT_INCOMING_METHODS.length && DEFAULT_INCOMING_METHODS.every(k => list.includes(k));

/**
 * Sozlamalar → Maxsus imkoniyatlar → "To'lov turlari": klinika to'lov oynasida
 * qaysi usullar chiqishini tanlaydi. Sukut ro'yxat saqlanmaydi — sozlama o'chadi
 * va klinika boshqalar kabi ishlayveradi.
 */
export const PaymentMethodsSettings: React.FC<{ clinicId: string }> = ({ clinicId }) => {
    const { t } = useLanguage();
    // Joriy ro'yxat — klinika yuklanganda qo'llangan (sahifaga qaytganda ham eskirmaydi)
    const [selected, setSelected] = useState<PaymentMethod[]>(() => [...INCOMING_PAYMENT_METHODS]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (key: PaymentMethod) => {
        if (key === 'Cash') return; // doim yoqilgan
        setSaved(false);
        setError(null);
        // Tartib doim katalogdagidek — to'lov oynasida ham shunday chiqadi
        setSelected(prev => SELECTABLE_PAYMENT_METHODS.filter(k => (k === key ? !prev.includes(k) : prev.includes(k))));
    };

    const save = async (list: PaymentMethod[]) => {
        if (list.length === 0) {
            setError(t('payMethods.needOne'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await api.clinics.updatePaymentMethods(clinicId, sameAsDefault(list) ? [] : list);
            setSelected([...INCOMING_PAYMENT_METHODS]);
            setSaved(true);
        } catch (e: any) {
            setError(e?.message || t('common.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="p-6">
            <div className="flex items-start gap-4 mb-5">
                <div className="p-3 shrink-0 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400">
                    <CreditCard className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('payMethods.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('payMethods.desc')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SELECTABLE_PAYMENT_METHODS.map(key => {
                    const meta = PAYMENT_METHODS.find(m => m.key === key)!;
                    const on = selected.includes(key);
                    const locked = key === 'Cash';
                    return (
                        <label
                            key={key}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${locked ? 'cursor-default' : 'cursor-pointer'} ${on
                                ? 'border-primary-300 bg-primary-50/60 dark:border-primary-700 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                        >
                            <input
                                type="checkbox"
                                checked={on}
                                disabled={locked}
                                onChange={() => toggle(key)}
                                className="w-5 h-5 shrink-0 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                            />
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                            <span className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white">{tLabel(t, meta.label)}</span>
                        </label>
                    );
                })}
            </div>

            <div className="pt-5 flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => save(selected)} disabled={saving}>
                    {saving ? t('auto.Saqlanmoqda...') : t('common.save')}
                </Button>
                {!sameAsDefault(selected) && (
                    <button
                        type="button"
                        onClick={() => save([...DEFAULT_INCOMING_METHODS])}
                        disabled={saving}
                        className="text-sm font-semibold text-gray-500 hover:text-primary-600 disabled:opacity-50"
                    >
                        {t('payMethods.reset')}
                    </button>
                )}
                {saved && !error && (
                    <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>
                )}
                {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
            </div>
        </Card>
    );
};
