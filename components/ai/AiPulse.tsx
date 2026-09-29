import React from 'react';
import { motion } from 'motion/react';
import {
    CalendarCheck, Wallet, Users, Target, Package, CalendarClock, AlertTriangle, Clock,
    ArrowRight, TrendingUp, TrendingDown, Sparkles, MessageSquare, History, FileBarChart,
} from 'lucide-react';
import type { Pulse, PulseTile, ReportOption, Tone } from './aiClient';
import { Lang, Suggestion } from './aiContext';

// ─── Bosh ekran: kun pulsi ────────────────────────────────────────────────────
//
// Panel ochilganda birinchi ko'rinadigan narsa — bo'sh maydon emas, klinikaning
// HOZIRGI holati. Har bir plitka bosiladi: savol yuboriladi yoki hisobot
// ochiladi. Ya'ni AI dan foydalanish uchun savol o'ylab topish shart emas.

const TILE_ICON: Record<PulseTile['key'], React.ElementType> = {
    appts: CalendarCheck,
    revenue: Wallet,
    debt: Users,
    leads: Target,
    stock: Package,
    tomorrow: CalendarClock,
};

const TONE_VALUE: Record<Tone, string> = {
    neutral: 'text-gray-900 dark:text-white',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
};

const TONE_ICON: Record<Tone, string> = {
    neutral: 'text-indigo-500 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10',
    good: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10',
    warn: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10',
    bad: 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10',
};

/**
 * Katta summa plitkaga sig'maydi ("12 900 0…" bo'lib kesilardi) — 10 mln dan
 * yuqorisi qisqartiriladi: "12,9 mln". Aniq raqam javob va hisobotda bor.
 */
const compactValue = (value: string, lang: Lang): string => {
    const digits = value.replace(/[\s  ]/g, '');
    if (!/^-?\d+$/.test(digits)) return value;
    const n = Number(digits);
    if (Math.abs(n) < 10_000_000) return value;
    const mln = n / 1_000_000;
    const s = (Math.abs(mln) >= 100 ? String(Math.round(mln)) : mln.toFixed(1).replace(/\.0$/, '')).replace('.', ',');
    return `${s} ${lang === 'ru' ? 'млн' : 'mln'}`;
};

/** 7 kunlik kichik grafik. Oxirgi nuqta — bugun, u ajratib ko'rsatiladi. */
const Spark: React.FC<{ values: number[] }> = ({ values }) => {
    if (!values?.length || values.every(v => v === 0)) return null;
    const w = 56;
    const h = 18;
    const max = Math.max(...values, 1);
    const step = w / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const [lx, ly] = pts[pts.length - 1];
    return (
        <svg width={w} height={h} className="overflow-visible text-indigo-400 dark:text-indigo-300" aria-hidden="true">
            <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
            <circle cx={lx} cy={ly} r="2.2" fill="currentColor" />
        </svg>
    );
};

const Tile: React.FC<{ tile: PulseTile; i: number; lang: Lang; onClick: () => void }> = ({ tile, i, lang, onClick }) => {
    const Icon = TILE_ICON[tile.key] || Sparkles;
    const value = compactValue(tile.value, lang);
    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClick}
            className="group text-left rounded-2xl p-3 bg-white dark:bg-white/[0.03]
                       ring-1 ring-gray-200/80 dark:ring-white/[0.07]
                       hover:ring-indigo-300 dark:hover:ring-indigo-400/40 hover:-translate-y-px
                       shadow-[0_1px_2px_rgba(15,23,42,.04)] transition-all"
        >
            <div className="flex items-center gap-2 mb-2">
                <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${TONE_ICON[tile.tone]}`}>
                    <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11.5px] font-medium text-gray-500 dark:text-gray-400 truncate">{tile.label}</span>
            </div>
            {/* Qiymat butun kenglikda: grafik yonida turganda summa kesilib qolardi */}
            <div
                className={`text-[20px] leading-none font-semibold tabular-nums truncate ${TONE_VALUE[tile.tone]}`}
                title={value !== tile.value ? `${tile.value} ${tile.unit || ''}` : undefined}
            >
                {value}
                {tile.unit && <span className="text-[11px] font-normal text-gray-400 ml-1">{tile.unit}</span>}
            </div>
            <div className="flex items-end justify-between gap-2 mt-1.5">
                <div className="min-w-0">
                    {typeof tile.delta === 'number' && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${tile.delta >= 0
                            ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {tile.delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {tile.delta > 0 ? '+' : ''}{tile.delta}%
                        </span>
                    )}
                    {tile.sub && (
                        <div className="text-[11.5px] leading-snug text-gray-400 dark:text-gray-500 line-clamp-2">{tile.sub}</div>
                    )}
                </div>
                {tile.spark && <span className="shrink-0 mb-0.5"><Spark values={tile.spark} /></span>}
            </div>
        </motion.button>
    );
};

const Section: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
    icon: Icon, title, children, aside,
}) => (
    <section>
        <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
            <Icon className="w-3.5 h-3.5" />
            {title}
            {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
        </div>
        {children}
    </section>
);

interface Props {
    lang: Lang;
    greeting: string;
    dateLabel: string;
    pulse: Pulse | null;
    pulseLoading: boolean;
    suggestions: Suggestion[];
    /** Takliflar nimaga tegishli: ochiq bemor, sahifa yoki umumiy. */
    contextKind?: 'patient' | 'page';
    reports: ReportOption[];
    conversations: { id: string; title: string; updatedAt: string }[];
    onAsk: (text: string) => void;
    onReport: (type: string) => void;
    onOpenPatient: (id: string) => void;
    onOpenConversation: (id: string) => void;
    onShowHistory: () => void;
}

export const AiPulse: React.FC<Props> = ({
    lang, greeting, dateLabel, pulse, pulseLoading, suggestions, contextKind, reports,
    conversations, onAsk, onReport, onOpenPatient, onOpenConversation, onShowHistory,
}) => {
    const ru = lang === 'ru';
    const suggestTitle = contextKind === 'patient'
        ? (ru ? 'По этому пациенту' : "Shu bemor bo'yicha")
        : contextKind === 'page'
            ? (ru ? 'По этой странице' : "Shu sahifa bo'yicha")
            : (ru ? 'Можно спросить' : "So'rash mumkin");

    const runTile = (t: PulseTile) => {
        if (t.action.type === 'ask') onAsk(t.action.text);
        else if (t.action.type === 'report') onReport(t.action.report);
    };

    const runSuggestion = (s: Suggestion) => {
        if (s.report) onReport(s.report);
        else if (s.ask) onAsk(s.ask);
    };

    return (
        <div className="px-4 pt-4 pb-6 space-y-5">
            <div>
                <h2 className="text-[19px] font-semibold tracking-tight text-gray-900 dark:text-white">{greeting}</h2>
                <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5 first-letter:uppercase">{dateLabel}</p>
            </div>

            {/* Keyingi bemor — resepshn va shifokor uchun kunning eng kerakli qatori */}
            {pulse?.next && (
                <button
                    onClick={() => onOpenPatient(pulse.next!.patientId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left group
                               bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white
                               shadow-[0_8px_20px_-10px_rgba(37,99,235,.7)]"
                >
                    <span className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center shrink-0">
                        <Clock className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] uppercase tracking-[0.1em] text-white/70">
                            {ru ? 'Следующий пациент' : 'Keyingi bemor'}
                            {pulse.inClinic > 0 && ` · ${pulse.inClinic} ${ru ? 'в клинике' : 'klinikada'}`}
                        </span>
                        <span className="block text-[14px] font-semibold truncate">
                            <span className="tabular-nums">{pulse.next.time}</span> · {pulse.next.patientName}
                        </span>
                        <span className="block text-[11.5px] text-white/75 truncate">
                            {[pulse.next.doctorName, pulse.next.type].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
            )}

            <Section icon={Sparkles} title={ru ? 'Пульс клиники' : 'Klinika pulsi'}>
                {pulse?.tiles?.length ? (
                    <div className="grid grid-cols-2 gap-2">
                        {pulse.tiles.map((t, i) => <Tile key={t.key} tile={t} i={i} lang={lang} onClick={() => runTile(t)} />)}
                    </div>
                ) : pulseLoading ? (
                    <div className="grid grid-cols-2 gap-2">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="rounded-2xl p-3 ring-1 ring-gray-200/80 dark:ring-white/[0.07]">
                                <div className="h-2.5 w-20 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse mb-3" />
                                <div className="h-5 w-14 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[12.5px] text-gray-400 dark:text-gray-500">
                        {ru ? 'Пульс сейчас недоступен — задайте вопрос ниже.' : "Puls hozir mavjud emas — pastda savol bering."}
                    </p>
                )}
                {!!pulse?.alerts?.length && (
                    <div className="mt-2 space-y-1.5">
                        {pulse.alerts.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl text-[12.5px]
                                                    bg-rose-50 text-rose-700 ring-1 ring-rose-200/70
                                                    dark:bg-rose-500/[0.08] dark:text-rose-300 dark:ring-rose-400/20">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                {a.text}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {suggestions.length > 0 && (
                <Section icon={MessageSquare} title={suggestTitle}>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map(s => (
                            <button
                                key={s.key}
                                onClick={() => runSuggestion(s)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium
                                           bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100
                                           hover:bg-indigo-100 hover:ring-indigo-200
                                           dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-400/20
                                           dark:hover:bg-indigo-500/20 transition-colors"
                            >
                                {s.report ? <FileBarChart className="w-3.5 h-3.5 opacity-70" /> : <Sparkles className="w-3.5 h-3.5 opacity-70" />}
                                {s.label}
                            </button>
                        ))}
                    </div>
                </Section>
            )}

            {reports.length > 0 && (
                <Section icon={FileBarChart} title={ru ? 'Отчёты в один клик' : 'Bir bosishda hisobot'}>
                    <div className="grid grid-cols-2 gap-1.5">
                        {reports.map(r => (
                            <button
                                key={r.type}
                                onClick={() => onReport(r.type)}
                                className="text-left px-3 py-2 rounded-xl transition-colors
                                           hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                            >
                                <span className="block text-[12.5px] font-medium text-gray-800 dark:text-gray-100 truncate">{r.title}</span>
                                <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{r.hint}</span>
                            </button>
                        ))}
                    </div>
                </Section>
            )}

            {conversations.length > 0 && (
                <Section
                    icon={History}
                    title={ru ? 'Недавние диалоги' : 'Oxirgi suhbatlar'}
                    aside={conversations.length > 3 ? (
                        <button onClick={onShowHistory} className="text-[11.5px] text-indigo-600 dark:text-indigo-300 hover:underline">
                            {ru ? 'Все' : 'Hammasi'} · {conversations.length}
                        </button>
                    ) : undefined}
                >
                    <div className="space-y-0.5">
                        {conversations.slice(0, 3).map(c => (
                            <button
                                key={c.id}
                                onClick={() => onOpenConversation(c.id)}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-[12.5px] text-gray-600 dark:text-gray-300
                                           truncate hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                            >
                                {c.title}
                            </button>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
};

export default AiPulse;
