import React, { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, Check, Building2 } from 'lucide-react';
import { Branch } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface BranchSwitcherProps {
  branches: Branch[];
  activeBranchId: string | null;
  onChange: (id: string | null) => void;
  /** Mobil yon menyuda to'liq kenglikda, sarlavhada ixcham. */
  variant?: 'header' | 'sidebar';
}

/**
 * Sarlavhadagi filial tanlagichi. Klinikada filial bo'lmasa umuman
 * ko'rinmaydi — bitta manzilda ishlaydigan klinika buni sezmasligi kerak.
 *
 * "Butun klinika" alohida band: hisobotlarni barcha filiallar bo'yicha
 * ko'rish uchun. Filial tanlanganda ro'yxatlar, kalendar va moliya faqat
 * shu filial yozuvlarini ko'rsatadi, yangi yozuvlar esa shu filialga yoziladi.
 */
export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ branches, activeBranchId, onChange, variant = 'header' }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (branches.length === 0) return null;

  const active = activeBranchId ? branches.find(b => b.id === activeBranchId) : undefined;
  const label = active ? active.name : t('branches.whole');

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const isSidebar = variant === 'sidebar';

  return (
    <div ref={ref} className={`relative ${isSidebar ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('branches.switchTitle')}
        className={`flex items-center gap-2 text-sm font-semibold rounded-xl border transition-all
          ${isSidebar ? 'w-full px-3 py-2.5' : 'px-3.5 py-2 max-w-[240px]'}
          ${open
            ? 'bg-white dark:bg-gray-900 border-primary-300 dark:border-primary-700 ring-4 ring-primary-500/10'
            : 'bg-gray-100 dark:bg-gray-900/60 border-transparent hover:border-gray-200 dark:hover:border-gray-700'}
          text-gray-900 dark:text-white`}
      >
        <MapPin className={`w-4 h-4 shrink-0 ${active ? 'text-primary dark:text-primary-400' : 'text-gray-400'}`} />
        <span className="truncate">{label}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-50 mt-2 ${isSidebar ? 'left-0 right-0' : 'left-0 w-64'} bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200`}
        >
          <div className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('branches.pick')}
          </div>
          <ul className="pb-2 max-h-[320px] overflow-y-auto">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!active}
                onClick={() => pick(null)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
                  ${!active
                    ? 'bg-primary text-white'
                    : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
              >
                <Building2 className={`w-4 h-4 shrink-0 ${!active ? 'text-white' : 'text-gray-400'}`} />
                <span className="flex-1 truncate font-medium">{t('branches.whole')}</span>
                {!active && <Check className="w-4 h-4" />}
              </button>
            </li>
            {branches.map(b => {
              const selected = b.id === activeBranchId;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
                      ${selected
                        ? 'bg-primary text-white'
                        : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
                  >
                    <MapPin className={`w-4 h-4 shrink-0 ${selected ? 'text-white' : 'text-gray-400'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{b.name}</span>
                      {b.address && (
                        <span className={`block truncate text-[11px] ${selected ? 'text-white/80' : 'text-gray-500'}`}>{b.address}</span>
                      )}
                    </span>
                    {selected && <Check className="w-4 h-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
