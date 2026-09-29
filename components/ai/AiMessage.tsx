import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
    Check, X, Loader2, AlertTriangle, ThumbsUp, ThumbsDown, Send, Copy, RotateCcw,
    MapPin, Inbox, CornerDownRight,
} from 'lucide-react';
import type { Evidence, PendingAction, Report, Tone } from './aiClient';
import { AiEvidence } from './AiEvidence';
import { AiOrb } from './AiOrb';
import { Lang, Suggestion, sourceLabel } from './aiContext';

// ─── Suhbatning bitta almashinuvi ─────────────────────────────────────────────

export interface Step {
    name: string;
    done: boolean;
    ok: boolean;
}

export interface Turn {
    id: string;
    kind: 'ask' | 'report';
    q: string;
    /** Savol berilgan paytdagi kontekst ("Aliyev Sardor", "Kalendar"). */
    ctxLabel?: string;
    a: string;
    status: 'streaming' | 'done' | 'error';
    /** AI qaysi ma'lumotni o'qiyotgani — jonli ko'rsatiladi. */
    steps: Step[];
    sources: string[];
    cards: Evidence[];
    report?: Report;
    action?: PendingAction | null;
    /** `cancelled` — foydalanuvchi o'zi bekor qildi (xato emas, kulrang ko'rinadi). */
    actionResult?: { ok: boolean; message: string; cancelled?: boolean } | null;
    logId?: string | null;
    rating?: number;
    error?: string;
    /** Provayder limitga urilgan — shuncha soniya kutilmoqda. */
    waitSeconds?: number;
    /** Saqlangan suhbatdan tiklangan: kartochka va baho yo'q. */
    restored?: boolean;
}

// ─── Matn: raqamlar ko'zga tashlansin ────────────────────────────────────────
//
// Server markdownni tozalaydi (aiService.ts, stripMarkdown), ya'ni matn oddiy.
// Uni o'qishni osonlashtiradigan yagona narsa — raqamlar va summalarni
// ajratib ko'rsatish: ko'z birinchi bo'lib aynan shularni qidiradi.

const NUM_RE = /(\d{1,3}(?:[   ]\d{3})+|\d+(?:[.,]\d+)?)(\s?(?:so['ʻ’]m|сум|ta\b|шт|nafar|%|foiz))?/g;

const highlight = (line: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(line)) !== null) {
        // Sana va vaqt (2026-09-30, 14:30) ajratilmaydi — ular summa emas.
        const before = line[m.index - 1];
        const after = line[m.index + m[0].length];
        if (before === '-' || before === ':' || after === ':' || after === '-') continue;
        if (m.index > last) out.push(line.slice(last, m.index));
        out.push(
            <span key={m.index} className="font-semibold tabular-nums text-gray-900 dark:text-white">{m[0]}</span>
        );
        last = m.index + m[0].length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
};

export const RichText: React.FC<{ text: string; caret?: boolean }> = ({ text, caret }) => {
    const lines = text.split('\n');
    return (
        <div className="text-[14px] leading-[1.6] text-gray-700 dark:text-gray-300 space-y-1">
            {lines.map((raw, i) => {
                const isLast = i === lines.length - 1;
                const tail = caret && isLast
                    ? <span className="inline-block w-[2px] h-[1.05em] align-[-0.18em] ml-0.5 bg-indigo-500 animate-pulse" />
                    : null;
                const bullet = raw.match(/^\s*(?:•|-|\d+[.)])\s+(.*)$/);
                if (bullet) {
                    return (
                        <div key={i} className="flex gap-2 pl-0.5">
                            <span className="mt-[9px] w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                            <span>{highlight(bullet[1])}{tail}</span>
                        </div>
                    );
                }
                if (!raw.trim()) return <div key={i} className="h-1" />;
                return <p key={i}>{highlight(raw)}{tail}</p>;
            })}
        </div>
    );
};

// ─── O'qilayotgan manbalar ───────────────────────────────────────────────────

const Trail: React.FC<{ steps: Step[]; lang: Lang; live: boolean }> = ({ steps, lang, live }) => {
    if (!steps.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {steps.map((s, i) => (
                <span
                    key={`${s.name}-${i}`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 transition-colors ${s.done
                        ? s.ok
                            ? 'text-gray-500 ring-gray-200 dark:text-gray-400 dark:ring-white/[0.08]'
                            : 'text-rose-600 ring-rose-200 dark:text-rose-300 dark:ring-rose-400/25'
                        : 'text-indigo-600 ring-indigo-200 bg-indigo-50/60 dark:text-indigo-300 dark:ring-indigo-400/25 dark:bg-indigo-500/10'}`}
                >
                    {!s.done && live
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : s.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {sourceLabel(s.name, lang)}
                </span>
            ))}
        </div>
    );
};

// ─── Tasdiqlash kartasi ──────────────────────────────────────────────────────
//
// AI ma'lumotni O'ZGARTIRADIGAN narsani faqat TAYYORLAYDI — bajarish qarori
// foydalanuvchida. Shuning uchun karta nima bo'lishini to'liq ko'rsatadi:
// kimga, qanday matn, nechta yozuvga ta'sir qiladi.

const ActionCard: React.FC<{
    action: PendingAction;
    result?: { ok: boolean; message: string; cancelled?: boolean } | null;
    busy: boolean;
    lang: Lang;
    onConfirm: () => void;
    onChoose: (id: string) => void;
    onCancel: () => void;
}> = ({ action, result, busy, lang, onConfirm, onChoose, onCancel }) => {
    const ru = lang === 'ru';
    const [expanded, setExpanded] = useState(false);
    const { preview } = action;

    if (result?.cancelled) {
        return (
            <div className="rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-[12.5px]
                            text-gray-500 ring-1 ring-gray-200 dark:text-gray-400 dark:ring-white/[0.08]">
                <X className="w-3.5 h-3.5 shrink-0" />
                {result.message}
            </div>
        );
    }

    if (result) {
        return (
            <div className={`rounded-2xl px-3.5 py-3 flex items-start gap-2.5 ring-1 text-[13px] ${result.ok
                ? 'ring-emerald-200 bg-emerald-50 text-emerald-800 dark:ring-emerald-400/25 dark:bg-emerald-500/[0.08] dark:text-emerald-200'
                : 'ring-rose-200 bg-rose-50 text-rose-800 dark:ring-rose-400/25 dark:bg-rose-500/[0.08] dark:text-rose-200'}`}>
                {result.ok ? <Check className="w-4 h-4 mt-px shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-px shrink-0" />}
                {result.message}
            </div>
        );
    }

    const shown = expanded ? preview.items : preview.items.slice(0, 5);
    const hidden = preview.items.length - shown.length;

    return (
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-indigo-200 dark:ring-indigo-400/25
                        bg-white dark:bg-white/[0.03]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-violet-500" />
            <div className="px-3.5 pt-3.5 pb-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-indigo-500 dark:text-indigo-300 mb-1">
                    {preview.choices?.length ? (ru ? 'Нужно выбрать' : 'Tanlash kerak') : (ru ? 'Ждёт подтверждения' : 'Tasdiqlashingiz kutilmoqda')}
                </div>
                <div className="text-[14px] font-semibold text-gray-900 dark:text-white">{preview.title}</div>
                <div className="text-[12.5px] text-gray-600 dark:text-gray-300 mt-0.5">{preview.summary}</div>
            </div>

            {preview.message && (
                <div className="px-3.5 pb-2.5">
                    <div className="rounded-xl px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap
                                    bg-gray-50 text-gray-700 dark:bg-white/[0.04] dark:text-gray-300
                                    border-l-2 border-indigo-400">
                        {preview.message}
                    </div>
                </div>
            )}

            {preview.items.length > 0 && (
                <div className="px-3.5 pb-2.5 space-y-1">
                    {shown.map((it, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                            <span className="text-gray-500 dark:text-gray-400 truncate">{it.label}</span>
                            {it.detail && <span className="text-gray-900 dark:text-gray-100 tabular-nums text-right">{it.detail}</span>}
                        </div>
                    ))}
                    {hidden > 0 && (
                        <button onClick={() => setExpanded(true)} className="text-[12px] text-indigo-600 dark:text-indigo-300 hover:underline">
                            {ru ? `+ ещё ${hidden}` : `+ yana ${hidden} ta`}
                        </button>
                    )}
                </div>
            )}

            {preview.warning && (
                <div className="mx-3.5 mb-2.5 flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    {preview.warning}
                </div>
            )}

            {/* Bir nechta bemor yoki xizmat mos kelganda — bosiladigan ro'yxat.
                Model "qaysi biri?" deb so'rasa, "ikkinchisi" degan javobni u
                eslay olmasdi; tanlov serverda saqlanadi va model qatnashmaydi. */}
            {preview.choices?.length ? (
                <div className="px-3.5 pb-3 space-y-1.5">
                    {preview.choices.map(c => (
                        <button
                            key={c.id}
                            onClick={() => onChoose(c.id)}
                            disabled={busy}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors
                                       ring-1 ring-gray-200 hover:ring-indigo-400 hover:bg-indigo-50/50
                                       dark:ring-white/[0.08] dark:hover:ring-indigo-400/40 dark:hover:bg-indigo-500/10
                                       disabled:opacity-50"
                        >
                            <span className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{c.label}</span>
                            {c.detail && <span className="text-[11.5px] text-gray-500 dark:text-gray-400 shrink-0">{c.detail}</span>}
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="px-3.5 py-2.5 flex items-center gap-2 border-t border-gray-100 dark:border-white/[0.06]">
                {!preview.choices?.length && (
                    <button
                        onClick={onConfirm}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white
                                   bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500
                                   shadow-sm disabled:opacity-50 transition-colors"
                    >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {preview.confirmLabel || (ru ? 'Подтвердить' : 'Tasdiqlash')}
                    </button>
                )}
                <button
                    onClick={onCancel}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-gray-600 dark:text-gray-300
                               hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                    {ru ? 'Отмена' : 'Bekor qilish'}
                </button>
            </div>
        </div>
    );
};

// ─── Tayyor hisobot ──────────────────────────────────────────────────────────

const TONE: Record<Tone, string> = {
    neutral: 'text-gray-900 dark:text-white',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
};

const fmtValue = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('ru-RU') : v);

const ReportView: React.FC<{ report: Report; lang: Lang }> = ({ report, lang }) => {
    const ru = lang === 'ru';
    if (report.empty) {
        return (
            <div className="rounded-2xl px-4 py-6 text-center ring-1 ring-gray-200/80 dark:ring-white/[0.07]">
                <Inbox className="w-5 h-5 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <div className="text-[13px] text-gray-600 dark:text-gray-300">{report.emptyText || (ru ? 'Нет данных' : "Ma'lumot yo'q")}</div>
            </div>
        );
    }
    return (
        <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{report.title}</span>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{report.period}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {report.metrics.map((m, i) => (
                    <motion.div
                        key={m.label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-xl px-3 py-2.5 bg-white dark:bg-white/[0.03] ring-1 ring-gray-200/80 dark:ring-white/[0.07]"
                    >
                        <div className="text-[10.5px] uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500 truncate">{m.label}</div>
                        <div className={`text-[17px] font-semibold tabular-nums truncate ${TONE[m.tone || 'neutral']}`}>
                            {fmtValue(m.value)}
                            {m.unit && <span className="text-[11px] font-normal text-gray-400 ml-1">{m.unit}</span>}
                        </div>
                        {m.hint && <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{m.hint}</div>}
                    </motion.div>
                ))}
            </div>
            {report.narrative && <RichText text={report.narrative} />}
            {report.table && report.table.rows.length > 0 && (
                <div className="rounded-xl overflow-hidden ring-1 ring-gray-200/80 dark:ring-white/[0.07]">
                    <div className="overflow-x-auto dai-scroll max-h-72">
                        <table className="w-full text-[12px]">
                            <thead className="sticky top-0 bg-gray-50 dark:bg-[#111821]">
                                <tr>
                                    {report.table.columns.map(c => (
                                        <th key={c} className="text-left font-medium px-3 py-1.5 whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-gray-400 dark:text-gray-500">{c}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.table.rows.map((row, i) => (
                                    <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05]">
                                        {row.map((cell, j) => (
                                            <td key={j} className={`px-3 py-1.5 whitespace-nowrap ${j
                                                ? 'tabular-nums text-gray-500 dark:text-gray-400'
                                                : 'text-gray-800 dark:text-gray-200'}`}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Baho ────────────────────────────────────────────────────────────────────
// 👎 bosilgan javob backendda belgilanadi va etalon to'plamni to'ldiradi
// (ai/log.ts). Shuning uchun "nima xato edi?" degan bitta qator so'raladi.

const Feedback: React.FC<{ rating?: number; lang: Lang; onRate: (r: number, note?: string) => void }> = ({ rating, lang, onRate }) => {
    const ru = lang === 'ru';
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');

    if (noteOpen) {
        return (
            <div className="flex items-center gap-1.5 w-full max-w-xs">
                <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { onRate(-1, note); setNoteOpen(false); } }}
                    autoFocus
                    placeholder={ru ? 'Что было не так?' : 'Nima xato edi?'}
                    className="flex-1 min-w-0 rounded-lg px-2.5 py-1 text-[12px] outline-none
                               bg-white dark:bg-white/[0.04] ring-1 ring-gray-200 dark:ring-white/[0.08]
                               focus:ring-indigo-400 text-gray-900 dark:text-white"
                />
                <button onClick={() => { onRate(-1, note); setNoteOpen(false); }} className="p-1 text-indigo-600 dark:text-indigo-300">
                    <Send className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }
    if (rating) {
        return <span className="text-[11px] text-gray-400 dark:text-gray-500">{ru ? 'Спасибо!' : 'Rahmat!'}</span>;
    }
    return (
        <>
            <button
                onClick={() => onRate(1)}
                title={ru ? 'Полезно' : 'Foydali'}
                className="p-1 rounded-md text-gray-300 hover:text-emerald-500 dark:text-gray-600 dark:hover:text-emerald-400 transition-colors"
            >
                <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={() => { onRate(-1); setNoteOpen(true); }}
                title={ru ? 'Бесполезно' : 'Foydasiz'}
                className="p-1 rounded-md text-gray-300 hover:text-rose-500 dark:text-gray-600 dark:hover:text-rose-400 transition-colors"
            >
                <ThumbsDown className="w-3.5 h-3.5" />
            </button>
        </>
    );
};

// ─── Asosiy ──────────────────────────────────────────────────────────────────

interface Props {
    turn: Turn;
    lang: Lang;
    elapsed: number;
    actionBusy: boolean;
    followUps: Suggestion[];
    onConfirm: (choiceId?: string) => void;
    onCancelAction: () => void;
    onRate: (rating: number, note?: string) => void;
    onFollowUp: (s: Suggestion) => void;
    onRetry: () => void;
    onOpenPatient: (id: string) => void;
    onPickSlot?: (doctorName: string, date: string, time: string) => void;
}

export const AiMessage: React.FC<Props> = ({
    turn, lang, elapsed, actionBusy, followUps, onConfirm, onCancelAction, onRate, onFollowUp,
    onRetry, onOpenPatient, onPickSlot,
}) => {
    const ru = lang === 'ru';
    const [copied, setCopied] = useState(false);
    const live = turn.status === 'streaming';
    const waiting = live && !turn.a && !turn.report;

    const copy = () => {
        const text = turn.report ? `${turn.report.title}\n${turn.report.narrative}` : turn.a;
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => { /* ruxsat yo'q — jim o'tamiz */ });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
        >
            {/* Savol */}
            <div className="flex flex-col items-end gap-1 pl-10">
                {turn.ctxLabel && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-gray-400 dark:text-gray-500">
                        <MapPin className="w-2.5 h-2.5" />
                        {turn.ctxLabel}
                    </span>
                )}
                <div className="px-3.5 py-2 rounded-2xl rounded-br-md text-[13.5px] leading-snug whitespace-pre-wrap break-words
                                bg-gray-900 text-white dark:bg-indigo-500/20 dark:text-indigo-50 dark:ring-1 dark:ring-indigo-400/25">
                    {turn.kind === 'report' && <span className="opacity-60 mr-1">▦</span>}
                    {turn.q}
                </div>
            </div>

            {/* Javob */}
            <div className="flex gap-2.5">
                <AiOrb size={22} state={live ? 'thinking' : 'idle'} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-2.5">
                    <Trail steps={turn.steps} lang={lang} live={live} />

                    {waiting && (
                        <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-gray-400">
                            <span className="dai-shine">
                                {turn.waitSeconds
                                    ? (ru ? `Модель занята — ждём ${turn.waitSeconds} с` : `Model band — ${turn.waitSeconds} s kutilmoqda`)
                                    : turn.steps.length
                                        ? (ru ? 'Сверяю данные' : "Ma'lumotlarni solishtiryapman")
                                        : (ru ? 'Думаю' : "O'ylayapman")}
                            </span>
                            {elapsed > 4 && <span className="tabular-nums text-gray-400">{elapsed}s</span>}
                        </div>
                    )}

                    {turn.status === 'error' ? (
                        <div className="rounded-2xl px-3.5 py-3 ring-1 ring-rose-200 bg-rose-50 dark:ring-rose-400/25 dark:bg-rose-500/[0.08]">
                            <div className="flex items-start gap-2 text-[13px] text-rose-700 dark:text-rose-200">
                                <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
                                <span>{turn.error}</span>
                            </div>
                            <button
                                onClick={onRetry}
                                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-700 dark:text-rose-200 hover:underline"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                {ru ? 'Повторить' : 'Qayta urinish'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {turn.report && <ReportView report={turn.report} lang={lang} />}
                            {turn.a && !turn.report && <RichText text={turn.a} caret={live} />}
                        </>
                    )}

                    {turn.cards.length > 0 && (
                        <AiEvidence cards={turn.cards} lang={lang} onOpenPatient={onOpenPatient} onPickSlot={onPickSlot} />
                    )}

                    {(turn.action || turn.actionResult) && (
                        <ActionCard
                            action={turn.action || { id: '', name: '', preview: { title: '', summary: '', items: [], confirmLabel: '' } }}
                            result={turn.actionResult}
                            busy={actionBusy}
                            lang={lang}
                            onConfirm={() => onConfirm()}
                            onChoose={id => onConfirm(id)}
                            onCancel={onCancelAction}
                        />
                    )}

                    {turn.status === 'done' && (
                        <div className="flex items-center gap-1 flex-wrap">
                            {followUps.map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => onFollowUp(s)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px]
                                               text-indigo-700 bg-indigo-50 hover:bg-indigo-100
                                               dark:text-indigo-200 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 transition-colors"
                                >
                                    <CornerDownRight className="w-3 h-3 opacity-60" />
                                    {s.label}
                                </button>
                            ))}
                            <span className="ml-auto inline-flex items-center gap-0.5">
                                {!!turn.sources.length && !turn.steps.length && (
                                    <span className="text-[10.5px] text-gray-400 dark:text-gray-500 mr-1.5 truncate max-w-[160px]">
                                        {turn.sources.filter((s, i) => turn.sources.indexOf(s) === i).map(s => sourceLabel(s, lang)).join(' · ')}
                                    </span>
                                )}
                                <button
                                    onClick={copy}
                                    title={ru ? 'Копировать' : 'Nusxa olish'}
                                    className="p-1 rounded-md text-gray-300 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                {turn.logId && !turn.restored && (
                                    <Feedback rating={turn.rating} lang={lang} onRate={onRate} />
                                )}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default AiMessage;
