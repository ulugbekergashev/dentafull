import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { Expense, ExpenseCategory } from '../types';
import {
    ExpenseSuggestion, collectExpenseSuggestions, filterExpenseSuggestions,
    hideExpenseTitle, loadHiddenExpenseTitles,
} from '../utils/expenseSuggestions';

type Props = {
    expenses: Expense[];
    categories: readonly ExpenseCategory[];
    clinicId: string;
    /** "Nomi" maydonida hozir yozilgan matn */
    query: string;
    onPick: (suggestion: ExpenseSuggestion) => void;
};

/** "Nomi" ostida avval yozilgan xarajat nomlari — bosilsa nom, kategoriya va oxirgi summa qo'yiladi */
export function ExpenseTitleSuggestions({ expenses, categories, clinicId, query, onPick }: Props) {
    const { t } = useLanguage();
    const [hidden, setHidden] = useState(() => loadHiddenExpenseTitles(clinicId));
    const all = useMemo(() => collectExpenseSuggestions(expenses, categories), [expenses, categories]);
    const shown = filterExpenseSuggestions(all, query, hidden);

    if (shown.length === 0) return null;

    return (
        <div className="-mt-2">
            <p className="text-[11px] text-gray-400 mb-1.5">{t('auto.Avval yozilganlar — bosing:')}</p>
            <div className="flex flex-wrap gap-1.5">
                {shown.map(s => (
                    <span
                        key={s.key}
                        className="group inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-red-400 transition-colors"
                    >
                        <button
                            type="button"
                            onClick={() => onPick(s)}
                            className="pl-3 pr-1.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 max-w-[180px] truncate"
                            title={s.title}
                        >
                            {s.title}
                        </button>
                        <button
                            type="button"
                            onClick={() => setHidden(h => hideExpenseTitle(clinicId, h, s.key))}
                            className="pr-2 pl-0.5 py-1 text-gray-300 hover:text-red-500 transition-colors"
                            aria-label={t("auto.Ro'yxatdan olib tashlash")}
                            title={t("auto.Ro'yxatdan olib tashlash")}
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
}
