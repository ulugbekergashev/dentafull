import React from 'react';
import { AudienceSegment, SegmentCondition, SegmentFieldDescriptor } from '../types';
import { X, Plus } from 'lucide-react';

/**
 * Auditoriya konstruktori — "kimga yuborish" savolining YAGONA UI'si.
 * Qo'lda yuborishda ham, jadval bo'yicha qoidada ham shu komponent ishlatiladi.
 *
 * Forma maydonlar reyestridan quriladi (GET /api/messages/segment-fields),
 * shuning uchun backendga yangi filtr qo'shilganda bu fayl o'zgarmaydi.
 * Bemorlarni komponent hisoblamaydi — natijani doim server qaytaradi.
 */

const inputCls = "px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white";

/** Tez boshlash uchun tayyor shartlar */
const PRESETS: { label: string; conditions: SegmentCondition[] }[] = [
    { label: '👩 Ayollar', conditions: [{ field: 'gender', op: 'eq', value: 'Female' }] },
    { label: '👨 Erkaklar', conditions: [{ field: 'gender', op: 'eq', value: 'Male' }] },
    { label: '🧒 Bolalar (18 gacha)', conditions: [{ field: 'age', op: 'lte', value: 18 }] },
    { label: '⏰ Qarzi bor', conditions: [{ field: 'hasDebt', op: 'is_true' }] },
    { label: '🎁 Shu oy tug\'ilganlar', conditions: [{ field: 'birthdayMonth', op: 'eq', value: 'current' }] },
    { label: '🔄 6 oydan beri kelmagan', conditions: [{ field: 'lastVisit', op: 'before', value: 6 }] },
    { label: '✈️ Botga ulanmagan', conditions: [{ field: 'hasTelegram', op: 'is_false' }] },
    { label: '🆕 Yangi (30 kun)', conditions: [{ field: 'registered', op: 'within', value: 30 }] },
];

interface Props {
    value: AudienceSegment;
    onChange: (next: AudienceSegment) => void;
    fields: SegmentFieldDescriptor[];
    /** Har bir shart yakka o'zi nechtaga mos (serverdan) */
    conditionCounts?: number[];
}

export const SegmentBuilder: React.FC<Props> = ({ value, onChange, fields, conditionCounts }) => {
    const conditions = value.conditions || [];
    const match = value.match === 'any' ? 'any' : 'all';

    const setConditions = (next: SegmentCondition[]) => onChange({ ...value, match, conditions: next });

    const updateAt = (i: number, patch: Partial<SegmentCondition>) =>
        setConditions(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

    const removeAt = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));

    const addCondition = (fieldId?: string) => {
        const def = fields.find(f => f.id === fieldId) || fields[0];
        if (!def) return;
        setConditions([...conditions, { field: def.id, op: def.defaultOp, value: def.defaultValue }]);
    };

    const applyPreset = (preset: SegmentCondition[]) => {
        // Bir xil maydon bo'yicha eski shartni almashtiramiz, qolganini saqlaymiz
        const ids = preset.map(p => p.field);
        setConditions([...conditions.filter(c => !ids.includes(c.field)), ...preset]);
    };

    // Maydonlarni guruhlab select uchun tayyorlaymiz
    const groups: Record<string, SegmentFieldDescriptor[]> = {};
    for (const f of fields) {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
    }
    const groupEntries: [string, SegmentFieldDescriptor[]][] = Object.keys(groups).map(g => [g, groups[g]]);

    return (
        <div className="space-y-3">
            {/* Tayyor shartlar */}
            <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.conditions)}
                        className="px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 transition-colors bg-white dark:bg-gray-800"
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Shartlar ro'yxati */}
            {conditions.length > 0 && (
                <div className="space-y-2">
                    {conditions.map((cond, i) => {
                        const def = fields.find(f => f.id === cond.field);
                        const op = def?.operators.find(o => o.id === cond.op);
                        const arity = op?.arity ?? 1;
                        const count = conditionCounts?.[i];

                        return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                                {i > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onChange({ ...value, match: match === 'all' ? 'any' : 'all', conditions })}
                                        title="VA / YOKI almashtirish"
                                        className="px-2 py-1 text-[10px] font-bold rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-primary-600 uppercase tracking-wider min-w-[46px]"
                                    >
                                        {match === 'all' ? 'VA' : 'YOKI'}
                                    </button>
                                )}
                                {i === 0 && <span className="min-w-[46px]" />}

                                {/* Maydon */}
                                <select
                                    value={cond.field}
                                    onChange={e => {
                                        const nd = fields.find(f => f.id === e.target.value);
                                        if (!nd) return;
                                        updateAt(i, { field: nd.id, op: nd.defaultOp, value: nd.defaultValue });
                                    }}
                                    className={inputCls}
                                >
                                    {groupEntries.map(([group, list]) => (
                                        <optgroup key={group} label={group}>
                                            {list.map(f => (
                                                <option key={f.id} value={f.id}>{f.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>

                                {/* Amal */}
                                {def && def.operators.length > 1 && (
                                    <select
                                        value={cond.op}
                                        onChange={e => {
                                            const no = def.operators.find(o => o.id === e.target.value);
                                            updateAt(i, {
                                                op: e.target.value,
                                                value: no?.arity === 2 && !Array.isArray(cond.value)
                                                    ? [cond.value ?? 0, cond.value ?? 0]
                                                    : cond.value,
                                            });
                                        }}
                                        className={inputCls}
                                    >
                                        {def.operators.map(o => (
                                            <option key={o.id} value={o.id}>{o.label}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Qiymat */}
                                {def && arity > 0 && (
                                    def.options ? (
                                        <select
                                            value={String(cond.value ?? '')}
                                            onChange={e => updateAt(i, { value: e.target.value })}
                                            className={inputCls}
                                        >
                                            <option value="">— tanlang —</option>
                                            {def.options.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    ) : def.type === 'text' ? (
                                        <input
                                            type="text"
                                            value={String(cond.value ?? '')}
                                            onChange={e => updateAt(i, { value: e.target.value })}
                                            placeholder="matn"
                                            className={`${inputCls} w-40`}
                                        />
                                    ) : arity === 2 ? (
                                        <span className="flex items-center gap-1.5">
                                            <input
                                                type="number"
                                                value={Array.isArray(cond.value) ? cond.value[0] : ''}
                                                onChange={e => updateAt(i, { value: [Number(e.target.value), Array.isArray(cond.value) ? cond.value[1] : 0] })}
                                                className={`${inputCls} w-20`}
                                            />
                                            <span className="text-gray-400 text-sm">—</span>
                                            <input
                                                type="number"
                                                value={Array.isArray(cond.value) ? cond.value[1] : ''}
                                                onChange={e => updateAt(i, { value: [Array.isArray(cond.value) ? cond.value[0] : 0, Number(e.target.value)] })}
                                                className={`${inputCls} w-20`}
                                            />
                                            {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <input
                                                type="number"
                                                value={cond.value ?? ''}
                                                onChange={e => updateAt(i, { value: Number(e.target.value) })}
                                                className={`${inputCls} w-24`}
                                            />
                                            {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                                        </span>
                                    )
                                )}

                                {/* Shu shart yakka o'zi nechtaga mos */}
                                {count !== undefined && (
                                    <span className="text-xs text-gray-400 font-mono tabular-nums">{count} ta</span>
                                )}

                                <button
                                    type="button"
                                    onClick={() => removeAt(i)}
                                    title="Shartni olib tashlash"
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-auto"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => addCondition()}
                    className="flex items-center gap-1.5 text-sm font-bold text-primary-600 hover:text-primary-700"
                >
                    <Plus className="w-4 h-4" /> Shart qo'shish
                </button>
                {conditions.length === 0 && (
                    <span className="text-xs text-gray-400">Shartsiz — klinikaning barcha bemorlari</span>
                )}
                {conditions.length > 1 && (
                    <span className="text-xs text-gray-400">
                        {match === 'all'
                            ? 'Barcha shartlar bajarilishi kerak'
                            : 'Shartlardan bittasi bajarilsa yetarli'}
                    </span>
                )}
            </div>
        </div>
    );
};
