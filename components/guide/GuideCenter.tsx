/**
 * O'quv markazi — sarlavhadagi "Qo'llanma" tugmasi ochadi.
 *
 * Tepada — tanishuvning jonli namunasi (yoritish va kursor bloklar orasida yuradi) va uni
 * boshlash tugmasi. Pastda — "Qanday qilinadi?" (murakkab ishlar qadamma-qadam) va sahifa
 * qo'llanmalari. Yangi klinika rahbariga eng tepada "Ishni boshlash" qadamlari chiqadi.
 * Qo'llanma tugagach — konfetti, natija va keyingi qo'llanma taklifi; o'rganilganlar shu
 * brauzerda, har bir xodimga alohida saqlanadi.
 *
 * Bu modul faqat tugma bosilganda yuklanadi (App — dinamik import).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { ArrowRight, CheckCircle2, GraduationCap, Play, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { availableGuides, pageGuideFor, stepsFor, type Guide, type GuideContext } from './guides';
import { GuideRunner } from './GuideRunner';
import { SetupSection, isNewClinic, type SetupInfo } from './SetupSteps';
import { burstConfetti } from './confetti';

export interface GuideCenterProps {
    ctx: GuideContext;
    /** "Ishni boshlash" qadamlari — faqat klinika rahbariga beriladi; yangi klinikada markaz tepasida chiqadi */
    setup?: SetupInfo;
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

// ── Tanishuvning jonli namunasi ─────────────────────────────────────────────

/** Bekatlar: yoritish shu bloklar orasida yuradi (joy va o'lcham — oynaning foizida) */
const STOPS = [
    { x: 5, y: 22, w: 43, h: 25 },
    { x: 52, y: 22, w: 43, h: 47 },
    { x: 5, y: 51, w: 43, h: 18 },
    { x: 27, y: 6, w: 46, h: 10 },
];
/** Har bekatda to'xtab turadi, keyin keyingisiga uchadi; oxirida boshiga qaytadi */
const ORDER = [0, 0, 1, 1, 2, 2, 3, 3, 0];
const TIMES = [0, 0.2, 0.25, 0.45, 0.5, 0.7, 0.75, 0.95, 1];
const LOOP = { duration: 11, times: TIMES, repeat: Infinity, ease: 'easeInOut' } as const;
const pct = (f: (s: typeof STOPS[number]) => number) => ORDER.map(i => `${f(STOPS[i])}%`);
/** Kursor yetib kelganda bir marta "uradi" — to'rt bekatda to'rt to'lqin */
const TAP_TIMES = [0, 0.03, 0.12, 0.26, 0.29, 0.38, 0.51, 0.54, 0.63, 0.76, 0.79, 0.88, 1];
const TAP_OPACITY = [0, 0.9, 0, 0, 0.9, 0, 0, 0.9, 0, 0, 0.9, 0, 0];
const TAP_SCALE = [0.3, 0.3, 1.6, 0.3, 0.3, 1.6, 0.3, 0.3, 1.6, 0.3, 0.3, 1.6, 0.3];

const TourPreview: React.FC<{ reduced: boolean }> = ({ reduced }) => {
    const move = (v: string[]) => (reduced ? v[0] : v);
    const block = 'absolute rounded-md bg-white/[0.09] ring-1 ring-white/10';
    const bar = 'rounded-full bg-white/25';
    return (
        <div aria-hidden="true" className="relative mx-auto aspect-[300/186] w-full max-w-[300px] overflow-hidden rounded-2xl bg-white/[0.06] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/15">
            {/* Ilova maketi: sarlavha, qidiruv, uch blok */}
            <div className="absolute left-[5%] top-[8.5%] flex gap-[3px]">
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            </div>
            <div className="absolute rounded-full bg-white/[0.12]" style={{ left: '27%', top: '6%', width: '46%', height: '10%' }} />
            <div className={block} style={{ left: '5%', top: '22%', width: '43%', height: '25%' }}>
                <div className="flex h-full items-center gap-1.5 px-2">
                    {[0, 1, 2, 3].map(i => <span key={i} className={`h-4 w-4 rounded-full ${i === 1 ? 'bg-sky-300/70' : 'bg-white/20'}`} />)}
                </div>
            </div>
            <div className={block} style={{ left: '52%', top: '22%', width: '43%', height: '47%' }}>
                <div className="flex h-full flex-col justify-center gap-[7px] px-2.5">
                    {[70, 90, 55, 80].map((w, i) => <span key={i} className={`h-1.5 ${bar}`} style={{ width: `${w}%` }} />)}
                </div>
            </div>
            <div className={block} style={{ left: '5%', top: '51%', width: '43%', height: '18%' }}>
                <div className="flex h-full items-end gap-1 px-2.5 pb-1.5">
                    {[40, 75, 55, 90, 65].map((h, i) => <span key={i} className="flex-1 rounded-sm bg-emerald-300/50" style={{ height: `${h}%` }} />)}
                </div>
            </div>

            {/* Yoritish: atrofni qorong'ilatadi — haqiqiy turdagidek */}
            <motion.div
                className="absolute rounded-lg"
                style={{ boxShadow: '0 0 0 1.5px rgba(191,219,254,0.95), 0 0 22px 3px rgba(59,130,246,0.6), 0 0 0 400px rgba(3,9,28,0.55)' }}
                initial={false}
                animate={{
                    left: move(pct(s => s.x - 1.5)), top: move(pct(s => s.y - 2)),
                    width: move(pct(s => s.w + 3)), height: move(pct(s => s.h + 4)),
                }}
                transition={LOOP}
            />

            {/* Izoh kartasi */}
            <div className="absolute bottom-[6%] left-[30%] right-[5%] flex h-[19%] items-center gap-2 rounded-lg bg-white px-2.5 shadow-lg">
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex gap-[3px]">
                        {[0, 1, 2, 3].map(i => (
                            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-slate-200">
                                <motion.span
                                    className="block h-full w-full rounded-full bg-blue-600"
                                    initial={false}
                                    animate={{ opacity: reduced ? (i === 0 ? 1 : 0) : ORDER.map(s => (s >= i ? 1 : 0)) }}
                                    transition={{ ...LOOP, ease: 'linear' }}
                                />
                            </span>
                        ))}
                    </div>
                    <motion.span
                        className="block h-[5px] rounded-full bg-slate-800"
                        initial={false}
                        animate={{ width: reduced ? '60%' : ['60%', '60%', '42%', '42%', '72%', '72%', '50%', '50%', '60%'] }}
                        transition={LOOP}
                    />
                    <span className="mt-1 block h-1 w-4/5 rounded-full bg-slate-300" />
                </div>
                <span className="h-3.5 w-7 shrink-0 rounded-[5px] bg-blue-600" />
            </div>

            {/* Kursor */}
            <motion.div
                className="absolute"
                initial={false}
                animate={{ left: move(pct(s => s.x + s.w * 0.36)), top: move(pct(s => s.y + s.h * 0.5)) }}
                transition={LOOP}
            >
                {!reduced && (
                    <motion.span
                        className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border-[1.5px] border-sky-200"
                        animate={{ opacity: TAP_OPACITY, scale: TAP_SCALE }}
                        transition={{ duration: LOOP.duration, times: TAP_TIMES, repeat: Infinity, ease: 'easeOut' }}
                    />
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" className="relative -left-[3px] -top-[2px]" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}>
                    <path d="M5 3l14.5 7.6-6.4 1.7-2.7 6.4L5 3z" fill="#fff" stroke="#0f172a" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
            </motion.div>
        </div>
    );
};

// ── Kichik bezaklar ─────────────────────────────────────────────────────────

/** Har bir qo'llanma — bitta bo'lak; o'rganilgani to'ladi */
const Segments: React.FC<{ done: number; total: number; reduced: boolean; fill: string; track: string }> = ({ done, total, reduced, fill, track }) => (
    <div className="flex flex-1 gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 overflow-hidden rounded-full ${track}`}>
                <motion.span
                    className={`block h-full rounded-full ${fill}`}
                    initial={{ width: '0%' }}
                    animate={{ width: i < done ? '100%' : '0%' }}
                    transition={{ duration: reduced ? 0 : 0.45, ease: 'easeOut', delay: reduced ? 0 : 0.25 + i * 0.04 }}
                />
            </span>
        ))}
    </div>
);

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

const GuideCenter: React.FC<GuideCenterProps> = ({ ctx, setup, onClose }) => {
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
    // Klaviatura bilan: oyna ochilganda Enter — tanishuvni boshlaydi
    const heroRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (view === 'home') heroRef.current?.focus({ preventScroll: true });
    }, [view]);

    const doneCount = all.filter(g => done.includes(g.id)).length;
    const allDone = doneCount === all.length;
    const current = pageGuideFor(pages, location.pathname);
    // Joriy sahifaning qo'llanmasi birinchi turadi
    const pageList = current ? [current, ...pages.filter(p => p !== current)] : pages;
    // Tugagandan keyin taklif: hali o'rganilmagan birinchi ish (bo'lmasa — sahifa)
    const nextGuide = active ? [...tasks, ...pages].find(g => g.id !== active.id && !done.includes(g.id)) ?? null : null;
    const showSetup = !!setup && isNewClinic(setup);

    const start = (g: Guide) => {
        setActive(g);
        setRun(r => r + 1);
        setView('run');
    };
    const finish = () => {
        if (active && !done.includes(active.id)) {
            const next = [...done, active.id];
            setDone(next);
            saveDone(ctx.userKey, next);
        }
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
    const progressText = allDone ? t('guide.done.all')
        : t('guide.center.progress').replace('{done}', String(doneCount)).replace('{total}', String(all.length));

    const list: Variants = {
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : 0.045, delayChildren: reduced ? 0 : 0.1 } },
    };
    const item: Variants = {
        hidden: { opacity: 0, y: reduced ? 0 : 14 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
    };
    /** Kartadagi qadam nuqtalari: ustiga borilganda ketma-ket yonadi */
    const dot = (i: number): Variants => ({
        hidden: { opacity: 0.3 },
        show: { opacity: 0.3 },
        hover: { opacity: 1, transition: { delay: reduced ? 0 : i * 0.05, duration: 0.15 } },
    });
    const press = reduced ? undefined : { scale: 0.98 };
    const tourDone = done.includes(tour.id);
    const shell = 'bg-white dark:bg-[#0B1220] ring-1 ring-gray-900/5 dark:ring-white/10';
    const card = 'border border-gray-200 bg-white hover:border-primary-300 hover:shadow-lg hover:shadow-primary-600/10 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-primary-400/60 dark:hover:bg-white/[0.07]';

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
                        <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={onClose} />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="guide-center-title"
                            className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:max-h-[90vh] sm:max-w-[840px] sm:rounded-3xl ${shell}`}
                            initial={{ y: reduced ? 0 : 40, scale: reduced ? 1 : 0.97 }}
                            animate={{ y: 0, scale: 1 }}
                            exit={{ y: reduced ? 0 : 30, scale: reduced ? 1 : 0.97 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                        >
                            {/* Tepa: tanishuv va uning jonli namunasi */}
                            <div className="relative shrink-0 overflow-hidden text-white" style={{ background: 'radial-gradient(120% 140% at 0% 0%, #1D4ED8 0%, #0B1E4F 46%, #050B1F 100%)' }}>
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 opacity-60"
                                    style={{
                                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                                        backgroundSize: '28px 28px',
                                        maskImage: 'radial-gradient(90% 90% at 80% 20%, #000 0%, transparent 75%)',
                                        WebkitMaskImage: 'radial-gradient(90% 90% at 80% 20%, #000 0%, transparent 75%)',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label={t('guide.close')}
                                    className="absolute right-3 top-3 z-10 rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <div className="relative grid gap-5 px-5 pb-5 pt-6 sm:grid-cols-[minmax(0,1fr)_300px] sm:items-center sm:gap-7 sm:px-8 sm:pb-6 sm:pt-8">
                                    <div className="min-w-0">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-100 ring-1 ring-white/15">
                                            <GraduationCap className="h-3.5 w-3.5" /> {t('guide.center.title')}
                                        </span>
                                        <h2 id="guide-center-title" className="mt-3 text-[26px] font-black leading-[1.1] tracking-tight sm:text-[32px]">{t('guide.hero.title')}</h2>
                                        <p className="mt-2 max-w-md text-sm leading-relaxed text-blue-100/80 sm:text-[15px]">{t('guide.hero.sub')}</p>
                                        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                                            <motion.button
                                                ref={heroRef}
                                                type="button"
                                                onClick={() => start(tour)}
                                                whileHover={reduced ? undefined : { y: -2 }}
                                                whileTap={press}
                                                className="group inline-flex h-12 items-center gap-2.5 rounded-2xl bg-white pl-2 pr-5 text-[15px] font-extrabold text-primary-700 shadow-[0_12px_30px_-8px_rgba(59,130,246,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-900"
                                            >
                                                <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 text-white">
                                                    {!reduced && !tourDone && (
                                                        <motion.span
                                                            aria-hidden="true"
                                                            className="absolute inset-0 rounded-xl ring-2 ring-primary-400"
                                                            animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
                                                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                                                        />
                                                    )}
                                                    {tourDone ? <RotateCcw className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                                                </span>
                                                {tourDone ? t('guide.center.again') : t('guide.hero.cta')}
                                            </motion.button>
                                            <span className="text-xs font-semibold text-blue-100/70">
                                                {t('guide.hero.meta').replace('{steps}', String(stepsFor(tour, ctx).length)).replace('{min}', String(tour.minutes))}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block">
                                        <TourPreview reduced={reduced} />
                                    </div>
                                </div>
                                <div className="relative flex items-center gap-3 border-t border-white/10 px-5 py-3 sm:px-8">
                                    <Segments done={doneCount} total={all.length} reduced={reduced} fill="bg-white" track="bg-white/15" />
                                    <span className="shrink-0 text-xs font-bold tabular-nums text-blue-100/80">{progressText}</span>
                                </div>
                            </div>

                            {/* Ro'yxatlar */}
                            <motion.div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6" variants={list} initial="hidden" animate="show">
                                {showSetup && (
                                    <motion.div variants={item}>
                                        <SetupSection {...setup!} onGo={onClose} />
                                    </motion.div>
                                )}

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
                                                const count = stepsFor(g, ctx).length;
                                                return (
                                                    <motion.button
                                                        key={g.id}
                                                        type="button"
                                                        variants={item}
                                                        whileHover="hover"
                                                        whileTap={press}
                                                        onClick={() => start(g)}
                                                        className={`group flex items-start gap-3.5 rounded-2xl p-4 text-left transition-[border-color,box-shadow,background-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${card}`}
                                                    >
                                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white dark:bg-primary-500/15 dark:text-primary-300">
                                                            <TaskIcon className="h-5 w-5" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900 dark:text-white">{t(g.title)}</span>
                                                                {isDone && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label={t('guide.center.doneBadge')} />}
                                                            </span>
                                                            <span className="mt-0.5 block text-[13px] leading-snug text-gray-500 dark:text-gray-400">{t(g.desc)}</span>
                                                            <span className="mt-2.5 flex items-center gap-2">
                                                                <span className="flex gap-1" aria-hidden="true">
                                                                    {Array.from({ length: count }, (_, i) => (
                                                                        <motion.span key={i} variants={dot(i)} className="h-1.5 w-1.5 rounded-full bg-primary-500 opacity-30" />
                                                                    ))}
                                                                </span>
                                                                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">{meta(g)}</span>
                                                            </span>
                                                        </span>
                                                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-primary-500 dark:text-gray-600" />
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
                                        <div className="flex flex-wrap gap-2">
                                            {pageList.map(g => {
                                                const PageIcon = g.icon;
                                                const isDone = done.includes(g.id);
                                                const here = g === current;
                                                return (
                                                    <motion.button
                                                        key={g.id}
                                                        type="button"
                                                        variants={item}
                                                        whileTap={press}
                                                        onClick={() => start(g)}
                                                        title={t(g.desc)}
                                                        className={`inline-flex h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-[border-color,box-shadow,background-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${here
                                                            ? 'border border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-400/60 dark:bg-primary-500/15 dark:text-primary-200'
                                                            : `text-gray-800 dark:text-gray-100 ${card}`}`}
                                                    >
                                                        <PageIcon className="h-4 w-4 text-primary-500 dark:text-primary-300" />
                                                        {t(g.title)}
                                                        {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label={t('guide.center.doneBadge')} />}
                                                        {here && (
                                                            <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                                                {t('guide.center.thisPage')}
                                                            </span>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}
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
                        <div className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" onClick={onClose} />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="guide-done-title"
                            className={`relative w-full max-w-sm rounded-3xl p-7 text-center shadow-2xl ${shell}`}
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
                            <div className="mt-5 flex items-center gap-3">
                                <Segments done={doneCount} total={all.length} reduced={reduced} fill="bg-primary-500" track="bg-gray-100 dark:bg-white/10" />
                                <span className="shrink-0 text-xs font-bold tabular-nums text-gray-500 dark:text-gray-400">{doneCount} / {all.length}</span>
                            </div>
                            <div className="mt-6 flex flex-col gap-2">
                                {nextGuide && (
                                    <button
                                        type="button"
                                        onClick={() => start(nextGuide)}
                                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-bold text-white shadow-md shadow-primary-600/25 transition-colors hover:bg-primary-700"
                                    >
                                        <span className="truncate">{t('guide.done.next').replace('{name}', t(nextGuide.title))}</span>
                                        <ArrowRight className="h-4 w-4 shrink-0" />
                                    </button>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setView('home')}
                                        className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-colors ${nextGuide
                                            ? 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10'
                                            : 'bg-primary-600 text-white shadow-md shadow-primary-600/25 hover:bg-primary-700'}`}
                                    >
                                        <GraduationCap className="h-4 w-4" /> {t('guide.done.more')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                                    >
                                        {t('guide.close')}
                                    </button>
                                </div>
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
