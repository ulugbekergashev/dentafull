import React, { useState } from 'react';
import {
    Users, CalendarDays, Wallet, Package, Table2, ChevronRight, ArrowUpRight,
    Stethoscope, CalendarClock, RotateCcw, Activity,
} from 'lucide-react';
import type { Evidence, PatientCard, Tone } from './aiClient';
import { Lang, STATUS_LABEL, TOOTH_LABEL } from './aiContext';

// ─── Javob ostidagi kartochkalar ──────────────────────────────────────────────
//
// Ro'yxat va raqamlar modeldan emas, serverdan keladi (backend: ai/evidence.ts).
// Har bir bemor nomi bosiladi — kartasi yon tomonda ochiladi, panel esa joyida
// qoladi. Bo'sh vaqt bosilsa — AI o'sha vaqtga yozishni tayyorlaydi.

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const som = (lang: Lang) => (lang === 'ru' ? 'сум' : "so'm");

/** "2026-09-30" -> "30.09" */
const dm = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d);

const MONTHS: Record<Lang, string[]> = {
    uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const longDate = (d: string, lang: Lang) => {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d;
    const day = Number(m[3]);
    const month = MONTHS[lang][Number(m[2]) - 1];
    return lang === 'ru' ? `${day} ${month}` : `${day}-${month}`;
};

const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '•';

const TONE_TEXT: Record<Tone, string> = {
    neutral: 'text-gray-900 dark:text-white',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
};

const STATUS_PILL: Record<string, string> = {
    Completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    'Checked-In': 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    Confirmed: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    Pending: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300',
    'No-Show': 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    Cancelled: 'bg-gray-100 text-gray-400 line-through dark:bg-white/[0.04] dark:text-gray-500',
};

const Shell: React.FC<{
    icon: React.ElementType;
    title: string;
    badge?: string;
    aside?: React.ReactNode;
    children: React.ReactNode;
}> = ({ icon: Icon, title, badge, aside, children }) => (
    <div className="rounded-2xl overflow-hidden bg-white dark:bg-white/[0.03]
                    ring-1 ring-gray-200/80 dark:ring-white/[0.07] shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <Icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-300 shrink-0" />
            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{title}</span>
            {badge && (
                <span className="text-[11px] tabular-nums px-1.5 py-px rounded-md
                                 bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                    {badge}
                </span>
            )}
            {aside && <span className="ml-auto shrink-0">{aside}</span>}
        </div>
        {children}
    </div>
);

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => (
    <span
        className="shrink-0 grid place-items-center rounded-full font-semibold text-white
                   bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-500"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
        {initials(name)}
    </span>
);

// ─── Bemor kartasi ───────────────────────────────────────────────────────────

const PatientCardView: React.FC<{ card: PatientCard; lang: Lang; onOpenPatient: (id: string) => void }> = ({
    card, lang, onOpenPatient,
}) => {
    const ru = lang === 'ru';
    const teeth = (Object.entries(card.teeth || {}) as [string, number][])
        .filter(([k]) => k !== 'Healthy')
        .sort((a, b) => b[1] - a[1]);
    const cells: { label: string; value: string; tone?: Tone }[] = [
        { label: ru ? 'Визиты' : 'Tashriflar', value: String(card.visits) },
        {
            label: ru ? 'Долг' : 'Qarz',
            value: card.debt > 0 ? fmt(card.debt) : '0',
            tone: card.debt > 0 ? 'bad' : 'good',
        },
        {
            label: ru ? 'Следующий' : 'Keyingi',
            value: card.next ? `${dm(card.next.date)} ${card.next.time}` : '—',
        },
    ];

    return (
        <div className="rounded-2xl overflow-hidden ring-1 ring-indigo-200/70 dark:ring-indigo-400/20
                        bg-gradient-to-b from-indigo-50/70 to-white dark:from-indigo-500/[0.07] dark:to-transparent">
            <button
                onClick={() => onOpenPatient(card.id)}
                className="w-full flex items-center gap-3 px-3.5 pt-3.5 pb-3 text-left group"
            >
                <Avatar name={card.name} size={38} />
                <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-gray-900 dark:text-white truncate">
                        {card.name}
                    </span>
                    <span className="block text-[12px] text-gray-500 dark:text-gray-400 truncate">
                        {[
                            card.age !== null ? (ru ? `${card.age} лет` : `${card.age} yosh`) : null,
                            card.doctor?.name ? `Dr. ${card.doctor.name}` : null,
                            card.noShows ? (ru ? `неявок: ${card.noShows}` : `kelmagan: ${card.noShows}`) : null,
                        ].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0" />
            </button>

            <div className="grid grid-cols-3 gap-px bg-indigo-100/70 dark:bg-white/[0.06] border-y border-indigo-100/70 dark:border-white/[0.06]">
                {cells.map(c => (
                    <div key={c.label} className="bg-white/90 dark:bg-[#0d1219] px-3 py-2">
                        <div className="text-[10.5px] uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">{c.label}</div>
                        <div className={`text-[14px] font-semibold tabular-nums truncate ${TONE_TEXT[c.tone || 'neutral']}`}>
                            {c.value}
                        </div>
                    </div>
                ))}
            </div>

            <div className="px-3.5 py-3 space-y-2.5">
                {card.procedures.length > 0 && (
                    <div>
                        <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1">
                            {ru ? 'Последние работы' : 'Oxirgi ishlar'}
                        </div>
                        <ul className="space-y-1">
                            {card.procedures.slice(0, 5).map((p, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                                    <span className="tabular-nums text-gray-400 dark:text-gray-500 w-10 shrink-0">{dm(p.date)}</span>
                                    <span className="text-gray-800 dark:text-gray-200 truncate flex-1">
                                        {p.name}
                                        {p.tooth ? <span className="text-indigo-500 dark:text-indigo-300"> · #{p.tooth}</span> : null}
                                    </span>
                                    {p.price > 0 && (
                                        <span className="tabular-nums text-gray-500 dark:text-gray-400 shrink-0">{fmt(p.price)}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {teeth.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {teeth.slice(0, 6).map(([k, n]) => (
                            <span key={k} className="text-[11.5px] px-2 py-0.5 rounded-full
                                                     bg-white ring-1 ring-gray-200 text-gray-600
                                                     dark:bg-white/[0.04] dark:ring-white/[0.08] dark:text-gray-300">
                                {TOOTH_LABEL[k]?.[lang] || k} · {n}
                            </span>
                        ))}
                    </div>
                )}

                {(card.recall || card.advance > 0 || card.lastVisit) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
                        {card.lastVisit && (
                            <span className="inline-flex items-center gap-1">
                                <Activity className="w-3 h-3" />
                                {ru ? 'Был(а)' : 'Oxirgi tashrif'}: {dm(card.lastVisit)}
                            </span>
                        )}
                        {card.recall && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <RotateCcw className="w-3 h-3" />
                                {ru ? 'Контроль' : 'Nazorat'}: {dm(card.recall.date)}
                                {card.recall.reason ? ` — ${card.recall.reason}` : ''}
                            </span>
                        )}
                        {card.advance > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <Wallet className="w-3 h-3" />
                                {ru ? 'Аванс' : 'Avans'}: {fmt(card.advance)}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Bo'sh vaqtlar ───────────────────────────────────────────────────────────

const SlotsView: React.FC<{
    ev: Extract<Evidence, { kind: 'slots' }>;
    lang: Lang;
    onPickSlot?: (doctorName: string, date: string, time: string) => void;
}> = ({ ev, lang, onPickSlot }) => {
    const ru = lang === 'ru';
    return (
        <Shell icon={CalendarClock} title={ev.title} badge={longDate(ev.date, lang)}>
            <div className="px-3.5 pb-3 space-y-3">
                {ev.doctors.map(d => (
                    <div key={d.id}>
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <span className="text-[12.5px] font-medium text-gray-800 dark:text-gray-200 truncate">
                                <Stethoscope className="inline w-3 h-3 mr-1 text-gray-400 -mt-0.5" />
                                {d.name}
                            </span>
                            <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">
                                {d.start}–{d.end}
                            </span>
                        </div>
                        {d.free.length ? (
                            <div className="flex flex-wrap gap-1.5">
                                {d.free.slice(0, 12).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => onPickSlot?.(d.name, ev.date, t)}
                                        disabled={!onPickSlot}
                                        title={ru ? 'Записать на это время' : 'Shu vaqtga yozish'}
                                        className="px-2 py-1 rounded-lg text-[12px] tabular-nums font-medium transition-colors
                                                   bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70
                                                   hover:bg-emerald-100 hover:ring-emerald-300
                                                   dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20
                                                   dark:hover:bg-emerald-500/20 disabled:cursor-default"
                                    >
                                        {t}
                                    </button>
                                ))}
                                {d.free.length > 12 && (
                                    <span className="px-1.5 py-1 text-[11.5px] text-gray-400">+{d.free.length - 12}</span>
                                )}
                            </div>
                        ) : (
                            <div className="text-[12px] text-gray-400 dark:text-gray-500">
                                {ru ? 'Свободного времени нет' : "Bo'sh vaqt yo'q"}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </Shell>
    );
};

// ─── Qolganlari ──────────────────────────────────────────────────────────────

const PatientsView: React.FC<{
    ev: Extract<Evidence, { kind: 'patients' }>;
    lang: Lang;
    onOpenPatient: (id: string) => void;
}> = ({ ev, lang, onOpenPatient }) => (
    <Shell
        icon={Users}
        title={ev.title}
        badge={String(ev.total)}
        aside={ev.sum ? (
            <span className="text-[12px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {fmt(ev.sum)} <span className="font-normal text-gray-400">{som(lang)}</span>
            </span>
        ) : undefined}
    >
        <div className="pb-1.5">
            {ev.items.map((p, i) => (
                <button
                    key={`${p.id || p.name}-${i}`}
                    onClick={() => p.id && onOpenPatient(p.id)}
                    disabled={!p.id}
                    className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left transition-colors
                               hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:hover:bg-transparent group"
                >
                    <Avatar name={p.name} size={26} />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                        {p.detail && <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{p.detail}</span>}
                    </span>
                    {typeof p.amount === 'number' && (
                        <span className="text-[12.5px] tabular-nums font-medium text-gray-700 dark:text-gray-200 shrink-0">
                            {fmt(p.amount)}
                        </span>
                    )}
                    {p.id && <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 shrink-0" />}
                </button>
            ))}
            {ev.total > ev.items.length && (
                <div className="px-3.5 pt-1 pb-1.5 text-[11.5px] text-gray-400 dark:text-gray-500">
                    {lang === 'ru' ? `и ещё ${ev.total - ev.items.length}` : `yana ${ev.total - ev.items.length} ta`}
                </div>
            )}
        </div>
    </Shell>
);

const AppointmentsView: React.FC<{
    ev: Extract<Evidence, { kind: 'appointments' }>;
    lang: Lang;
    onOpenPatient: (id: string) => void;
}> = ({ ev, lang, onOpenPatient }) => {
    const multiDay = new Set(ev.items.map(a => a.date)).size > 1;
    return (
        <Shell icon={CalendarDays} title={ev.title} badge={String(ev.total)}>
            <div className="pb-1.5">
                {ev.items.map(a => (
                    <button
                        key={a.id}
                        onClick={() => onOpenPatient(a.patientId)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left transition-colors
                                   hover:bg-gray-50 dark:hover:bg-white/[0.04] group"
                    >
                        <span className="w-11 shrink-0 text-[12.5px] font-semibold tabular-nums text-gray-900 dark:text-white">
                            {a.time}
                            {multiDay && <span className="block text-[10.5px] font-normal text-gray-400">{dm(a.date)}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] text-gray-800 dark:text-gray-100 truncate">{a.patientName}</span>
                            <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                {[a.doctorName, a.type].filter(Boolean).join(' · ')}
                            </span>
                        </span>
                        <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md shrink-0 ${STATUS_PILL[a.status] || STATUS_PILL.Pending}`}>
                            {STATUS_LABEL[a.status]?.[lang] || a.status}
                        </span>
                    </button>
                ))}
                {ev.total > ev.items.length && (
                    <div className="px-3.5 pt-1 pb-1.5 text-[11.5px] text-gray-400 dark:text-gray-500">
                        {lang === 'ru' ? `и ещё ${ev.total - ev.items.length}` : `yana ${ev.total - ev.items.length} ta`}
                    </div>
                )}
            </div>
        </Shell>
    );
};

const MetricsView: React.FC<{ ev: Extract<Evidence, { kind: 'metrics' }> }> = ({ ev }) => (
    <Shell icon={Wallet} title={ev.title}>
        <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/[0.05] border-t border-gray-100 dark:border-white/[0.05]">
            {ev.items.map(m => (
                <div key={m.label} className="bg-white dark:bg-[#0d1219] px-3.5 py-2.5">
                    <div className="text-[10.5px] uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500 truncate">{m.label}</div>
                    <div className={`text-[16px] font-semibold tabular-nums ${TONE_TEXT[m.tone || 'neutral']}`}>
                        {m.value}
                        {m.unit && <span className="text-[11px] font-normal text-gray-400 ml-1">{m.unit}</span>}
                    </div>
                </div>
            ))}
        </div>
    </Shell>
);

const StockView: React.FC<{ ev: Extract<Evidence, { kind: 'stock' }> }> = ({ ev }) => (
    <Shell icon={Package} title={ev.title} badge={String(ev.total)}>
        <div className="px-3.5 pb-3 space-y-2">
            {ev.items.map(s => {
                const pct = s.min > 0 ? Math.max(4, Math.min(100, Math.round((s.qty / s.min) * 100))) : 100;
                return (
                    <div key={s.name}>
                        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                            <span className="text-gray-800 dark:text-gray-200 truncate">{s.name}</span>
                            <span className="tabular-nums text-gray-500 dark:text-gray-400 shrink-0">
                                {s.qty} / {s.min} {s.unit}
                            </span>
                        </div>
                        <div className="h-1 mt-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                            <div
                                className={`h-full rounded-full ${pct < 50 ? 'bg-rose-500' : 'bg-amber-500'}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    </Shell>
);

const TableView: React.FC<{ ev: Extract<Evidence, { kind: 'table' }> }> = ({ ev }) => (
    <Shell icon={Table2} title={ev.title}>
        <div className="overflow-x-auto dai-scroll">
            <table className="w-full text-[12px] min-w-[360px]">
                <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-gray-400 dark:text-gray-500">
                        {ev.columns.map((c, i) => (
                            <th key={c} className={`font-medium px-3.5 py-1.5 whitespace-nowrap ${i ? 'text-right' : ''}`}>{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ev.rows.map((row, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05]">
                            {row.map((cell, j) => (
                                <td
                                    key={j}
                                    className={`px-3.5 py-1.5 whitespace-nowrap ${j
                                        ? 'text-right tabular-nums text-gray-600 dark:text-gray-300'
                                        : 'text-gray-800 dark:text-gray-100'}`}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Shell>
);

interface Props {
    cards: Evidence[];
    lang: Lang;
    onOpenPatient: (id: string) => void;
    onPickSlot?: (doctorName: string, date: string, time: string) => void;
}

export const AiEvidence: React.FC<Props> = ({ cards, lang, onOpenPatient, onPickSlot }) => {
    const [all, setAll] = useState(false);
    if (!cards?.length) return null;
    // Uchinchi kartochka odatda umumiy raqamlar — u yig'ilgan holda turadi,
    // aks holda uzun javob panelni pastga cho'zib yuborardi.
    const shown = all ? cards : cards.slice(0, 2);
    return (
        <div className="space-y-2.5">
            {shown.map((c, i) => {
                switch (c.kind) {
                    case 'patient': return <PatientCardView key={i} card={c.card} lang={lang} onOpenPatient={onOpenPatient} />;
                    case 'slots': return <SlotsView key={i} ev={c} lang={lang} onPickSlot={onPickSlot} />;
                    case 'patients': return <PatientsView key={i} ev={c} lang={lang} onOpenPatient={onOpenPatient} />;
                    case 'appointments': return <AppointmentsView key={i} ev={c} lang={lang} onOpenPatient={onOpenPatient} />;
                    case 'metrics': return <MetricsView key={i} ev={c} />;
                    case 'stock': return <StockView key={i} ev={c} />;
                    case 'table': return <TableView key={i} ev={c} />;
                    default: return null;
                }
            })}
            {cards.length > shown.length && (
                <button
                    onClick={() => setAll(true)}
                    className="inline-flex items-center gap-1 text-[12px] text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                    <ChevronRight className="w-3 h-3 rotate-90" />
                    {lang === 'ru' ? `Ещё карточек: ${cards.length - shown.length}` : `Yana ${cards.length - shown.length} ta kartochka`}
                </button>
            )}
        </div>
    );
};

export default AiEvidence;
