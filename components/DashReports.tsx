import React from 'react';
import { BarChart3, ChevronRight } from 'lucide-react';
import { Card } from './Common';
import { useLanguage } from '../context/LanguageContext';

export interface ReportItem {
    key: string;
    label: string;
    value: React.ReactNode;
    unit?: string;
    hint?: React.ReactNode;
    /** Asosiy ko'rsatkich (daromad) — yashil rangda */
    accent?: boolean;
}

interface DashReportsProps {
    /** Yuqoridagi davr tanlovi: "Bugun", "Shu oy" yoki oraliq */
    periodLabel: string;
    items: ReportItem[];
    /** Moliya → Hisobot. Ruxsat bo'lmasa berilmaydi */
    onOpenFull?: () => void;
    /** Qo'shimcha hisobotlar (shifokorda — grafiklar) */
    children?: React.ReactNode;
}

// Kataklar soniga qarab ustunlar — qatorda bo'sh katak qolmasin
const COLS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
};

/**
 * "Hisobotlar" — bosh sahifaning eng pastida. Ilgari bu raqamlar tepada 4–6 ta katta
 * kartada turib, kunlik ishni (navbat, to'lovlar) pastga surib qo'yardi. Endi ular
 * bitta ixcham qatorda, batafsili — Moliya → Hisobot da.
 */
export const DashReports: React.FC<DashReportsProps> = ({ periodLabel, items, onOpenFull, children }) => {
    const { t } = useLanguage();
    if (items.length === 0 && !children) return null;
    return (
        <section aria-labelledby="dash-reports-title" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 id="dash-reports-title" className="flex items-center gap-2 min-w-0 text-lg font-black text-gray-900 dark:text-white">
                    <BarChart3 className="w-5 h-5 shrink-0 text-gray-400" />
                    {t('dashboard.reports.title')}
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400 truncate">{periodLabel}</span>
                </h2>
                {onOpenFull && (
                    <button
                        type="button"
                        onClick={onOpenFull}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
                    >
                        {t('dashboard.reports.full')} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {items.length > 0 && (
                <Card className="rounded-[2rem] overflow-hidden">
                    <dl className={`grid gap-px bg-gray-100 dark:bg-gray-700/60 ${COLS[Math.min(items.length, 4)]}`}>
                        {items.map(item => (
                            <div key={item.key} className="bg-white dark:bg-gray-800 px-5 py-4 min-w-0">
                                <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400 truncate">{item.label}</dt>
                                <dd className="mt-1 flex items-baseline gap-1 min-w-0">
                                    <span className={`text-2xl font-black tabular-nums truncate ${item.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{item.value}</span>
                                    {item.unit && <span className="text-xs font-bold text-gray-400">{item.unit}</span>}
                                </dd>
                                {item.hint && <dd className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{item.hint}</dd>}
                            </div>
                        ))}
                    </dl>
                </Card>
            )}

            {children}
        </section>
    );
};
