import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { isSupportApiError } from '../../services/supportAdmin';

// ─── Yordam boti paneli: umumiy bo'laklar ────────────────────────────────────
// Beshta bo'limning hammasi shu yerdagi so'rov ilgagi, holat bloklari
// (yuklanmoqda / xato / bo'sh) va kichik boshqaruv elementlaridan foydalanadi.

// ─── Manzil holati ───────────────────────────────────────────────────────────

/**
 * Ichki bo'lim, ochiq murojaat va ochiq maqola manzilda turadi
 * (`?tab=support&view=tickets&ticket=...`): brauzerning "orqaga" tugmasi
 * suhbatni yopadi va aniq murojaatga havola yuborsa bo'ladi. Superadmin
 * sahifasining o'zi ham bo'limni shu tarzda saqlaydi (`?tab=`).
 */
export function useSupportUrl() {
    const [searchParams, setSearchParams] = useSearchParams();

    const update = useCallback((patch: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(patch).forEach(([name, value]) => {
                if (value) next.set(name, value);
                else next.delete(name);
            });
            return next;
        });
    }, [setSearchParams]);

    const get = (name: string): string => searchParams.get(name) || '';

    return { get, update };
}

// ─── So'rov ilgagi ───────────────────────────────────────────────────────────

interface QueryState<T> {
    data: T | null;
    error: unknown;
    isLoading: boolean;
}

/**
 * Ma'lumotni yuklaydi va `deps` o'zgarganda qayta yuklaydi. Eski so'rov bekor
 * qilinadi — filtr tez almashtirilganda kechikkan javob yangisining ustiga
 * yozilmaydi. Qayta yuklash paytida oldingi ma'lumot ekranda qoladi.
 */
export function useSupportQuery<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]) {
    const [state, setState] = useState<QueryState<T>>({ data: null, error: null, isLoading: true });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setState(prev => ({ data: prev.data, error: null, isLoading: true }));
        load(controller.signal)
            .then(data => {
                if (!controller.signal.aborted) setState({ data, error: null, isLoading: false });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setState({ data: null, error, isLoading: false });
            });
        return () => controller.abort();
        // `load` har renderda yangi funksiya — qayta yuklashni faqat `deps` boshqaradi
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, attempt]);

    const reload = useCallback(() => setAttempt(count => count + 1), []);

    return { ...state, reload };
}

// ─── Xato matni ──────────────────────────────────────────────────────────────

export function useSupportErrorText() {
    const { t } = useLanguage();

    return (error: unknown): string => {
        if (!isSupportApiError(error)) return t('auto.Xatolik yuz berdi');
        if (error.kind === 'network') return t("auto.Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.");
        if (error.kind === 'session') return t('auto.Kirish muddati tugadi. Qaytadan kiring.');
        if (error.kind === 'demo') return t('auto.Demo rejimida bu amal mavjud emas');
        // Server o'z matnini bergan bo'lsa — aynan shuni ko'rsatamiz
        if (error.message) return error.message;
        if (error.status === 404) return t("auto.Serverda bu bo'lim topilmadi. Server hali yangilanmagan bo'lishi mumkin.");
        return t("auto.Serverda xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.");
    };
}

// ─── Holat bloklari ──────────────────────────────────────────────────────────

export const LoadingBlock: React.FC<{ className?: string }> = ({ className = 'py-14' }) => {
    const { t } = useLanguage();
    return (
        <div className={`flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 ${className}`} role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('auto.Yuklanmoqda...')}
        </div>
    );
};

export const ErrorBlock: React.FC<{ error: unknown; onRetry?: () => void; className?: string }> = ({ error, onRetry, className = 'py-10' }) => {
    const { t } = useLanguage();
    const errorText = useSupportErrorText();
    return (
        <div className={`flex flex-col items-center gap-3 px-4 text-center ${className}`} role="alert">
            <div className="p-3 rounded-full bg-red-50 dark:bg-red-900/30">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="max-w-md text-sm text-gray-700 dark:text-gray-200">{errorText(error)}</p>
            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {t('auto.Qayta urinish')}
                </Button>
            )}
        </div>
    );
};

/** Amal (saqlash, yopish) bajarilmaganda tugma yonida chiqadigan bir qatorli xato */
export const InlineError: React.FC<{ error: unknown; className?: string }> = ({ error, className = '' }) => {
    const errorText = useSupportErrorText();
    if (!error) return null;
    return (
        <p className={`flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400 ${className}`} role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {typeof error === 'string' ? error : errorText(error)}
        </p>
    );
};

export const EmptyBlock: React.FC<{ icon: LucideIcon; title: string; hint?: string; className?: string; children?: React.ReactNode }> = ({
    icon: Icon, title, hint, className = 'py-12', children,
}) => (
    <div className={`flex flex-col items-center gap-2 px-4 text-center ${className}`}>
        <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-700/60">
            <Icon className="w-5 h-5 text-gray-400 dark:text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</p>
        {hint && <p className="max-w-md text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        {children}
    </div>
);

// ─── Kichik elementlar ───────────────────────────────────────────────────────

export type PillTone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const PILL_TONES: Record<PillTone, string> = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    blue: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

export const Pill: React.FC<{ tone?: PillTone; className?: string; children: React.ReactNode }> = ({ tone = 'gray', className = '', children }) => (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${PILL_TONES[tone]} ${className}`}>
        {children}
    </span>
);

/** Superadmin sahifasidagi sana oralig'i tugmalari bilan bir xil ko'rinish */
export function ChoiceButtons<T extends string | number>({ value, options, onChange, ariaLabel }: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
    ariaLabel?: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ariaLabel}>
            {options.map(option => (
                <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={option.value === value}
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${option.value === value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }> = ({
    checked, onChange, label, disabled = false,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 ${checked
            ? 'bg-primary-600'
            : 'bg-gray-300 dark:bg-gray-600'}`}
    >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
);

export const fieldCls = 'h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary-500';
export const areaCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm leading-relaxed text-gray-800 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary-500';
export const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
export const hintCls = 'mt-1 text-xs text-gray-500 dark:text-gray-400';

// ─── Sana va vaqt ────────────────────────────────────────────────────────────
// Ilovaning qolgan qismi kabi kun.oy.yil tartibida ('ru-RU' — til emas, format).

const parseDate = (iso?: string | null): Date | null => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** 12.10, 14:05 */
export const formatWhen = (iso?: string | null): string => {
    const date = parseDate(iso);
    return date ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
};

/** 12.10.2026 */
export const formatDay = (iso?: string | null): string => {
    const date = parseDate(iso);
    return date ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
};

/** 14:05 */
export const formatTime = (iso?: string | null): string => {
    const date = parseDate(iso);
    return date ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
};

/** Bugungi yozuvda faqat soat, eskisida — sana */
export const formatRecent = (iso?: string | null): string => {
    const date = parseDate(iso);
    if (!date) return '—';
    return date.toDateString() === new Date().toDateString() ? formatTime(iso) : formatWhen(iso);
};

export const percent = (share: number): number => Math.round(Math.min(1, Math.max(0, share)) * 100);
