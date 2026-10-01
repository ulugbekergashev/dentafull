import React, { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Bosh sahifa kartalarini yig'ib qo'yish. Klinikalar so'radi: shifokor va
 * resepshnni ro'yxatlar chalg'itmasin — sarlavha va soni ko'rinib tursin,
 * bemorlar esa faqat "Ko'rsatish" bosilganda chiqsin.
 *
 * Tanlov shu brauzerda eslab qolinadi (har bir karta alohida). Saqlab
 * bo'lmasa (maxfiy oyna va h.k.) — standart holat ishlatiladi.
 */
const storageKey = (key: string) => `dentacrm:collapsed:${key}`;

export function useCollapsed(key: string, defaultCollapsed = true): [boolean, () => void] {
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(storageKey(key));
            return v === null ? defaultCollapsed : v === '1';
        } catch {
            return defaultCollapsed;
        }
    });
    const toggle = useCallback(() => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(storageKey(key), next ? '1' : '0'); } catch { /* saqlanmasa ham ishlayveradi */ }
            return next;
        });
    }, [key]);
    return [collapsed, toggle];
}

export const CollapseToggle: React.FC<{ collapsed: boolean; onToggle: () => void; className?: string }> = ({ collapsed, onToggle, className = '' }) => {
    const { t } = useLanguage();
    const label = collapsed ? t('collapse.show') : t('collapse.hide');
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={label}
            title={label}
            className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-400 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors ${className}`}
        >
            <span className="hidden sm:inline">{label}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
    );
};
