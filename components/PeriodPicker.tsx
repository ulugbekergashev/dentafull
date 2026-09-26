import React, { useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { DatePopover, MonthGrid } from './DateField';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO, getCurrentMonthRange } from '../utils/dateUtils';

export type PeriodKey = 'today' | 'yesterday' | 'month' | 'custom';

/** Tanlangan davr: from/to — "YYYY-MM-DD", ikkalasi ham kiradi */
export interface Period {
    key: PeriodKey;
    from: string;
    to: string;
}

const addDays = (iso: string, n: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    return formatDateToISO(new Date(y, m - 1, d + n));
};

/** Tayyor tanlovning sanalari. "Shu oy" — oyning 1-kunidan bugungacha. */
export function periodOf(key: Exclude<PeriodKey, 'custom'>, today: string = formatDateToISO(new Date())): Period {
    if (key === 'yesterday') {
        const day = addDays(today, -1);
        return { key, from: day, to: day };
    }
    if (key === 'month') {
        const { startDate, endDate } = getCurrentMonthRange();
        return { key, from: startDate, to: endDate };
    }
    return { key, from: today, to: today };
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const ddmmyyyy = (iso: string) => `${ddmm(iso)}.${iso.slice(0, 4)}`;

/** "25.09.2026" (bir kun) yoki "12.09 — 20.09" (yil boshqa bo'lsa — to'liq sana) */
export function formatPeriodRange(from: string, to: string): string {
    if (from === to) return ddmmyyyy(from);
    return from.slice(0, 4) === to.slice(0, 4) ? `${ddmm(from)} — ${ddmm(to)}` : `${ddmmyyyy(from)} — ${ddmmyyyy(to)}`;
}

interface PeriodPickerProps {
    value: Period;
    onChange: (period: Period) => void;
    /** Kalendar kataklari ostidagi son (masalan qabullar) — kerakli kunni topish oson bo'lsin */
    counts?: Record<string, number>;
}

/**
 * Bosh sahifa davri: Bugun · Kecha · Shu oy · Boshqa muddat.
 * "Boshqa muddat" — kalendarda ikki kun bosiladi: boshlanishi va tugashi
 * (bitta kun uchun o'sha kunni ikki marta).
 */
export const PeriodPicker: React.FC<PeriodPickerProps> = ({ value, onChange, counts }) => {
    const { t } = useLanguage();
    const customRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    /** Oraliqning birinchi bosilgan kuni — ikkinchisi kutilmoqda */
    const [pendingFrom, setPendingFrom] = useState<string | null>(null);

    const close = () => {
        setOpen(false);
        setPendingFrom(null);
    };
    const pick = (key: Exclude<PeriodKey, 'custom'>) => {
        close();
        onChange(periodOf(key));
    };
    const pickDay = (iso: string) => {
        if (!pendingFrom) {
            setPendingFrom(iso);
            return;
        }
        const [from, to] = iso < pendingFrom ? [iso, pendingFrom] : [pendingFrom, iso];
        close();
        onChange({ key: 'custom', from, to });
    };

    const tab = (on: boolean) => `shrink-0 h-9 px-2.5 sm:px-3.5 rounded-xl text-[12px] sm:text-[13px] font-bold whitespace-nowrap transition-colors ${on
        ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-600/25'
        : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`;

    return (
        <div
            role="radiogroup"
            aria-label={t('dashboard.period')}
            className="flex items-center gap-1 p-1 max-w-full overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 [scrollbar-width:none]"
        >
            {(['today', 'yesterday', 'month'] as const).map(k => (
                <button key={k} type="button" role="radio" aria-checked={value.key === k} onClick={() => pick(k)} className={tab(value.key === k)}>
                    {t(`dashboard.period.${k}` as any)}
                </button>
            ))}
            <button
                ref={customRef}
                type="button"
                role="radio"
                aria-checked={value.key === 'custom'}
                aria-expanded={open}
                onClick={() => (open ? close() : setOpen(true))}
                className={`${tab(value.key === 'custom')} flex items-center gap-1.5 tabular-nums`}
            >
                {/* Telefonda belgi yashirinadi — to'rtala tanlov bir qatorga sig'sin */}
                <CalendarRange className="hidden sm:block w-4 h-4" />
                {value.key === 'custom' ? formatPeriodRange(value.from, value.to) : t('dashboard.period.custom')}
            </button>
            <DatePopover anchorRef={customRef} open={open} onClose={close}>
                <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {pendingFrom ? t('dashboard.period.pickEnd') : t('dashboard.period.pickStart')}
                </p>
                <MonthGrid
                    value={pendingFrom || value.to}
                    onPick={pickDay}
                    counts={counts}
                    rangeFrom={pendingFrom || value.from}
                    rangeTo={pendingFrom ? undefined : value.to}
                />
            </DatePopover>
        </div>
    );
};
