import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO, formatDobDDMMYYYY } from '../utils/dateUtils';

// Brauzerning <input type="date"> maydoni sanani kompyuter tiliga qarab
// ko'rsatadi (ko'pincha 09/23/2026). Klinikalarda odat — 23.09.2026, shuning
// uchun sana shu yerda o'zimiz chizgan maydon va oylik kalendar orqali kiritiladi.

const MONTHS = {
    uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};
// Hafta dushanbadan boshlanadi
const WEEKDAYS_SHORT = {
    uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};
// Date.getDay() tartibida (yakshanbadan)
const WEEKDAYS_FULL = {
    uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
    ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
};

const langOf = (language: string): 'uz' | 'ru' => (language === 'ru' ? 'ru' : 'uz');

export const weekdayName = (date: Date, language: string): string => WEEKDAYS_FULL[langOf(language)][date.getDay()];

/** "23.09" yoki "23.09.2026" — Date obyektidan, zona siljishisiz */
export const formatDayMonth = (date: Date, withYear = true): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return withYear ? `${dd}.${mm}.${date.getFullYear()}` : `${dd}.${mm}`;
};

/** "23.09.2026" → "2026-09-23". Mavjud bo'lmagan sana (31.02) uchun null. */
export function parseDDMMYYYY(text: string): string | null {
    const m = text.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!m) return null;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return formatDateToISO(date);
}

/** Yozilayotgan raqamlarga nuqtalarni o'zi qo'yadi: "23092026" → "23.09.2026" */
const maskDigits = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
};

const firstOfMonth = (iso: string): Date => {
    const [y, m] = (iso || formatDateToISO(new Date())).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
};

interface MonthGridProps {
    value: string;
    onPick: (iso: string) => void;
    /** Kun bo'yicha son (masalan qabullar) — katak ostida kichik nishon bo'lib chiqadi */
    counts?: Record<string, number>;
    min?: string;
    max?: string;
}

/** Oylik kalendar: dushanbadan boshlanadigan 7 ustunli jadval */
export const MonthGrid: React.FC<MonthGridProps> = ({ value, onPick, counts, min, max }) => {
    const { t, language } = useLanguage();
    const lang = langOf(language);
    const [month, setMonth] = useState(() => firstOfMonth(value));
    useEffect(() => { setMonth(firstOfMonth(value)); }, [value]);

    const todayKey = formatDateToISO(new Date());
    const offset = (month.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = [
        ...Array(offset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => formatDateToISO(new Date(month.getFullYear(), month.getMonth(), i + 1))),
    ];
    const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" aria-label={t('datefield.prevMonth')}>
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{MONTHS[lang][month.getMonth()]} {month.getFullYear()}</p>
                <button type="button" onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" aria-label={t('datefield.nextMonth')}>
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS_SHORT[lang].map(w => <div key={w} className="text-[11px] font-semibold text-gray-400 py-1">{w}</div>)}
                {cells.map((key, i) => {
                    if (!key) return <div key={`e${i}`} />;
                    const count = counts?.[key] || 0;
                    const selected = key === value;
                    const isToday = key === todayKey;
                    const disabled = (!!min && key < min) || (!!max && key > max);
                    return (
                        <button
                            type="button"
                            key={key}
                            disabled={disabled}
                            onClick={() => onPick(key)}
                            className={`h-9 rounded-lg text-sm flex flex-col items-center justify-center leading-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${selected
                                ? 'bg-primary-600 text-white'
                                : isToday
                                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-bold'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            {Number(key.slice(8))}
                            {count > 0 && (
                                <span className={`mt-0.5 text-[9px] font-bold ${selected ? 'text-white/90' : 'text-primary-500'}`}>{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

interface DatePopoverProps {
    anchorRef: React.RefObject<HTMLElement>;
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 340;

/**
 * Ochiladigan oyna — body'ga portal orqali chiziladi. Modal tanasi
 * `overflow-y-auto` bo'lgani uchun oddiy absolute blok uning ichida kesilib qolardi.
 */
export const DatePopover: React.FC<DatePopoverProps> = ({ anchorRef, open, onClose, children }) => {
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (!rect) return;
            const below = rect.bottom + 4;
            const top = below + POPOVER_HEIGHT > window.innerHeight && rect.top - POPOVER_HEIGHT - 4 > 0
                ? rect.top - POPOVER_HEIGHT - 4
                : below;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
            setPos({ top, left });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, anchorRef]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose, anchorRef]);

    if (!open || !pos) return null;
    return createPortal(
        <div
            ref={popRef}
            style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            className="fixed z-[70] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3"
        >
            {children}
        </div>,
        document.body
    );
};

interface DateFieldProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    counts?: Record<string, number>;
    min?: string;
    max?: string;
    required?: boolean;
    className?: string;
    helperText?: string;
}

/**
 * Sana maydoni: 23.09.2026 ko'rinishida yoziladi yoki oylik kalendardan tanlanadi.
 * Qiymat tashqarida odatdagidek "YYYY-MM-DD" bo'lib qoladi.
 */
export const DateField: React.FC<DateFieldProps> = ({ value, onChange, label, counts, min, max, required, className = 'w-full', helperText }) => {
    const { t } = useLanguage();
    const anchorRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(formatDobDDMMYYYY(value));
    useEffect(() => { setText(formatDobDDMMYYYY(value)); }, [value]);

    const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

    const handleType = (raw: string) => {
        const masked = maskDigits(raw);
        setText(masked);
        if (!masked) { if (!required) onChange(''); return; }
        const iso = parseDDMMYYYY(masked);
        if (iso && inRange(iso)) onChange(iso);
    };

    // Chala yoki noto'g'ri yozilgan sana — oxirgi to'g'ri qiymatga qaytadi
    const handleBlur = () => {
        const iso = parseDDMMYYYY(text);
        if (!iso || !inRange(iso)) setText(formatDobDDMMYYYY(value));
    };

    const pick = (iso: string) => { onChange(iso); setOpen(false); };
    const todayKey = formatDateToISO(new Date());

    return (
        <div className={className}>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
            <div ref={anchorRef} className="relative">
                <input
                    type="text"
                    inputMode="numeric"
                    value={text}
                    placeholder={t('datefield.placeholder')}
                    onChange={e => handleType(e.target.value)}
                    onBlur={handleBlur}
                    onClick={() => setOpen(true)}
                    required={required}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-transparent pl-3 pr-10 py-2 text-sm tabular-nums placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:border-gray-700 dark:text-white"
                />
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="absolute right-1 top-1 h-8 w-8 flex items-center justify-center rounded-md text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label={t('datefield.openCalendar')}
                >
                    <CalendarIcon className="w-4 h-4" />
                </button>
            </div>
            {helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
            <DatePopover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)}>
                <MonthGrid value={value} onPick={pick} counts={counts} min={min} max={max} />
                {inRange(todayKey) && (
                    <button type="button" onClick={() => pick(todayKey)} className="mt-2 w-full py-1.5 rounded-lg text-xs font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                        {t('datefield.today')}
                    </button>
                )}
            </DatePopover>
        </div>
    );
};
