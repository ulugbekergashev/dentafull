/**
 * Qo'llanma dvigateli: belgilangan joyni yoritadi, yonida izoh kartasini ko'rsatadi,
 * kerak bo'lsa boshqa sahifaga o'tadi va foydalanuvchi ishni bajarishini kutadi.
 *
 * Ikki rejim:
 *  - spot — atrof qorong'ilashadi, faqat belgilangan joy ochiq (bosish qadamida u bosiladi,
 *    qolgan joylar bosilmaydi — tasodifan boshqa sahifaga ketib qolinmaydi);
 *  - ring — sahifa odatdagidek ishlaydi, joy faqat nurli halqa bilan ko'rsatiladi
 *    (oyna ichidagi formalar: ro'yxat ochiladi, maydonga yoziladi).
 *
 * Yoritish bir joydan ikkinchisiga prujina bilan "uchib" o'tadi; sahifa aylantirilganda
 * esa elementga kechikmasdan yopishib turadi.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Loader2, MousePointerClick, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { stepsFor, type Guide, type GuideContext } from './guides';
import { type Box, boxOf, bringIntoView, findTarget, isTyping, isVisible, rawBoxOf, sameBox } from './dom';

/** Majburiy qadam elementi shuncha kutiladi (oyna ochilishi, ma'lumot yuklanishi) */
const WAIT_REQUIRED = 7000;
/** Ixtiyoriy qadam: shu sahifada bo'lsa tez, yangi sahifaga o'tilgan bo'lsa uzoqroq kutiladi */
const WAIT_OPTIONAL = 1200;
const WAIT_AFTER_NAV = 3500;
/** Element shuncha vaqt ko'rinmasa — yo'qolgan hisoblanadi */
const LOST_AFTER = 700;
/** Yoritish chetidan bo'shliq */
const PAD = 8;
/** Ekran chetidan va elementdan kartagacha masofa */
const EDGE = 12;
const GAP = 14;
const CARD_W = 372;

const SPRING = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } as const;
const INSTANT = { duration: 0 } as const;
const DIM = 'rgba(2, 6, 23, 0.62)';

const norm = (p: string) => p.replace(/\/+$/, '') || '/';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Side = 'top' | 'bottom' | 'left' | 'right' | 'over' | 'center' | 'dock';

/** Karta joyi: element ostida, ustida, o'ngida yoki chapida — qayerda joy bo'lsa. Telefonda — pastda yoki tepada */
function placeCard(box: Box | null, cw: number, ch: number, vw: number, vh: number): { x: number; y: number; side: Side } {
    if (!box) return { x: (vw - cw) / 2, y: Math.max(EDGE, (vh - ch) / 2), side: 'center' };
    if (vw < 640) {
        // Telefonda karta pastga yoki tepaga yopishadi — elementni yopmaydigan tomonga.
        // Ikkala tomonda ham joy bo'lmasa (element baland) — pastga: elementning boshi ko'rinib tursin
        const below = vh - (box.y + box.h + PAD) - GAP;
        const above = box.y - PAD - GAP;
        const top = below < ch + EDGE && above >= ch + EDGE;
        return { x: EDGE, y: top ? EDGE : vh - ch - EDGE, side: 'dock' };
    }
    const top = box.y - PAD;
    const left = box.x - PAD;
    const bottom = box.y + box.h + PAD;
    const right = box.x + box.w + PAD;
    const cx = clamp(box.x + box.w / 2 - cw / 2, EDGE, vw - cw - EDGE);
    const cy = clamp(box.y + box.h / 2 - ch / 2, EDGE, vh - ch - EDGE);
    if (vh - bottom - GAP - EDGE >= ch) return { x: cx, y: bottom + GAP, side: 'bottom' };
    if (top - GAP - EDGE >= ch) return { x: cx, y: top - GAP - ch, side: 'top' };
    if (vw - right - GAP - EDGE >= cw) return { x: right + GAP, y: cy, side: 'right' };
    if (left - GAP - EDGE >= cw) return { x: left - GAP - cw, y: cy, side: 'left' };
    // Element ekrandek katta — karta uning ustida, bo'shroq tomonda
    return { x: cx, y: box.y + box.h / 2 > vh / 2 ? EDGE : vh - ch - EDGE, side: 'over' };
}

interface Seek { index: number; dir: 1 | -1; n: number }
interface Shown { index: number; n: number; missing: boolean }

interface GuideRunnerProps {
    guide: Guide;
    ctx: GuideContext;
    navigate: (to: string) => void;
    /** Oxirgi qadamdan keyin */
    onFinish: () => void;
    /** × yoki Esc — o'rtada chiqish */
    onExit: () => void;
}

/** Spot rejimida belgilangan joydan tashqaridagi bosishlarni ushlaydigan to'rt qatlam */
const Blockers: React.FC<{ hole: Box | null; pass: boolean; vw: number; vh: number; onHit: () => void }> = ({ hole, pass, vw, vh, onHit }) => {
    const cls = 'fixed z-[1000] pointer-events-auto';
    if (!hole) return <div className={`${cls} inset-0`} onClick={onHit} />;
    const top = clamp(hole.y, 0, vh);
    const bottom = clamp(hole.y + hole.h, 0, vh);
    const left = clamp(hole.x, 0, vw);
    const right = clamp(hole.x + hole.w, 0, vw);
    return (
        <>
            <div className={cls} style={{ left: 0, top: 0, width: vw, height: top }} onClick={onHit} />
            <div className={cls} style={{ left: 0, top: bottom, width: vw, height: vh - bottom }} onClick={onHit} />
            <div className={cls} style={{ left: 0, top, width: left, height: bottom - top }} onClick={onHit} />
            <div className={cls} style={{ left: right, top, width: vw - right, height: bottom - top }} onClick={onHit} />
            {/* Izoh qadamida belgilangan joyning o'zi ham bosilmaydi */}
            {!pass && <div className={cls} style={{ left, top, width: right - left, height: bottom - top }} onClick={onHit} />}
        </>
    );
};

export const GuideRunner: React.FC<GuideRunnerProps> = ({ guide, ctx, navigate, onFinish, onExit }) => {
    const { t } = useLanguage();
    const reduced = !!useReducedMotion();
    const steps = useMemo(() => stepsFor(guide, ctx), [guide, ctx]);

    const [seek, setSeek] = useState<Seek>({ index: 0, dir: 1, n: 0 });
    const [shown, setShown] = useState<Shown | null>(null);
    const [box, setBox] = useState<Box | null>(null);
    const [seeking, setSeeking] = useState(true);
    const [slow, setSlow] = useState(false);
    const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    const [cardH, setCardH] = useState(200);

    const elRef = useRef<HTMLElement | null>(null);
    /** Bosish qadamida: qachon bosildi (0 — hali bosilmagan) */
    const clickedAt = useRef(0);
    /** Har bir qadam almashganda oshadi — eski taymer va kuzatuvlar o'zini to'xtatadi */
    const token = useRef(0);
    const counter = useRef(0);
    /** Hozir element qidirilyaptimi — "Yuklanmoqda" belgisi faqat shunda chiqadi */
    const seekingRef = useRef(true);
    const recovers = useRef(0);
    /** Orqaga yurishda izoh topilmasa, shu qadamga qaytiladi */
    const backFrom = useRef<number | null>(null);
    /** Shu paytgacha yoritish prujina bilan harakatlanadi, keyin elementga darhol yopishadi */
    const moveUntil = useRef(0);
    const shownRef = useRef<Shown | null>(null);
    shownRef.current = shown;
    const finishRef = useRef(onFinish);
    finishRef.current = onFinish;
    const exitRef = useRef(onExit);
    exitRef.current = onExit;

    const cardRef = useRef<HTMLDivElement | null>(null);
    const nextBtn = useRef<HTMLButtonElement | null>(null);
    const [scope, animate] = useAnimate();

    // ── Qadamlar orasida yurish ──────────────────────────────────────────────
    const go = useCallback((index: number, dir: 1 | -1) => {
        token.current++;
        seekingRef.current = true;
        setSeeking(true);
        setSeek({ index, dir, n: ++counter.current });
    }, []);

    const advance = useCallback(() => {
        const s = shownRef.current;
        if (!s) return;
        backFrom.current = null;
        go(s.index + 1, 1);
    }, [go]);

    const recover = useCallback((id: string) => {
        const i = steps.findIndex(s => s.id === id);
        recovers.current++;
        // Aylanib qolmaslik uchun: juda ko'p qaytish — qo'llanma yopiladi
        if (i < 0 || recovers.current > 8) { exitRef.current(); return; }
        go(i, 1);
    }, [steps, go]);

    const reveal = (index: number, el: HTMLElement | null, missing: boolean) => {
        elRef.current = el;
        clickedAt.current = 0;
        if (el) bringIntoView(el, !reduced);
        moveUntil.current = performance.now() + 700;
        // Hali scroll ortida bo'lsa — to'liq o'lchamidan boshlaymiz, kuzatuv ko'rinadigan qismga toraytiradi
        setBox(el ? boxOf(el) ?? rawBoxOf(el) : null);
        setSkipped(prev => {
            if (!prev.has(index)) return prev;
            const next = new Set(prev);
            next.delete(index);
            return next;
        });
        setShown({ index, n: counter.current, missing });
        seekingRef.current = false;
        setSeeking(false);
        setSlow(false);
    };

    // ── Qadam elementini qidirish (kerak bo'lsa sahifaga o'tib) ──────────────
    useEffect(() => {
        const { index, dir } = seek;
        const myToken = token.current;
        if (index >= steps.length) { finishRef.current(); return; }
        if (index < 0) {
            const back = backFrom.current;
            backFrom.current = null;
            go(back ?? 0, 1);
            return;
        }
        const step = steps[index];
        const skipTo = () => {
            setSkipped(prev => (prev.has(index) ? prev : new Set(prev).add(index)));
            go(index + dir, dir);
        };
        // Orqaga faqat izoh qadamlariga qaytiladi: bosish va kutish qadamlari allaqachon bajarilgan
        if (dir === -1 && (step.action || step.doneWhen)) { go(index - 1, -1); return; }
        if (step.skip?.path?.test(window.location.pathname)) { skipTo(); return; }

        let navigated = false;
        if (step.route && norm(window.location.pathname) !== step.route) {
            navigate(step.route);
            navigated = true;
        }
        const started = performance.now();
        const wait = !step.target ? 0 : !step.optional ? WAIT_REQUIRED : navigated ? WAIT_AFTER_NAV : WAIT_OPTIONAL;
        let timer = 0;
        const slowTimer = window.setTimeout(() => { if (token.current === myToken && seekingRef.current) setSlow(true); }, 400);
        const tick = () => {
            if (token.current !== myToken) return;
            if (step.skip?.visible && findTarget(step.skip.visible)) { skipTo(); return; }
            const el = step.target ? findTarget(step.target) : null;
            if (!step.target || el) { reveal(index, el, false); return; }
            if (performance.now() - started >= wait) {
                if (step.optional) { skipTo(); return; }
                if (step.recover) { recover(step.recover); return; }
                reveal(index, null, true);
                return;
            }
            timer = window.setTimeout(tick, 100);
        };
        timer = window.setTimeout(tick, navigated ? 80 : 0);
        return () => { window.clearTimeout(timer); window.clearTimeout(slowTimer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seek]);

    // ── Ko'rsatilgan qadam: elementni kuzatish va avtomatik o'tish ──────────
    useEffect(() => {
        if (!shown) return;
        const step = steps[shown.index];
        const myToken = token.current;
        let raf = 0;
        let lostAt = 0;
        let lastCheck = 0;
        const loop = (now: number) => {
            if (token.current !== myToken) return;
            if (step.target && !shown.missing) {
                let el = elRef.current;
                if (!el || !el.isConnected || !isVisible(el)) {
                    // React elementni qayta chizgan bo'lishi mumkin — yangisini topamiz
                    el = findTarget(step.target);
                    if (el) elRef.current = el;
                }
                if (el) {
                    lostAt = 0;
                    // Butunlay scroll ortiga o'tib ketgan bo'lsa — oxirgi ko'ringan joyida qoladi
                    const b = boxOf(el);
                    if (b) setBox(prev => (sameBox(prev, b) ? prev : b));
                } else if (!lostAt) {
                    lostAt = now;
                } else if (now - lostAt > LOST_AFTER) {
                    if (step.action === 'click' && clickedAt.current && !step.doneWhen) advance();
                    else if (step.recover) recover(step.recover);
                    else go(shown.index, 1);
                    return;
                }
            }
            if (now - lastCheck > 150) {
                lastCheck = now;
                const d = step.doneWhen;
                if (d?.path && d.path.test(window.location.pathname)) { advance(); return; }
                if (d?.appear && findTarget(d.appear)) { advance(); return; }
                if (d?.gone && !findTarget(d.gone)) {
                    // Saqlash bosilib oyna yopildi — tayyor. Bosilmay yopildi — bekor qilindi, boshiga
                    if (clickedAt.current) { advance(); return; }
                    if (step.recover) { recover(step.recover); return; }
                }
                // Bosildi, lekin oyna yopilmadi (masalan, majburiy maydon bo'sh) — yana bosilishini kutamiz
                if (clickedAt.current && d?.gone && now - clickedAt.current > 8000) clickedAt.current = 0;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown]);

    // ── Bosish qadami: belgilangan joy bosilganini ushlaymiz (ilovaning o'z ishi to'xtamaydi) ──
    useEffect(() => {
        if (!shown) return;
        const step = steps[shown.index];
        if (step.action !== 'click') return;
        const myToken = token.current;
        const onClick = (e: MouseEvent) => {
            const el = elRef.current;
            if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
            clickedAt.current = performance.now();
            // Oyna ochilishiga ulgursin — keyingi qadam uni o'zi kutadi
            if (!step.doneWhen) window.setTimeout(() => { if (token.current === myToken) advance(); }, 220);
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [shown, steps, advance]);

    // ── Ekran o'lchami va karta balandligi ───────────────────────────────────
    useEffect(() => {
        const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const hasCard = !!shown;
    useLayoutEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        // offsetHeight — animatsiyadagi scale ta'sir qilmaydigan asl balandlik
        const measure = () => setCardH(h => (Math.abs(h - el.offsetHeight) < 1 ? h : el.offsetHeight));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [hasCard]);

    // ── Holat ────────────────────────────────────────────────────────────────
    const step = shown ? steps[shown.index] : null;
    const mode = step?.mode ?? 'spot';
    const waiting = !!step && !shown!.missing && (!!step.action || !!step.doneWhen);
    const isLast = !!shown && shown.index === steps.length - 1;
    const backIndex = useMemo(() => {
        if (!shown) return -1;
        for (let j = shown.index - 1; j >= 0; j--) {
            const s = steps[j];
            if (!s.action && !s.doneWhen && !skipped.has(j)) return j;
        }
        return -1;
    }, [shown, steps, skipped]);

    const next = () => {
        if (!shown || seeking) return;
        backFrom.current = null;
        go(shown.index + 1, 1);
    };
    const back = () => {
        if (!shown || seeking || backIndex < 0) return;
        backFrom.current = shown.index;
        go(backIndex, -1);
    };
    // Qorong'i joy bosilsa — karta "silkinadi": tugmalar shu yerda
    const nudge = () => {
        if (reduced || !scope.current) return;
        animate(scope.current, { x: [0, -9, 9, -6, 6, -2, 0] }, { duration: 0.45 });
    };

    // Klaviatura: → keyingi, ← orqaga, Esc chiqish. Ilovadagi Esc (masalan, qabul panelini yopish) ishlamaydi
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                exitRef.current();
                return;
            }
            if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key === 'ArrowRight' && !waiting) { e.preventDefault(); e.stopImmediatePropagation(); next(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); back(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    // Klaviatura bilan ishlaydiganlar uchun: izoh qadamida "Keyingi" fokusda
    useEffect(() => {
        if (shown && mode === 'spot' && !waiting) nextBtn.current?.focus({ preventScroll: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown]);

    // ── Chizish ──────────────────────────────────────────────────────────────
    const target = shown && !shown.missing ? box : null;
    const hole = target ? { x: target.x - PAD, y: target.y - PAD, w: target.w + PAD * 2, h: target.h + PAD * 2 } : null;
    const spot = !shown || mode === 'spot';
    const trans = reduced ? INSTANT : performance.now() < moveUntil.current ? SPRING : INSTANT;
    const cardW = vp.w < 640 ? vp.w - EDGE * 2 : CARD_W;
    const pos = placeCard(target, cardW, cardH, vp.w, vp.h);

    let arrow: { side: 'top' | 'bottom' | 'left' | 'right'; offset: number } | null = null;
    if (target && (pos.side === 'top' || pos.side === 'bottom')) arrow = { side: pos.side, offset: clamp(target.x + target.w / 2 - pos.x, 24, cardW - 24) };
    if (target && (pos.side === 'left' || pos.side === 'right')) arrow = { side: pos.side, offset: clamp(target.y + target.h / 2 - pos.y, 24, cardH - 24) };

    const total = Math.max(1, steps.length - skipped.size);
    const number = shown ? shown.index + 1 - Array.from(skipped).filter(i => i < shown.index).length : 1;
    const label = step?.chapter ? t(step.chapter) : t(guide.title);
    const seekingStep = steps[seek.index];
    const loadingText = seekingStep?.chapter ? t('guide.opening').replace('{name}', t(seekingStep.chapter)) : t('guide.loading');
    const Icon = guide.icon;
    const dir = seek.dir;

    return createPortal(
        <div className="denta-guide">
            {/* Qorong'i qatlam: teshik belgilangan joy ustida */}
            <AnimatePresence>
                {spot && (
                    <motion.div
                        key="dim"
                        className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.25 }}
                    >
                        <motion.div
                            className="absolute left-0 top-0 rounded-[14px]"
                            style={{ boxShadow: `0 0 0 200vmax ${DIM}` }}
                            initial={false}
                            animate={hole
                                ? { x: hole.x, y: hole.y, width: hole.w, height: hole.h }
                                : { x: vp.w / 2, y: vp.h / 2, width: 0, height: 0 }}
                            transition={trans}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            {spot && <Blockers hole={hole} pass={step?.action === 'click'} vw={vp.w} vh={vp.h} onHit={nudge} />}

            {/* Nurli halqa va to'lqin */}
            {hole && (
                <motion.div
                    className="fixed left-0 top-0 z-[1001] pointer-events-none rounded-[14px]"
                    style={{
                        boxShadow: mode === 'ring'
                            ? '0 0 0 3px rgba(96,165,250,0.95), 0 0 0 8px rgba(99,102,241,0.22), 0 0 36px 10px rgba(99,102,241,0.35)'
                            : '0 0 0 2px rgba(147,197,253,0.9), 0 0 26px 4px rgba(96,165,250,0.35)',
                    }}
                    initial={false}
                    animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }}
                    transition={trans}
                >
                    {!reduced && (
                        <motion.span
                            className="absolute inset-0 rounded-[14px]"
                            style={{ boxShadow: '0 0 0 2px rgba(96,165,250,0.9)' }}
                            animate={{ scale: [1, 1.08], opacity: [0.85, 0] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                        />
                    )}
                </motion.div>
            )}

            {/* "Shu yerni bosing" — bosish qadamida tugma burchagida */}
            {hole && step?.action === 'click' && (
                <motion.div
                    className="fixed left-0 top-0 z-[1002] pointer-events-none"
                    initial={false}
                    animate={{ x: hole.x + hole.w - 22, y: hole.y + hole.h - 18 }}
                    transition={trans}
                >
                    <motion.span
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-violet-600 text-white shadow-lg ring-2 ring-white dark:ring-gray-900"
                        animate={reduced ? undefined : { y: [0, -6, 0], scale: [1, 0.9, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <MousePointerClick className="h-4 w-4" />
                    </motion.span>
                </motion.div>
            )}

            {/* Izoh kartasi */}
            {shown && step && (
                <motion.div
                    ref={cardRef}
                    role="dialog"
                    aria-labelledby="guide-step-title"
                    className="fixed left-0 top-0 z-[1003]"
                    style={{ width: cardW }}
                    initial={{ opacity: 0, scale: 0.94, x: pos.x, y: pos.y + 12 }}
                    animate={{ opacity: seeking ? 0.6 : 1, scale: 1, x: pos.x, y: pos.y }}
                    transition={reduced ? INSTANT : trans === INSTANT ? { opacity: { duration: 0.15 }, default: INSTANT } : SPRING}
                >
                    <div ref={scope} className={`relative ${seeking ? 'pointer-events-none' : ''}`}>
                        {arrow && (
                            <span
                                aria-hidden="true"
                                className="absolute h-3.5 w-3.5 rotate-45 bg-white dark:bg-gray-800 ring-1 ring-gray-900/10 dark:ring-white/10"
                                style={arrow.side === 'bottom' ? { top: -6, left: arrow.offset - 7 }
                                    : arrow.side === 'top' ? { bottom: -6, left: arrow.offset - 7 }
                                        : arrow.side === 'right' ? { left: -6, top: arrow.offset - 7 }
                                            : { right: -6, top: arrow.offset - 7 }}
                            />
                        )}
                        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 ring-1 ring-gray-900/10 dark:ring-white/10 shadow-[0_24px_60px_-15px_rgba(2,6,23,0.55)]">
                            {/* Jarayon: har bir qadam — bitta bo'lak */}
                            <div className="flex gap-1 px-5 pt-4" aria-hidden="true">
                                {Array.from({ length: total }, (_, i) => (
                                    <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                        <motion.span
                                            className="block h-full rounded-full bg-gradient-to-r from-primary-500 to-violet-500"
                                            initial={false}
                                            animate={{ width: i < number ? '100%' : '0%' }}
                                            transition={{ duration: reduced ? 0 : 0.35, ease: 'easeOut' }}
                                        />
                                    </span>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 px-5 pt-3">
                                <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r ${guide.tone} px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white`}>
                                    <Icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{label}</span>
                                </span>
                                <span className="shrink-0 text-[11px] font-bold tabular-nums text-gray-400">{number} / {total}</span>
                                <button
                                    type="button"
                                    onClick={() => exitRef.current()}
                                    aria-label={t('guide.close')}
                                    title={t('guide.close')}
                                    className="ml-auto -mr-1.5 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="px-5 pb-4 pt-2" aria-live="polite">
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={shown.n}
                                        initial={{ opacity: 0, x: reduced ? 0 : 18 * dir }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: reduced ? 0 : -18 * dir }}
                                        transition={{ duration: reduced ? 0 : 0.18 }}
                                    >
                                        <h3 id="guide-step-title" className="text-[17px] font-extrabold leading-snug text-gray-900 dark:text-white">{t(step.title)}</h3>
                                        <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600 dark:text-gray-300">{t(step.body)}</p>
                                        {waiting && (
                                            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-primary-50 px-3 py-2.5 text-[13px] font-semibold text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
                                                <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
                                                </span>
                                                {t(step.action ? 'guide.waitClick' : 'guide.waitDo')}
                                            </div>
                                        )}
                                        {shown.missing && (
                                            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{t('guide.notFound')}</p>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            <div className="flex items-center gap-2 px-5 pb-4">
                                {backIndex >= 0 && (
                                    <button
                                        type="button"
                                        onClick={back}
                                        className="-ml-2 inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                    >
                                        <ArrowLeft className="h-4 w-4" /> {t('guide.prev')}
                                    </button>
                                )}
                                <span className="flex-1" />
                                {vp.w >= 1024 && backIndex < 0 && <span className="whitespace-nowrap text-[11px] font-medium text-gray-400">{t('guide.keys')}</span>}
                                {!waiting && (
                                    <motion.button
                                        ref={nextBtn}
                                        type="button"
                                        onClick={next}
                                        whileTap={reduced ? undefined : { scale: 0.96 }}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-600 to-violet-600 px-4 text-sm font-bold text-white shadow-md shadow-primary-600/25 transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                                    >
                                        {isLast ? t('guide.finish') : t('guide.next')}
                                        {isLast ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Sahifa ochilayotganda */}
            <AnimatePresence>
                {slow && (
                    <motion.div
                        key="loading"
                        className="fixed bottom-8 left-1/2 z-[1004] pointer-events-none"
                        initial={{ opacity: 0, y: 12, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 12, x: '-50%' }}
                        transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                        <span className="flex items-center gap-2 whitespace-nowrap rounded-full bg-gray-900/90 px-4 py-2 text-sm font-semibold text-white shadow-xl ring-1 ring-white/10">
                            <Loader2 className="h-4 w-4 animate-spin" /> {loadingText}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body,
    );
};
