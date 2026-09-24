import React from 'react';
import { Plus, X } from 'lucide-react';
import { PaymentMethod } from '../types';
import { getPaymentMethodLabel } from '../utils/paymentMethods';
import { MAX_EXTRA_PARTS, PaymentPart, primaryShare, splitError } from '../utils/paymentSplit';
import { useLanguage } from '../context/LanguageContext';
import { tLabel } from '../i18n/labels';

interface PaymentSplitRowsProps {
    /** Hozir to'lanayotgan summa (qarzsiz) */
    paidAmount: number;
    primaryMethod: PaymentMethod;
    extras: PaymentPart[];
    onChange: (extras: PaymentPart[]) => void;
    /** Qo'shimcha qatorlarda tanlash mumkin bo'lgan usullar */
    methods: PaymentMethod[];
    /** Bemor avansidagi mablag' — "Hisobdan" qismini tekshirish uchun */
    balance?: number;
}

/**
 * To'lov oynasidagi "+ Boshqa usul" havolasi va qo'shimcha usul qatorlari.
 * Sukut bo'yicha faqat havola ko'rinadi — bitta usul bilan to'laydigan
 * klinika uchun oyna avvalgidek qoladi. Asosiy usulga qolgan summa o'zi hisoblanadi.
 */
export const PaymentSplitRows: React.FC<PaymentSplitRowsProps> = ({ paidAmount, primaryMethod, extras, onChange, methods, balance = 0 }) => {
    const { t } = useLanguage();
    const label = (m: PaymentMethod) => tLabel(t, getPaymentMethodLabel(m));
    const error = splitError(paidAmount, extras, balance);

    const add = () => {
        const used = new Set<PaymentMethod>([primaryMethod, ...extras.map(p => p.method)]);
        const method = methods.find(m => !used.has(m)) || methods[0];
        onChange([...extras, { method, amount: 0 }]);
    };
    const update = (i: number, patch: Partial<PaymentPart>) =>
        onChange(extras.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const remove = (i: number) => onChange(extras.filter((_, idx) => idx !== i));

    return (
        <div>
            {extras.length > 0 && (
                <div className="mt-2 space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                    <div className="flex items-center justify-between px-1 text-sm">
                        <span className="text-gray-600 dark:text-gray-300">{label(primaryMethod)}</span>
                        <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{Math.max(0, primaryShare(paidAmount, extras)).toLocaleString()} UZS</span>
                    </div>
                    {extras.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <select
                                value={p.method}
                                onChange={e => update(i, { method: e.target.value as PaymentMethod })}
                                aria-label={t('payment.split.method')}
                                className="flex-1 min-w-0 h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm dark:text-white focus:ring-2 focus:ring-primary-500/30 outline-none"
                            >
                                {methods.map(m => <option key={m} value={m}>{label(m)}</option>)}
                            </select>
                            <input
                                type="number"
                                min="0"
                                value={p.amount || ''}
                                onChange={e => update(i, { amount: Number(e.target.value) || 0 })}
                                onWheel={e => e.currentTarget.blur()}
                                placeholder={t('payment.split.amount')}
                                aria-label={t('payment.split.amount')}
                                className="w-32 h-9 px-2 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500/30 outline-none"
                            />
                            <button type="button" onClick={() => remove(i)} className="p-1.5 text-gray-400 hover:text-red-500 rounded" aria-label={t('payment.split.remove')}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {error && <p className="px-1 text-xs text-red-500">{t(`payment.split.error.${error}` as const)}</p>}
                </div>
            )}
            {paidAmount > 0 && extras.length < MAX_EXTRA_PARTS && (
                <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
                    <Plus className="w-3.5 h-3.5" /> {t('payment.split.add')}
                </button>
            )}
        </div>
    );
};
