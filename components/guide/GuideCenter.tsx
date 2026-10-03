/**
 * O'quv markazi — sarlavhadagi "Qo'llanma" tugmasi ochadi.
 *
 * Bosh oyna: to'liq tanishuv, "Qanday qilinadi?" (murakkab ishlar qadamma-qadam) va
 * sahifa qo'llanmalari. Qo'llanma tugagach — konfetti va natija; o'rganilganlar
 * shu brauzerda, har bir xodimga alohida saqlanadi.
 *
 * Bu modul faqat tugma bosilganda yuklanadi (App — dinamik import).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { ArrowRight, CheckCircle2, GraduationCap, Play, RotateCcw, Sparkles, Trophy, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { availableGuides, pageGuideFor, stepsFor, type Guide, type GuideContext } from './guides';
import { GuideRunner } from './GuideRunner';
import { burstConfetti } from './confetti';

export interface GuideCenterProps {
    ctx: GuideContext;
    onClose: () => void;
}

// ── O'rganilganlar ──────────────────────────────────────────────────────────

const storageKey = (userKey: string) => `denta_guide_done_v1:${userKey}`;

function loadDone(userKey: string): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(userKey)) || '[]');
        return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function saveDone(userKey: string, ids: string[]): void {
    try { localStorage.setItem(storageKey(userKey), JSON.stringify(ids)); } catch { /* shaxsiy rejim — saqlanmasa ham ishlaydi */ }
}

// ── Kichik bezaklar ─────────────────────────────────────────────────────────

const ProgressRing: React.FC<{ done: number; total: number; reduced: boolean }> = ({ done, total, reduced }) => {
    const r = 19;
    const c = 2 * Math.PI * r;
    const p = total > 0 ? done / total : 0;
    return (
        <div className="relative h-14 w-14 shrink-0" aria-hidden="true">
            <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
                <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-white/20" />
                <motion.circle
                    cx="24" cy="24" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
                    className="stroke-white"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c * (1 - p) }}
                    transition={{ duration: reduced ? 0 : 1, ease: 'easeOut', delay: reduced ? 0 : 0.2 }}
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black tabular-nums">
                {done}/{total}
            </span>
        </div>
    );
};

const AnimatedCheck: React.FC<{ reduced: boolean }> = ({ reduced }) => (
    <div className="relative mx-auto h-20 w-20">
        {!reduced && (
            <motion.span
                className="absolute inset-0 rounded-full bg-emerald-400/40"
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 1.7, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
            />
        )}
        <motion.svg viewBox="0 0 64 64" className="relative h-20 w-20" initial={{ scale: reduced ? 1 : 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
            <circle cx="32" cy="32" r="30" className="fill-emerald-500" />
            <motion.path
                d="M19 33.5 L28 42 L45 23"
                fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: reduced ? 0 : 0.3, duration: reduced ? 0 : 0.45, ease: 'easeOut' }}
            />
        </motion.svg>
    </div>
);

// ── Asosiy komponent ────────────────────────────────────────────────────────

type View = 'home' | 'run' | 'done';

const GuideCenter: React.FC<GuideCenterProps> = ({ ctx, onClose }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const reduced = !!useReducedMotion();

    const { tour, pages, tasks } = useMemo(() => availableGuides(ctx), [ctx]);
    const all = useMemo(() => [tour, ...tasks, ...pages], [tour, tasks, pages]);
    const [view, setView] = useState<View>('home');
    const [active, setActive] = useState<Guide | null>(null);
    const [run, setRun] = useState(0);
    const [done, setDone] = useState<string[]>(() => loadDone(ctx.userKey));
    /** Oxirgi qo'llanma birinchi marta o'rganildimi (natija chizig'i shunda o'sadi) */
    const [gained, setGained] = useState(false);
    // Klaviatura bilan: oyna ochilganda Enter — to'liq tanishuvni boshlaydi
    const heroRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (view === 'home') heroRef.current?.focus({ preventScroll: true });
    }, [view]);

    const doneCount = all.filter(g => done.includes(g.id)).length;
    const allDone = doneCount === all.length;
    const current = pageGuideFor(pages, location.pathname);
    // Joriy sahifaning qo'llanmasi birinchi turadi
    const pageList = current ? [current, ...pages.filter(p => p !== current)] : pages;

    const start = (g: Guide) => {
        setActive(g);
        setRun(r => r + 1);
        setView('run');
    };
    const finish = () => {
        const isNew = !!active && !done.includes(active.id);
        if (active && isNew) {
            const next = [...done, active.id];
            setDone(next);
            saveDone(ctx.userKey, next);
        }
        setGained(isNew);
        burstConfetti();
        setView('done');
    };

    // Bosh oyna va natija oynasida Esc — yopish (qo'llanma paytida uni dvigatel o'zi ushlaydi)
    useEffect(() => {
        if (view === 'run') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [view, onClose]);

    const meta = (g: Guide) => t('guide.center.meta')
        .replace('{steps}', String(stepsFor(g, ctx).length))
        .replace('{min}', String(g.minutes));

    const list: Variants = {
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : 0.05, delayChildren: reduced ? 0 : 0.12 } },
    };
    const item: Variants = {
        hidden: { opacity: 0, y: reduced ? 0 : 14 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
    };
    const lift = reduced ? undefined : { y: -3 };
    const press = reduced ? undefined : { scale: 0.98 };
    const TourIcon = tour.icon;
    const tourDone = done.includes(tour.id);

    return createPortal(
        <>
            <AnimatePresence>
                {view === 'home' && (
                    <motion.div
                        key="home"
                        className="fixed inset-0 z-[1010] flex items-end justify-center sm:items-center sm:p-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                        <div className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" onClick={onClose} />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="guide-center-title"
                            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-gray-900 sm:max-h-[88vh] sm:max-w-[760px] sm:rounded-3xl"
                            initial={{ y: reduced ? 0 : 40, scale: reduced ? 1 : 0.97 }}
                            animate={{ y: 0, scale: 1 }}
                            exit={{ y: reduced ? 0 : 30, scale: reduced ? 1 : 0.97 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                        >
                            {/* Sarlavha */}
                            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-primary-600 via-indigo-600 to-violet-600 px-5 pb-6 pt-5 text-white sm:px-7 sm:pt-6">
                                {!reduced && (
                                    <>
                                        <motion.span
                                            aria-hidden="true"
                                            className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
                                            animate={{ x: [0, -24, 0], y: [0, 14, 0] }}
                                            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                                        />
                                        <motion.span
                                            aria-hidden="true"
                                            className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-fuchsia-400/25 blur-3xl"
                                            animate={{ x: [0, 28, 0], y: [0, -12, 0] }}
                                            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
                                        />
                                    </>
                                )}
                                <div className="relative flex items-center gap-4">
                                    <motion.div
                                        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"
                                        animate={reduced ? undefined : { y: [0, -4, 0], rotate: [0, -5, 0] }}
                                        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        {allDone ? <Trophy className="h-7 w-7" /> : <GraduationCap className="h-7 w-7" />}
                                        {!reduced && (
                                            <motion.span
                                                aria-hidden="true"
                                                className="absolute -right-2 -top-2 text-amber-200"
                                                animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85], rotate: [0, 18, 0] }}
                                                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                                            >
                                                <Sparkles className="h-4 w-4" />
                                            </motion.span>
                                        )}
                                    </motion.div>
                                    <div className="min-w-0 flex-1">
                                        <h2 id="guide-center-title" className="text-xl font-black tracking-tight sm:text-2xl">{t('guide.center.title')}</h2>
                                        <p className="mt-0.5 text-sm text-white/80">
                                            {allDone ? t('guide.done.all') : t('guide.center.subtitle')}
                                        </p>
                                    </div>
                                    <div className="hidden sm:block">
                                        <ProgressRing done={doneCount} total={all.length} reduced={reduced} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label={t('guide.close')}
                                        className="-mr-2 -mt-6 self-start rounded-xl p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white sm:-mt-2"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                                <p className="relative mt-3 text-xs font-semibold text-white/75 sm:hidden">
                                    {t('guide.center.progress').replace('{done}', String(doneCount)).replace('{total}', String(all.length))}
                                </p>
                            </div>

                            {/* Ro'yxatlar */}
                            <motion.div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6" variants={list} initial="hidden" animate="show">
                                {/* To'liq tanishuv */}
                                <motion.button
                                    ref={heroRef}
                                    type="button"
                                    variants={item}
                                    whileHover={lift}
                                    whileTap={press}
                                    onClick={() => start(tour)}
                                    className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 bg-gradient-to-br from-primary-50 via-white to-violet-50 p-4 text-left shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary-600/10 dark:border-primary-900/50 dark:from-primary-900/30 dark:via-gray-900 dark:to-violet-900/20 sm:p-5"
                                >
                                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-violet-600 text-white shadow-lg shadow-primary-600/30">
                                        {!reduced && (
                                            <motion.span
                                                aria-hidden="true"
                                                className="absolute inset-0 rounded-2xl ring-2 ring-primary-400"
                                                animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
                                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                                            />
                                        )}
                                        {tourDone ? <RotateCcw className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            {tourDone ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('guide.center.doneBadge')}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-black uppercase tracking-widest text-primary-600 dark:text-primary-300">{t('guide.center.recommended')}</span>
                                            )}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 text-lg font-extrabold text-gray-900 dark:text-white">
                                            <TourIcon className="h-4 w-4 text-primary-500" /> {t(tour.title)}
                                        </span>
                                        <span className="mt-0.5 block text-sm leading-snug text-gray-600 dark:text-gray-300">{t(tour.desc)}</span>
                                        <span className="mt-1.5 block text-xs font-semibold text-gray-400">{meta(tour)}</span>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary-600/25 sm:inline-flex">
                                        {tourDone ? t('guide.center.again') : t('guide.center.start')}
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                </motion.button>

                                {/* Qanday qilinadi? */}
                                {tasks.length > 0 && (
                                    <section>
                                        <motion.div variants={item} className="mb-3">
                                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{t('guide.center.tasks')}</h3>
                                            <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('guide.center.tasksHint')}</p>
                                        </motion.div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {tasks.map(g => {
                                                const TaskIcon = g.icon;
                                                const isDone = done.includes(g.id);
                                                return (
                                                    <motion.button
                                                        key={g.id}
                                                        type="button"
                                                        variants={item}
                                                        whileHover={lift}
                                                        whileTap={press}
                                                        onClick={() => start(g)}
                                                        className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-[border-color,box-shadow] hover:border-primary-300 hover:shadow-lg hover:shadow-primary-600/5 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-primary-700"
                                                    >
                                                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${g.tone} text-white shadow-md`}>
                                                            <TaskIcon className="h-5 w-5" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900 dark:text-white">{t(g.title)}</span>
                                                                {isDone && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label={t('guide.center.doneBadge')} />}
                                                            </span>
                                                            <span className="mt-0.5 block text-[13px] leading-snug text-gray-500 dark:text-gray-400">{t(g.desc)}</span>
                                                            <span className="mt-1.5 block text-[11px] font-semibold text-gray-400">{meta(g)}</span>
                                                        </span>
                                                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500 dark:text-gray-600" />
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Sahifalar bo'yicha */}
                                {pageList.length > 0 && (
                                    <section>
                                        <motion.h3 variants={item} className="mb-3 text-base font-extrabold text-gray-900 dark:text-white">{t('guide.center.pages')}</motion.h3>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            {pageList.map(g => {
                                                const PageIcon = g.icon;
                                                const isDone = done.includes(g.id);
                                                const here = g === current;
                                                return (
                                                    <motion.button
                                                        key={g.id}
                                                        type="button"
                                                        variants={item}
                                                        whileHover={lift}
                                                        whileTap={press}
                                                        onClick={() => start(g)}
                                                        className={`relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow] hover:shadow-lg hover:shadow-primary-600/5 ${here
                                                            ? 'border-primary-300 bg-primary-50/60 dark:border-primary-700 dark:bg-primary-900/20'
                                                            : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-primary-700'}`}
                                                    >
                                                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${g.tone} text-white`}>
                                                            <PageIcon className="h-4 w-4" />
                                                        </span>
                                                        <span className="flex items-center gap-1 text-sm font-bold text-gray-900 dark:text-white">
                                                            {t(g.title)}
                                                            {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label={t('guide.center.doneBadge')} />}
                                                        </span>
                                                        <span className="text-[12px] leading-snug text-gray-500 dark:text-gray-400">{t(g.desc)}</span>
                                                        {here && (
                                                            <span className="absolute right-2.5 top-2.5 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                                                {t('guide.center.thisPage')}
                                                            </span>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                <motion.p variants={item} className="flex items-center gap-2 border-t border-gray-100 pt-4 text-[12px] text-gray-400 dark:border-gray-800">
                                    <GraduationCap className="h-4 w-4 shrink-0" /> {t('guide.center.footer')}
                                </motion.p>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {view === 'run' && active && (
                <GuideRunner
                    key={run}
                    guide={active}
                    ctx={ctx}
                    navigate={navigate}
                    onFinish={finish}
                    onExit={onClose}
                />
            )}

            <AnimatePresence>
                {view === 'done' && active && (
                    <motion.div
                        key="done"
                        className="fixed inset-0 z-[1010] flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                        <div className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm" onClick={onClose} />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="guide-done-title"
                            className="relative w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10"
                            initial={{ scale: reduced ? 1 : 0.85, y: reduced ? 0 : 24 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: reduced ? 1 : 0.95, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        >
                            <AnimatedCheck reduced={reduced} />
                            <h3 id="guide-done-title" className="mt-5 text-2xl font-black text-gray-900 dark:text-white">{t('guide.done.title')}</h3>
                            <p className="mt-1.5 text-[15px] text-gray-600 dark:text-gray-300">
                                {t('guide.done.body').replace('{name}', t(active.title))}
                            </p>
                            <div className="mt-5">
                                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                    <motion.div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-primary-500 to-violet-500"
                                        initial={{ width: `${Math.max(0, doneCount - (gained ? 1 : 0)) / all.length * 100}%` }}
                                        animate={{ width: `${doneCount / all.length * 100}%` }}
                                        transition={{ duration: reduced ? 0 : 0.9, ease: 'easeOut', delay: reduced ? 0 : 0.35 }}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                    {allDone ? t('guide.done.all') : t('guide.center.progress').replace('{done}', String(doneCount)).replace('{total}', String(all.length))}
                                </p>
                            </div>
                            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => setView('home')}
                                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-600 to-violet-600 px-4 text-sm font-bold text-white shadow-md shadow-primary-600/25 transition-[filter] hover:brightness-110"
                                >
                                    <GraduationCap className="h-4 w-4" /> {t('guide.done.more')}
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                    {t('guide.close')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>,
        document.body,
    );
};

export default GuideCenter;
