import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Patient } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { searchPatients } from '../utils/patientSearch';
import { formatDobDDMMYYYY } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';

interface PatientQuickSearchProps {
    patients: Patient[];
    onOpen: (patientId: string) => void;
    /** Yangi bemor qo'shish — qidiruv matni formaga o'tadi */
    onAddNew: (query: string) => void;
    showPhone?: boolean;
}

/**
 * Bosh sahifadagi "Bemor qo'shish" o'rnida: avval qidiriladi, topilmasa shu
 * yerning o'zidan yangi bemor qo'shiladi. Qadam qo'shilmaydi — yozilgan ism
 * yoki telefon formaga tayyor bo'lib o'tadi, takror bemor esa oldindan ko'rinadi.
 */
export const PatientQuickSearch: React.FC<PatientQuickSearchProps> = ({ patients, onOpen, onAddNew, showPhone = true }) => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const boxRef = useRef<HTMLDivElement>(null);

    const results = useMemo(() => searchPatients(patients, query), [patients, query]);
    // Oxirgi qator — "Yangi bemor"; klaviatura bilan unga ham o'tiladi
    const itemCount = results.length + 1;
    useEffect(() => { setActive(0); }, [query]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const choose = (index: number) => {
        if (index < results.length) onOpen(results[index].id);
        else onAddNew(query);
        setOpen(false);
        setQuery('');
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => (a + 1) % itemCount); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + itemCount) % itemCount); }
        else if (e.key === 'Enter' && query.trim()) { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape') setOpen(false);
    };

    const showList = open && query.trim().length > 0;

    return (
        <div ref={boxRef} className="relative">
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm focus-within:ring-2 focus-within:ring-primary-500/30">
                <Search className="w-3.5 h-3.5 text-gray-400 ml-2.5 shrink-0" />
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={t('patientSearch.placeholder')}
                    aria-label={t('patientSearch.placeholder')}
                    className="w-40 sm:w-52 bg-transparent border-none px-2 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 outline-none"
                />
                <button
                    type="button"
                    onClick={() => choose(results.length)}
                    title={t('dashboard.quickPatient')}
                    aria-label={t('dashboard.quickPatient')}
                    className="m-0.5 flex items-center gap-1 px-2.5 py-1.5 bg-primary hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                    <UserPlus className="w-3.5 h-3.5" />
                </button>
            </div>

            {showList && (
                <div className="absolute right-0 lg:left-0 top-full mt-1.5 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
                    {results.length === 0 && (
                        <p className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{t('patientSearch.notFound')}</p>
                    )}
                    {results.map((p, i) => (
                        <button
                            key={p.id}
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => choose(i)}
                            className={`w-full text-left px-3 py-2 ${active === i ? 'bg-gray-50 dark:bg-gray-700/60' : ''}`}
                        >
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.lastName} {p.firstName}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate tabular-nums">
                                {[showPhone ? p.phone : maskPhone(p.phone), formatDobDDMMYYYY(p.dob)].filter(Boolean).join(' · ') || '—'}
                            </p>
                        </button>
                    ))}
                    <button
                        type="button"
                        onMouseEnter={() => setActive(results.length)}
                        onClick={() => choose(results.length)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 text-left text-sm font-semibold text-primary-600 dark:text-primary-400 ${active === results.length ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                    >
                        <UserPlus className="w-4 h-4 shrink-0" />
                        <span className="truncate">{t('patientSearch.addNew')}: «{query.trim()}»</span>
                    </button>
                </div>
            )}
        </div>
    );
};
