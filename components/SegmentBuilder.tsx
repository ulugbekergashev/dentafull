import React from 'react';
import { Doctor, AudienceSegment } from '../types';
import { CheckCircle2 } from 'lucide-react';

/**
 * Auditoriya konstruktori — "kimga yuborish" savolining YAGONA UI'si.
 * Qo'lda yuborishda ham, jadval bo'yicha qoidada ham shu komponent ishlatiladi,
 * shuning uchun ikki joyda filtrlar ajralib ketmaydi.
 *
 * Bemorlarni komponent o'zi hisoblamaydi — natijani doim server qaytaradi
 * (POST /api/messages/audience), aks holda "qarzdor" ta'rifi yana ikkiga
 * bo'linib ketardi.
 */

const inputCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400";
const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

const QUICK_FILTERS: { key: keyof AudienceSegment; label: string }[] = [
    { key: 'debtors', label: '⏰ Qarzdorlar' },
    { key: 'birthdayToday', label: "🎁 Bugun tug'ilgan kun" },
    { key: 'birthdayMonth', label: "🎁 Bu oy tug'ilgan kunlari" },
];

interface Props {
    value: AudienceSegment;
    onChange: (next: AudienceSegment) => void;
    doctors: Doctor[];
    /** Ixcham ko'rinish (qoida formasi ichida) */
    compact?: boolean;
}

export const SegmentBuilder: React.FC<Props> = ({ value, onChange, doctors, compact }) => {
    const set = (patch: Partial<AudienceSegment>) => onChange({ ...value, ...patch });

    return (
        <div className="space-y-4">
            <div className={`grid grid-cols-1 gap-4 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                <div>
                    <label className={labelCls}>Shifokor bo'yicha</label>
                    <select
                        value={value.doctorId || ''}
                        onChange={e => set({ doctorId: e.target.value || null })}
                        className={inputCls}
                    >
                        <option value="">Barcha shifokorlar</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Bemorlar</label>
                    <select
                        value={value.status || 'Active'}
                        onChange={e => set({ status: e.target.value as 'Active' | 'All' })}
                        className={inputCls}
                    >
                        <option value="Active">Faol bemorlar</option>
                        <option value="All">Barcha bemorlar</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Uzoq kelmagan</label>
                    <select
                        value={value.inactiveMonths ?? ''}
                        onChange={e => set({ inactiveMonths: e.target.value ? parseInt(e.target.value) : null })}
                        className={inputCls}
                    >
                        <option value="">Filtr yo'q</option>
                        <option value="1">1 oydan beri kelmagan</option>
                        <option value="3">3 oydan beri kelmagan</option>
                        <option value="6">6 oydan beri kelmagan</option>
                        <option value="12">12 oydan beri kelmagan</option>
                    </select>
                    {!!value.inactiveMonths && (
                        <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!value.includeNeverVisited}
                                onChange={e => set({ includeNeverVisited: e.target.checked })}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            Hech qachon kelmaganlarni ham qo'shish
                        </label>
                    )}
                </div>
            </div>

            <div>
                <p className="text-xs text-gray-400 mb-2">Tezkor filtrlar (birga ishlaydi):</p>
                <div className="flex flex-wrap gap-2">
                    {QUICK_FILTERS.map(({ key, label }) => {
                        const active = !!value[key];
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => set({ [key]: !active } as Partial<AudienceSegment>)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${active
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                            >
                                {active && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
