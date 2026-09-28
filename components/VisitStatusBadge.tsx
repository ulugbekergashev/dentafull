import React from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { VisitStatus } from '../utils/visitStatus';

/** Holat belgisi — jadvalda, shifokor kartasida va bemor kartasida bir xil ko'rinadi */
const STYLE: Record<VisitStatus, { pill: string; dot: string }> = {
    booked: { pill: 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300', dot: 'border-[1.5px] border-dashed border-gray-400 dark:border-gray-500' },
    waiting: { pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
    inChair: { pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-600' },
    awaitingPayment: { pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', dot: 'bg-violet-600' },
    paid: { pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
    debt: { pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
    noShow: { pill: 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500', dot: 'bg-gray-300 dark:bg-gray-600' },
    cancelled: { pill: 'bg-white text-gray-400 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:ring-gray-700', dot: 'bg-gray-200 dark:bg-gray-600' },
};

interface VisitStatusBadgeProps {
    status: VisitStatus;
    /** "Yozilgan" qabul tasdiqlangan bo'lsa yonida belgi */
    confirmed?: boolean;
    className?: string;
}

export const VisitStatusBadge: React.FC<VisitStatusBadgeProps> = ({ status, confirmed, className = '' }) => {
    const { t } = useLanguage();
    const s = STYLE[status];
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${s.pill} ${className}`}>
            <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
            {t(`visit.status.${status}` as any)}
            {status === 'booked' && confirmed && (
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-label={t('visit.confirmed')} />
            )}
        </span>
    );
};
