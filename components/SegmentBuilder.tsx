import React, { useEffect, useMemo, useState } from 'react';
import { AudienceSegment, SegmentCondition, SegmentFieldDescriptor } from '../types';
import { X, Plus, SlidersHorizontal, ChevronDown } from 'lucide-react';

/**
 * Auditoriya konstruktori — "kimga yuborish" savolining YAGONA UI'si.
 * Qo'lda yuborishda ham, jadval bo'yicha qoidada ham shu komponent ishlatiladi.
 *
 * Ikki rejim bor:
 *
 *   Oddiy     — nomlangan ro'yxatlar. Har biri bitta qaror: "Qarzdorlik:
 *               qarzi bor". Maydon, amal va qiymatni alohida tanlash kerak
 *               emas. Kundalik ishning deyarli hammasi shu yerda.
 *   Murakkab  — to'liq konstruktor: har qanday maydon, amal, VA/YOKI va
 *               qavslar. Ilgari faqat shu rejim bor edi va bo'sh
 *               "maydon / amal / qiymat" qatori birinchi ko'ringani uchun
 *               forma keraksiz qo'rqinchli tuyulardi.
 *
 * Ikkala rejim ham AYNI segment tuzilmasini yasaydi, shuning uchun server
 * tomonida hech narsa o'zgarmaydi. Oddiy rejimda ifodalab bo'lmaydigan
 * shart paydo bo'lsa (YOKI, qavs yoki ro'yxatda yo'q maydon), komponent
 * o'zi Murakkab rejimga o'tadi va hech qanday shart yo'qolmaydi.
 *
 * Forma maydonlar reyestridan quriladi (GET /api/messages/segment-fields),
 * shuning uchun backendga yangi filtr qo'shilganda bu fayl o'zgarmaydi.
 * Bemorlarni komponent hisoblamaydi — natijani doim server qaytaradi.
 */

const inputCls = "px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white";

const selectCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:text-white cursor-pointer transition-colors";

/** Tez boshlash uchun tayyor shartlar (murakkab rejimda) */
const PRESETS: { label: string; conditions: SegmentCondition[] }[] = [
    { label: '👩 Ayollar', conditions: [{ field: 'gender', op: 'eq', value: 'Female' }] },
    { label: '👨 Erkaklar', conditions: [{ field: 'gender', op: 'eq', value: 'Male' }] },
    { label: '🧒 Bolalar (18 gacha)', conditions: [{ field: 'age', op: 'lte', value: 18 }] },
    { label: '⏰ Qarzi bor', conditions: [{ field: 'hasDebt', op: 'is_true' }] },
    { label: '🎁 Shu oy tug\'ilganlar', conditions: [{ field: 'birthdayMonth', op: 'eq', value: 'current' }] },
    { label: '🔄 6 oydan beri kelmagan', conditions: [{ field: 'lastVisit', op: 'before', value: 6 }] },
    { label: '✈️ Botga ulanmagan', conditions: [{ field: 'hasTelegram', op: 'is_false' }] },
    { label: '🆕 Yangi (30 kun)', conditions: [{ field: 'registered', op: 'within', value: 30 }] },
    { label: '⭐ VIP (5 mln+)', conditions: [{ field: 'totalSpent', op: 'gte', value: 5000000 }] },
    { label: '❗ 2+ marta kelmagan', conditions: [{ field: 'noShowCount', op: 'gte', value: 2 }] },
    { label: '📅 Qabuli yo\'q', conditions: [{ field: 'hasUpcomingAppointment', op: 'is_false' }] },
];

const isGroup = (c: SegmentCondition): boolean => Array.isArray(c.conditions);

/* ─── Oddiy rejim ─────────────────────────────────────────────────────────
 * Har bir filtr — bitta nomlangan ro'yxat. Birinchi variant doim "hammasi"
 * degani va hech qanday shart qo'shmaydi.
 */

interface SimpleOption {
    label: string;
    /** Bo'sh bo'lsa — filtr qo'llanmaydi */
    cond?: SegmentCondition;
}

interface SimpleFilter {
    id: string;
    label: string;
    /** true bo'lsa — "Ko'proq filtr" ostida yashiriladi */
    extra?: boolean;
    options: SimpleOption[];
}

const SIMPLE_FILTERS: SimpleFilter[] = [
    {
        id: 'status',
        label: 'Bemor holati',
        options: [
            { label: 'Barchasi' },
            { label: 'Faol', cond: { field: 'status', op: 'eq', value: 'Active' } },
            { label: 'Arxivlangan', cond: { field: 'status', op: 'eq', value: 'Archived' } },
        ],
    },
    {
        id: 'gender',
        label: 'Jinsi',
        options: [
            { label: 'Barchasi' },
            { label: 'Ayol', cond: { field: 'gender', op: 'eq', value: 'Female' } },
            { label: 'Erkak', cond: { field: 'gender', op: 'eq', value: 'Male' } },
        ],
    },
    {
        id: 'age',
        label: 'Yoshi',
        options: [
            { label: 'Barchasi' },
            { label: 'Bolalar (18 gacha)', cond: { field: 'age', op: 'lte', value: 18 } },
            { label: 'Kattalar (18 dan katta)', cond: { field: 'age', op: 'gte', value: 18 } },
        ],
    },
    {
        id: 'debt',
        label: 'Qarzdorlik',
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Qarzi bor', cond: { field: 'hasDebt', op: 'is_true' } },
            { label: 'Qarzi yo\'q', cond: { field: 'hasDebt', op: 'is_false' } },
        ],
    },
    {
        id: 'lastVisit',
        label: 'Oxirgi tashrif',
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Oxirgi 1 oyda kelgan', cond: { field: 'lastVisit', op: 'within', value: 1 } },
            { label: 'Oxirgi 3 oyda kelgan', cond: { field: 'lastVisit', op: 'within', value: 3 } },
            { label: '3 oydan beri kelmagan', cond: { field: 'lastVisit', op: 'before', value: 3 } },
            { label: '6 oydan beri kelmagan', cond: { field: 'lastVisit', op: 'before', value: 6 } },
            { label: '12 oydan beri kelmagan', cond: { field: 'lastVisit', op: 'before', value: 12 } },
            { label: 'Umuman kelmagan', cond: { field: 'everVisited', op: 'is_false' } },
        ],
    },
    {
        id: 'upcoming',
        label: 'Kelgusi qabul',
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Qabuli bor', cond: { field: 'hasUpcomingAppointment', op: 'is_true' } },
            { label: 'Qabuli yo\'q', cond: { field: 'hasUpcomingAppointment', op: 'is_false' } },
        ],
    },
    {
        id: 'telegram',
        label: 'Telegram bot',
        extra: true,
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Botga ulangan', cond: { field: 'hasTelegram', op: 'is_true' } },
            { label: 'Ulanmagan', cond: { field: 'hasTelegram', op: 'is_false' } },
        ],
    },
    {
        id: 'birthday',
        label: 'Tug\'ilgan kun',
        extra: true,
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Bugun', cond: { field: 'birthdayToday', op: 'is_true' } },
            { label: 'Shu oy', cond: { field: 'birthdayMonth', op: 'eq', value: 'current' } },
        ],
    },
    {
        id: 'registered',
        label: 'Ro\'yxatdan o\'tgan',
        extra: true,
        options: [
            { label: 'Farqi yo\'q' },
            { label: 'Oxirgi 30 kun', cond: { field: 'registered', op: 'within', value: 30 } },
            { label: 'Oxirgi 90 kun', cond: { field: 'registered', op: 'within', value: 90 } },
        ],
    },
    {
        id: 'totalSpent',
        label: 'Jami to\'lagan',
        extra: true,
        options: [
            { label: 'Farqi yo\'q' },
            { label: '1 mln so\'mdan ko\'p', cond: { field: 'totalSpent', op: 'gte', value: 1000000 } },
            { label: '5 mln so\'mdan ko\'p', cond: { field: 'totalSpent', op: 'gte', value: 5000000 } },
            { label: '10 mln so\'mdan ko\'p', cond: { field: 'totalSpent', op: 'gte', value: 10000000 } },
        ],
    },
    {
        id: 'noShow',
        label: 'Kelmagan qabullar',
        extra: true,
        options: [
            { label: 'Farqi yo\'q' },
            { label: '1 marta va undan ko\'p', cond: { field: 'noShowCount', op: 'gte', value: 1 } },
            { label: '2 marta va undan ko\'p', cond: { field: 'noShowCount', op: 'gte', value: 2 } },
        ],
    },
];

const sameCond = (a: SegmentCondition, b: SegmentCondition) =>
    a.field === b.field &&
    a.op === b.op &&
    JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);

/**
 * Segmentni oddiy rejim tanlovlariga aylantiradi.
 * Ifodalab bo'lmasa `null` qaytaradi — bunda murakkab rejim ochiladi.
 */
function toSimple(value: AudienceSegment): Record<string, number> | null {
    const conds = value.conditions || [];
    if (conds.length > 1 && value.match === 'any') return null;
    if (conds.some(isGroup)) return null;

    const picked: Record<string, number> = {};
    for (const c of conds) {
        let matched = false;
        for (const f of SIMPLE_FILTERS) {
            const idx = f.options.findIndex(o => o.cond && sameCond(o.cond, c));
            if (idx > 0) {
                // Bitta filtr ikki marta ishlatilgan bo'lsa — oddiy rejimga sig'maydi
                if (picked[f.id] !== undefined) return null;
                picked[f.id] = idx;
                matched = true;
                break;
            }
        }
        if (!matched) return null;
    }
    return picked;
}

/** Tanlovlardan shartlar ro'yxatini yig'adi (filtrlar tartibida) */
function fromSimple(picked: Record<string, number>): SegmentCondition[] {
    const out: SegmentCondition[] = [];
    for (const f of SIMPLE_FILTERS) {
        const idx = picked[f.id];
        const opt = idx !== undefined ? f.options[idx] : undefined;
        if (opt?.cond) out.push({ ...opt.cond });
    }
    return out;
}

const SimpleFilters: React.FC<{
    value: AudienceSegment;
    picked: Record<string, number>;
    counts?: number[];
    onChange: (next: AudienceSegment) => void;
}> = ({ value, picked, counts, onChange }) => {
    const hasExtra = SIMPLE_FILTERS.some(f => f.extra && picked[f.id]);
    const [showExtra, setShowExtra] = useState(hasExtra);

    // Saqlangan segment keyinroq yuklansa (yoki tayyor shart qo'llansa),
    // qo'shimcha filtr tanlangan bo'lishi mumkin — bunda uni ko'rsatamiz,
    // aks holda foydalanuvchi o'zi qo'ymagan filtrni ko'rmay qolardi.
    useEffect(() => {
        if (hasExtra) setShowExtra(true);
    }, [hasExtra]);

    const conditions = fromSimple(picked);
    /** Shart nechanchi o'rinda tursa, serverdagi hisob ham o'sha o'rinda */
    const countFor = (fid: string) => {
        const idx = conditions.findIndex(c => {
            const f = SIMPLE_FILTERS.find(x => x.id === fid);
            const opt = f?.options[picked[fid]];
            return opt?.cond ? sameCond(opt.cond, c) : false;
        });
        return idx >= 0 ? counts?.[idx] : undefined;
    };

    const set = (fid: string, idx: number) => {
        const next = { ...picked };
        if (idx === 0) delete next[fid];
        else next[fid] = idx;
        onChange({ ...value, match: 'all', conditions: fromSimple(next) });
    };

    const clearAll = () => onChange({ ...value, match: 'all', conditions: [] });

    const visible = SIMPLE_FILTERS.filter(f => !f.extra || showExtra);
    const activeCount = Object.keys(picked).length;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visible.map(f => {
                    const idx = picked[f.id] ?? 0;
                    const on = idx > 0;
                    const cnt = on ? countFor(f.id) : undefined;
                    return (
                        <div key={f.id} className="space-y-1">
                            <label className="flex items-center justify-between gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                <span>{f.label}</span>
                                {cnt !== undefined && (
                                    <span className="font-mono tabular-nums text-gray-400 font-medium">{cnt} ta</span>
                                )}
                            </label>
                            <select
                                value={idx}
                                onChange={e => set(f.id, Number(e.target.value))}
                                className={`${selectCls} ${on ? 'border-primary-400 dark:border-primary-600 font-semibold text-primary-700 dark:text-primary-300' : ''}`}
                            >
                                {f.options.map((o, i) => (
                                    <option key={i} value={i}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <button
                    type="button"
                    onClick={() => setShowExtra(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExtra ? 'rotate-180' : ''}`} />
                    {showExtra ? 'Qo\'shimcha filtrlarni yashirish' : 'Ko\'proq filtr'}
                </button>

                {activeCount > 0 && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="text-xs font-bold text-gray-400 hover:text-red-600 transition-colors"
                    >
                        Filtrlarni tozalash
                    </button>
                )}

                {activeCount === 0 && (
                    <span className="text-xs text-gray-400">Filtrsiz — klinikaning barcha bemorlari</span>
                )}
            </div>
        </div>
    );
};

/* ─── Murakkab rejim ──────────────────────────────────────────────────── */

/** Maydonlarni guruhlab optgroup uchun tayyorlaydi */
function fieldGroups(fields: SegmentFieldDescriptor[]): [string, SegmentFieldDescriptor[]][] {
    const groups: Record<string, SegmentFieldDescriptor[]> = {};
    for (const f of fields) {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
    }
    return Object.keys(groups).map(g => [g, groups[g]]);
}

/** Bitta maydon sharti qatori */
const ConditionRow: React.FC<{
    cond: SegmentCondition;
    fields: SegmentFieldDescriptor[];
    count?: number;
    onChange: (patch: Partial<SegmentCondition>) => void;
}> = ({ cond, fields, count, onChange }) => {
    const def = fields.find(f => f.id === cond.field);
    const op = def?.operators.find(o => o.id === cond.op);
    const arity = op?.arity ?? 1;
    const groups = fieldGroups(fields);

    return (
        <>
            <select
                value={cond.field || ''}
                onChange={e => {
                    const nd = fields.find(f => f.id === e.target.value);
                    if (!nd) return;
                    onChange({ field: nd.id, op: nd.defaultOp, value: nd.defaultValue });
                }}
                className={inputCls}
            >
                {groups.map(([group, list]) => (
                    <optgroup key={group} label={group}>
                        {list.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                    </optgroup>
                ))}
            </select>

            {def && def.operators.length > 1 && (
                <select
                    value={cond.op}
                    onChange={e => {
                        const no = def.operators.find(o => o.id === e.target.value);
                        onChange({
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

            {/* Qiymat — maydon turiga qarab */}
            {def && arity > 0 && (
                def.type === 'enum_months' ? (
                    // Muolaja + necha oy: "implant qo'ygan va 12 oy o'tgan"
                    <span className="flex items-center gap-1.5">
                        <select
                            value={Array.isArray(cond.value) ? String(cond.value[0] ?? '') : ''}
                            onChange={e => onChange({ value: [e.target.value, Array.isArray(cond.value) ? cond.value[1] : 12] })}
                            className={inputCls}
                        >
                            <option value="">— muolaja —</option>
                            {(def.options || []).map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? (cond.value[1] ?? '') : ''}
                            onChange={e => onChange({ value: [Array.isArray(cond.value) ? cond.value[0] : '', Number(e.target.value)] })}
                            className={`${inputCls} w-20`}
                        />
                        <span className="text-xs text-gray-400">{def.unit}</span>
                    </span>
                ) : def.options ? (
                    <select
                        value={String(cond.value ?? '')}
                        onChange={e => onChange({ value: e.target.value })}
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
                        onChange={e => onChange({ value: e.target.value })}
                        placeholder="matn"
                        className={`${inputCls} w-40`}
                    />
                ) : arity === 2 ? (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? cond.value[0] : ''}
                            onChange={e => onChange({ value: [Number(e.target.value), Array.isArray(cond.value) ? cond.value[1] : 0] })}
                            className={`${inputCls} w-20`}
                        />
                        <span className="text-gray-400 text-sm">—</span>
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? cond.value[1] : ''}
                            onChange={e => onChange({ value: [Array.isArray(cond.value) ? cond.value[0] : 0, Number(e.target.value)] })}
                            className={`${inputCls} w-20`}
                        />
                        {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={cond.value ?? ''}
                            onChange={e => onChange({ value: Number(e.target.value) })}
                            className={`${inputCls} w-24`}
                        />
                        {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                    </span>
                )
            )}

            {count !== undefined && (
                <span className="text-xs text-gray-400 font-mono tabular-nums">{count} ta</span>
            )}
        </>
    );
};

/** Guruh (qavs) — o'z ichida shartlar va boshqa guruhlar bo'lishi mumkin */
const GroupEditor: React.FC<{
    node: SegmentCondition;
    fields: SegmentFieldDescriptor[];
    counts?: number[];
    depth: number;
    onChange: (next: SegmentCondition) => void;
}> = ({ node, fields, counts, depth, onChange }) => {
    const conditions = node.conditions || [];
    const match = node.match === 'any' ? 'any' : 'all';

    const setConditions = (next: SegmentCondition[]) => onChange({ ...node, match, conditions: next });
    const updateAt = (i: number, next: SegmentCondition) =>
        setConditions(conditions.map((c, idx) => (idx === i ? next : c)));
    const removeAt = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));

    const addCondition = () => {
        const def = fields[0];
        if (!def) return;
        setConditions([...conditions, { field: def.id, op: def.defaultOp, value: def.defaultValue }]);
    };
    const addGroup = () => {
        const def = fields[0];
        if (!def) return;
        setConditions([...conditions, {
            match: 'any',
            conditions: [{ field: def.id, op: def.defaultOp, value: def.defaultValue }],
        }]);
    };

    const toggleMatch = () => onChange({ ...node, match: match === 'all' ? 'any' : 'all', conditions });

    return (
        <div className={depth > 0 ? 'pl-3 border-l-2 border-primary-200 dark:border-primary-800 space-y-2' : 'space-y-2'}>
            {conditions.map((cond, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                    {i > 0 ? (
                        <button
                            type="button"
                            onClick={toggleMatch}
                            title="VA / YOKI almashtirish"
                            className="px-2 py-1 text-[10px] font-bold rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-primary-600 uppercase tracking-wider min-w-[46px]"
                        >
                            {match === 'all' ? 'VA' : 'YOKI'}
                        </button>
                    ) : (
                        <span className="min-w-[46px]" />
                    )}

                    {isGroup(cond) ? (
                        <div className="flex-1 min-w-[260px] rounded-lg bg-gray-50 dark:bg-gray-800/40 p-2">
                            <GroupEditor
                                node={cond}
                                fields={fields}
                                depth={depth + 1}
                                onChange={next => updateAt(i, next)}
                            />
                        </div>
                    ) : (
                        <ConditionRow
                            cond={cond}
                            fields={fields}
                            count={depth === 0 ? counts?.[i] : undefined}
                            onChange={patch => updateAt(i, { ...cond, ...patch })}
                        />
                    )}

                    <button
                        type="button"
                        onClick={() => removeAt(i)}
                        title={isGroup(cond) ? "Guruhni olib tashlash" : "Shartni olib tashlash"}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-auto"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={addCondition}
                    className="flex items-center gap-1.5 text-sm font-bold text-primary-600 hover:text-primary-700"
                >
                    <Plus className="w-4 h-4" /> Shart
                </button>
                {depth < 2 && (
                    <button
                        type="button"
                        onClick={addGroup}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary-600"
                        title="Qavs ichida alohida mantiq: ayol VA (VIP YOKI implant)"
                    >
                        <Plus className="w-3.5 h-3.5" /> Qavs
                    </button>
                )}
                {conditions.length === 0 && depth === 0 && (
                    <span className="text-xs text-gray-400">Shartsiz — klinikaning barcha bemorlari</span>
                )}
            </div>
        </div>
    );
};

/* ─── Tashqi komponent ────────────────────────────────────────────────── */

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

    /** Joriy segment oddiy rejimda ifodalanadimi */
    const picked = useMemo(() => toSimple(value), [value]);
    const [wantAdvanced, setWantAdvanced] = useState(false);

    // Ifodalab bo'lmasa — tanlovdan qat'i nazar murakkab rejim
    const advanced = wantAdvanced || picked === null;

    const applyPreset = (preset: SegmentCondition[]) => {
        // Bir xil maydon bo'yicha eski shartni almashtiramiz, qolganini saqlaymiz
        const ids = preset.map(p => p.field);
        onChange({
            ...value,
            match,
            conditions: [...conditions.filter(c => isGroup(c) || !ids.includes(c.field)), ...preset],
        });
    };

    const tabCls = (on: boolean) =>
        `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${on
            ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`;

    return (
        <div className="space-y-3">
            {/* Rejim almashtirgichi */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100 dark:bg-gray-800">
                    <button
                        type="button"
                        onClick={() => setWantAdvanced(false)}
                        disabled={picked === null}
                        title={picked === null ? 'Joriy shartlar oddiy rejimga sig\'maydi' : undefined}
                        className={`${tabCls(!advanced)} ${picked === null ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                        Oddiy
                    </button>
                    <button type="button" onClick={() => setWantAdvanced(true)} className={tabCls(advanced)}>
                        <span className="flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Murakkab
                        </span>
                    </button>
                </div>

                {advanced && picked === null && conditions.length > 0 && (
                    <span className="text-[11px] text-gray-400">
                        Bu shartlarni oddiy ro'yxatlar bilan ifodalab bo'lmaydi
                    </span>
                )}
            </div>

            {!advanced && picked !== null ? (
                <SimpleFilters value={value} picked={picked} counts={conditionCounts} onChange={onChange} />
            ) : (
                <>
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

                    <GroupEditor
                        node={{ match, conditions }}
                        fields={fields}
                        counts={conditionCounts}
                        depth={0}
                        onChange={next => onChange({ ...value, match: next.match, conditions: next.conditions })}
                    />

                    {conditions.length > 1 && (
                        <p className="text-xs text-gray-400">
                            {match === 'all'
                                ? 'Barcha shartlar bajarilishi kerak'
                                : 'Shartlardan bittasi bajarilsa yetarli'}
                            {' · '}"Qavs" tugmasi bilan ichma-ich mantiq tuziladi: ayol VA (VIP YOKI implant)
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
