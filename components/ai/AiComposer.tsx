import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Mic, Square, Loader2, AlertTriangle, Slash, FileBarChart, Sparkles, RotateCcw } from 'lucide-react';
import type { SlashCommand, Lang } from './aiContext';
import type { VoiceState } from '../../hooks/useVoiceInput';

// ─── Yozish maydoni ───────────────────────────────────────────────────────────
//
// Uchta kirish yo'li bitta joyda: matn, ovoz (F2) va "/" buyruqlari.
// "/" — tez ishlaydigan xodim uchun: "/qarz" deb Enter bosish hisobotni
// sichqonchasiz ochadi.

interface Voice {
    state: VoiceState;
    error: string | null;
    partial: string;
    toggle: () => void;
}

interface Props {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    onStop: () => void;
    busy: boolean;
    lang: Lang;
    placeholder: string;
    voice: Voice;
    voiceLang: 'uz' | 'ru';
    onToggleVoiceLang: () => void;
    commands: SlashCommand[];
    onCommand: (c: SlashCommand) => void;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    showHints: boolean;
}

export const AiComposer: React.FC<Props> = ({
    value, onChange, onSubmit, onStop, busy, lang, placeholder, voice, voiceLang, onToggleVoiceLang,
    commands, onCommand, inputRef, showHints,
}) => {
    const ru = lang === 'ru';
    const [active, setActive] = useState(0);

    // "/" bilan boshlangan va hali bo'sh joysiz — buyruq tanlanmoqda.
    const slash = /^\/\S*$/.test(value);
    const matches = useMemo(() => {
        if (!slash) return [];
        const q = value.slice(1).toLowerCase();
        return commands.filter(c => c.cmd.startsWith(q) || c.label.toLowerCase().includes(q));
    }, [slash, value, commands]);

    useEffect(() => { setActive(0); }, [value]);

    // Balandlik matnga qarab o'sadi (5 qatorgacha), keyin ichida suriladi.
    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [value, inputRef]);

    const listening = voice.state === 'listening';
    const processing = voice.state === 'processing';

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onCommand(matches[active]); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onChange(''); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!busy) onSubmit();
        }
    };

    const cmdIcon = (c: SlashCommand) =>
        'report' in c.run ? FileBarChart : 'reset' in c.run ? RotateCcw : Sparkles;

    return (
        <div className="relative">
            {/* "/" buyruqlari */}
            <AnimatePresence>
                {matches.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.14 }}
                        className="absolute bottom-full inset-x-0 mb-2 rounded-2xl overflow-y-auto max-h-[340px] z-10 dai-scroll
                                   bg-white dark:bg-[#131a23] ring-1 ring-gray-200 dark:ring-white/[0.08]
                                   shadow-[0_12px_32px_-12px_rgba(15,23,42,.35)]"
                        role="listbox"
                    >
                        <div className="sticky top-0 px-3 pt-2 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500
                                        bg-white dark:bg-[#131a23]">
                            {ru ? 'Команды' : 'Buyruqlar'}
                        </div>
                        {matches.map((c, i) => {
                            const Icon = cmdIcon(c);
                            return (
                                <button
                                    key={c.cmd}
                                    // Klaviatura bilan tanlangan qator ro'yxat ichida ko'rinib tursin.
                                    ref={i === active ? (el => el?.scrollIntoView({ block: 'nearest' })) : undefined}
                                    role="option"
                                    aria-selected={i === active}
                                    onMouseEnter={() => setActive(i)}
                                    onMouseDown={e => { e.preventDefault(); onCommand(c); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === active
                                        ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}
                                >
                                    <Icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-300 shrink-0" />
                                    <span className="text-[12.5px] font-mono text-indigo-600 dark:text-indigo-300 shrink-0">/{c.cmd}</span>
                                    <span className="text-[12.5px] text-gray-800 dark:text-gray-100 truncate">{c.label}</span>
                                    <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[40%]">{c.hint}</span>
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Ovoz holati: foydalanuvchi nima eshitilayotganini KO'RISHI kerak */}
            <AnimatePresence>
                {(listening || processing || voice.error) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-2.5 px-1 pb-2 text-[12.5px]">
                            {voice.error ? (
                                <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span className="text-rose-600 dark:text-rose-400">{voice.error}</span>
                                </>
                            ) : processing ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 shrink-0" />
                                    <span className="text-gray-500 dark:text-gray-400">{ru ? 'Распознаю речь…' : 'Ovoz matnga aylantirilmoqda…'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="dai-wave text-rose-500 shrink-0"><i /><i /><i /><i /><i /></span>
                                    <span className="text-gray-700 dark:text-gray-200 truncate">
                                        {voice.partial || (ru ? 'Слушаю…' : 'Tinglayapman…')}
                                    </span>
                                    <span className="ml-auto text-[11px] text-gray-400 shrink-0">{voiceLang.toUpperCase()} · Esc</span>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`flex items-end gap-1.5 rounded-2xl pl-3.5 pr-1.5 py-1.5 transition-shadow
                             bg-white dark:bg-white/[0.04]
                             ring-1 ${listening ? 'ring-rose-300 dark:ring-rose-400/40' : 'ring-gray-200 dark:ring-white/[0.1]'}
                             focus-within:ring-2 focus-within:ring-indigo-400/70
                             shadow-[0_2px_10px_-4px_rgba(15,23,42,.12)]`}>
                <textarea
                    ref={inputRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className="flex-1 min-w-0 resize-none bg-transparent outline-none py-1.5 text-[14px] leading-snug
                               text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 dai-scroll"
                />

                {/* Diktovka tili interfeys tilidan MUSTAQIL: ruscha interfeysdagi
                    klinika ham bemor ismini o'zbekcha aytadi. */}
                <button
                    type="button"
                    onClick={onToggleVoiceLang}
                    title={voiceLang === 'uz' ? "Diktovka tili: o'zbek" : 'Язык диктовки: русский'}
                    className="mb-1 px-1.5 py-1 rounded-md text-[10.5px] font-bold tracking-wide text-gray-400
                               hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                    {voiceLang.toUpperCase()}
                </button>

                <button
                    type="button"
                    onClick={voice.toggle}
                    disabled={busy && !listening}
                    title={`${ru ? 'Голосом' : 'Ovoz bilan'} (F2)`}
                    aria-label={ru ? 'Голосовой ввод' : 'Ovoz bilan kiritish'}
                    className={`w-9 h-9 grid place-items-center rounded-xl transition-colors disabled:opacity-40 ${listening
                        ? 'bg-rose-500 text-white'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'}`}
                >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                </button>

                {busy ? (
                    <button
                        type="button"
                        onClick={onStop}
                        title={ru ? 'Остановить' : "To'xtatish"}
                        aria-label={ru ? 'Остановить' : "To'xtatish"}
                        className="w-9 h-9 grid place-items-center rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    >
                        <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={!value.trim()}
                        aria-label={ru ? 'Отправить' : 'Yuborish'}
                        className="w-9 h-9 grid place-items-center rounded-xl text-white transition-all
                                   bg-gradient-to-br from-indigo-500 via-blue-600 to-sky-500 shadow-sm
                                   disabled:from-gray-200 disabled:via-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:shadow-none
                                   dark:disabled:from-white/[0.08] dark:disabled:via-white/[0.08] dark:disabled:to-white/[0.08] dark:disabled:text-gray-500"
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                )}
            </div>

            {showHints && (
                <div className="flex items-center gap-3 px-1 pt-1.5 text-[10.5px] text-gray-400 dark:text-gray-500">
                    <span><kbd className="font-sans">Enter</kbd> — {ru ? 'отправить' : 'yuborish'}</span>
                    <span className="inline-flex items-center gap-0.5"><Slash className="w-2.5 h-2.5" /> — {ru ? 'команды' : 'buyruqlar'}</span>
                    <span><kbd className="font-sans">F2</kbd> — {ru ? 'голос' : 'ovoz'}</span>
                    <span className="ml-auto"><kbd className="font-sans">Ctrl /</kbd> — {ru ? 'панель' : 'panel'}</span>
                </div>
            )}
        </div>
    );
};

export default AiComposer;
