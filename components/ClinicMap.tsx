import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { Armchair, ArrowRight, Check, ChevronRight, Clock, Footprints, Loader2, Plus, Undo2 } from 'lucide-react';
import { Appointment, Doctor, FlowLog } from '../types';
import { Card } from './Common';
import { LiveTimer } from './LiveTimer';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';
import { buildClinicFlow, FlowLane, initialsOf, shortName, spreadPositions, visitMinutes } from '../utils/flow';
import { minutesOf, waitMinutes } from '../utils/queue';

interface ClinicMapProps {
    appointments: Appointment[];
    doctors: Doctor[];
    /** Kim kabinetda (useDeskFlow) */
    flowLog: FlowLog;
    onPatientClick?: (patientId: string) => void;
    /** "Keldi" — keyinroqqa yozilgan bemor keldi, qabuli hozirga ko'chadi. Ruxsat bo'lmasa berilmaydi */
    onArrived?: (a: Appointment) => Promise<void>;
    /** "Kirdi" — bemor kabinetga kirdi */
    onEnter?: (a: Appointment) => void | Promise<void>;
    /** Adashib bosilgan "Kirdi" — bemor navbatga qaytadi */
    onUndoEnter?: (a: Appointment) => void | Promise<void>;
    /** "Yakunlash" — qabul yakunlandi. Ruxsat bo'lmasa berilmaydi */
    onFinish?: (a: Appointment) => Promise<void>;
    onOpenBooking?: () => void;
    onSeeAll?: () => void;
}

/** Yo'l chizig'ida ko'rinadigan oyna — keyingi 3 soat */
const ROAD_WINDOW_MIN = 180;
/** Yo'ldagi bitta belgi kengligi (px): vaqt, doira, ism, "Keldi" */
const ROAD_SLOT = 92;
/** Kechikish shu daqiqadan oshsa ogohlantiriladi */
const DELAY_WARN_MIN = 10;
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.9 };
// Pol naqshi (xarita ko'rinishi) — ikkala mavzuda ham yumshoq ko'rinadigan shaffof nuqtalar
const FLOOR_WARM: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(217,119,6,0.14) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_COOL: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(37,99,235,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmOf = (ms: number) => {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const hhmmOfMin = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const doctorLabel = (d: Doctor) => `Dr. ${d.lastName}`;
const doctorColor = (d: Doctor) => d.color || '#2563EB';

function useNow(ms: number): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), ms);
        return () => clearInterval(id);
    }, [ms]);
    return now;
}

function useMedia(query: string): boolean {
    const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    const [match, setMatch] = useState(get);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia(query);
        const on = () => setMatch(mq.matches);
        on();
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, [query]);
    return match;
}

/**
 * Bemor belgisi. layoutId orqali bir joydan boshqasiga "uchib" o'tadi:
 * yo'l → kutish zali → kabinet → chiqish. Har bemor ekranda bitta joyda turadi.
 */
const Token: React.FC<{
    a: Appointment;
    size: number;
    color: string;
    variant?: 'ring' | 'ghost' | 'done';
    className?: string;
    title?: string;
    children?: React.ReactNode;
}> = ({ a, size, color, variant = 'ring', className = '', title, children }) => {
    const look = variant === 'ghost'
        ? 'border-[1.5px] border-dashed bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300'
        : variant === 'done'
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
            : 'border-[2.5px] bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 shadow-[0_8px_16px_-10px_rgba(17,24,39,0.45)]';
    return (
        <motion.span
            layoutId={`flow-${a.id}`}
            transition={SPRING}
            title={title}
            className={`relative shrink-0 inline-flex items-center justify-center rounded-full font-extrabold ${look} ${className}`}
            style={{ width: size, height: size, borderColor: variant === 'done' ? undefined : color, fontSize: Math.round(size * 0.3) }}
        >
            {initialsOf(a.patientName)}
            {children}
        </motion.span>
    );
};

/** Bemor ismi — bemorlar bo'limi ochiq bo'lsa kartani ochadi */
const Name: React.FC<{ a: Appointment; onOpen?: (id: string) => void; className?: string; short?: boolean }> = ({ a, onOpen, className = '', short }) => {
    const text = short ? shortName(a.patientName) : a.patientName;
    if (!onOpen) return <span className={`block truncate ${className}`}>{text}</span>;
    return (
        <button type="button" onClick={() => onOpen(a.patientId)} title={a.patientName} className={`block max-w-full truncate text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${className}`}>
            {text}
        </button>
    );
};

export const ClinicMap: React.FC<ClinicMapProps> = ({
    appointments, doctors, flowLog, onPatientClick, onArrived, onEnter, onUndoEnter, onFinish, onOpenBooking, onSeeAll,
}) => {
    const { t } = useLanguage();
    const now = useNow(30000);
    const wide = useMedia('(min-width: 1024px)');
    const xl = useMedia('(min-width: 1280px)');
    const xxl = useMedia('(min-width: 1536px)');
    const today = formatDateToISO(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const flow = useMemo(
        () => buildClinicFlow(appointments, doctors, flowLog, today, nowMin),
        [appointments, doctors, flowLog, today, nowMin]);
    const [hover, setHover] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const run = async (key: string, fn: () => void | Promise<void>) => {
        if (pending) return;
        setPending(key);
        try {
            await fn();
        } catch {
            // Xatolik ilova toasti orqali ko'rsatiladi
        } finally {
            setPending(null);
        }
    };

    const fmtMin = (min: number) => {
        if (min < 60) return t('flow.min').replace('{m}', String(min));
        const h = Math.floor(min / 60);
        const m = min % 60;
        return m ? t('flow.hourMin').replace('{h}', String(h)).replace('{m}', String(m)) : t('flow.hour').replace('{h}', String(h));
    };
    const waitText = (a: Appointment) => {
        const m = waitMinutes(a, nowMin);
        return m <= 0 ? t('flow.newArrival') : t('desk.waitMin').replace('{m}', String(m));
    };
    const waitTone = (a: Appointment) => {
        const m = waitMinutes(a, nowMin);
        return m >= 30 ? 'text-red-600 dark:text-red-400' : m >= 15 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
    };
    const dimmed = (doctorId: string) => !!hover && hover !== doctorId;
    const laneOf = (doctorId: string) => flow.lanes.find(l => l.doctor.id === doctorId);
    const delayOf = (a: Appointment) => laneOf(a.doctorId)?.delays[a.id] || 0;

    const soon = flow.coming.filter(a => minutesOf(a.time) - nowMin <= ROAD_WINDOW_MIN);
    const seatsPerBench = xxl ? 5 : xl ? 4 : 3;

    // ── Kichik bo'laklar ──────────────────────────────────────────────

    const arriveButton = (a: Appointment, size: 'sm' | 'md') => onArrived && (
        <button
            type="button"
            onClick={() => run(a.id, () => onArrived(a))}
            disabled={!!pending}
            title={t('desk.arrivedHint')}
            aria-label={`${a.patientName}: ${t('desk.arrived')}`}
            className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 font-extrabold hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50 transition-colors ${size === 'sm' ? 'h-[22px] px-2 text-[11px]' : 'h-8 px-3 text-xs'}`}
        >
            {pending === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('desk.arrived')}
        </button>
    );

    const delayBadge = (a: Appointment) => {
        const d = delayOf(a);
        if (d < DELAY_WARN_MIN) return null;
        const at = hhmmOfMin(minutesOf(a.time) + d);
        return (
            <span title={t('flow.delayHint').replace('{time}', at)} className="shrink-0 h-4 px-1.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-extrabold leading-4 tabular-nums">
                {t('flow.delay').replace('{m}', String(d))}
            </span>
        );
    };

    const etaChip = (lane: FlowLane) => {
        const free = lane.etaMin <= 0;
        const cls = free
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : lane.etaMin >= 45
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300';
        return (
            <span
                title={free ? t('flow.etaFreeHint') : t('flow.etaHint').replace('{t}', fmtMin(lane.etaMin))}
                className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-extrabold whitespace-nowrap ${cls}`}
            >
                <Clock className="w-3 h-3" />
                {free ? t('flow.etaFree') : `~${fmtMin(lane.etaMin)}`}
            </span>
        );
    };

    /** Kabinet: kim kresloda, qancha vaqtdan beri, reja bo'yicha qancha qoldi */
    const cabinetBody = (lane: FlowLane, compact: boolean) => {
        const color = doctorColor(lane.doctor);
        const { chair, chairSince } = lane;
        if (chair && chairSince) {
            const planMin = visitMinutes(chair);
            const elapsedMin = Math.max(0, (now.getTime() - chairSince) / 60000);
            const over = elapsedMin > planMin;
            const progress = Math.min(1, elapsedMin / planMin);
            const ring = compact ? 60 : 68;
            const r = ring / 2 - 3;
            const circ = 2 * Math.PI * r;
            const foot = over
                ? t('flow.overPlan').replace('{m}', String(Math.max(1, Math.floor(elapsedMin - planMin))))
                : t('flow.freesIn').replace('{m}', String(Math.max(1, Math.ceil(planMin - elapsedMin))));
            const ringEl = (
                <span className="relative shrink-0" style={{ width: ring, height: ring }}>
                    <svg viewBox={`0 0 ${ring} ${ring}`} width={ring} height={ring} className="-rotate-90" aria-hidden="true">
                        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" strokeWidth={5} className="stroke-blue-100 dark:stroke-blue-950" />
                        <circle
                            cx={ring / 2} cy={ring / 2} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
                            stroke={over ? '#F59E0B' : '#2563EB'}
                            strokeDasharray={`${(circ * progress).toFixed(1)} ${circ.toFixed(1)}`}
                            style={{ transition: 'stroke-dasharray 1s linear' }}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center">
                        <Token a={chair} size={ring - 16} color={color} title={chair.patientName} />
                    </span>
                </span>
            );
            const info = (
                <div className="flex-1 min-w-0">
                    <Name a={chair} onOpen={onPatientClick} className={`${compact ? 'text-sm' : 'text-[15px]'} font-extrabold text-gray-900 dark:text-white`} />
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[chair.type, t('flow.since').replace('{time}', hhmmOf(chairSince))].filter(Boolean).join(' · ')}
                    </p>
                    <p className={`truncate text-xs font-bold ${over ? 'text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}`}>{foot}</p>
                    {lane.chairExtra > 0 && (
                        <p className="truncate text-[11px] text-gray-400">{t('flow.alsoInChair').replace('{n}', String(lane.chairExtra))}</p>
                    )}
                </div>
            );
            const timer = (
                <>
                    <LiveTimer since={chairSince} className={`${compact ? 'text-xl' : 'text-2xl'} font-black leading-none tabular-nums tracking-tight ${over ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`} />
                    <span className="text-[11px] font-bold text-gray-400 whitespace-nowrap">{t('flow.plan').replace('{m}', String(planMin))}</span>
                </>
            );
            const actions = (onUndoEnter || onFinish) && (
                <div className="flex items-center gap-1">
                    {onUndoEnter && (
                        <button
                            type="button"
                            onClick={() => run(`undo:${chair.id}`, () => onUndoEnter(chair))}
                            disabled={!!pending}
                            title={t('flow.undoEnter')}
                            aria-label={`${chair.patientName}: ${t('flow.undoEnter')}`}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onFinish && (
                        <button
                            type="button"
                            onClick={() => run(`fin:${chair.id}`, () => onFinish(chair))}
                            disabled={!!pending}
                            aria-label={t('flow.finishHint').replace('{name}', chair.patientName)}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
                        >
                            {pending === `fin:${chair.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {t('flow.finish')}
                        </button>
                    )}
                </div>
            );
            // Telefonda tugmalar alohida qatorda — ism qisqarib ketmasin
            if (compact) {
                return (
                    <div className="w-full min-w-0">
                        <div className="flex items-center gap-3">
                            {ringEl}
                            {info}
                            <div className="shrink-0 flex flex-col items-end gap-1">{timer}</div>
                        </div>
                        {actions && <div className="mt-2.5 flex justify-end">{actions}</div>}
                    </div>
                );
            }
            return (
                <>
                    {ringEl}
                    {info}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                        {timer}
                        {actions && <div className="mt-1">{actions}</div>}
                    </div>
                </>
            );
        }
        const next = lane.queue[0];
        const booked = lane.coming[0];
        const hint = next
            ? t('flow.nextInQueue').replace('{name}', shortName(next.patientName)).replace('{m}', String(waitMinutes(next, nowMin)))
            : booked
                ? t('flow.nextBooked').replace('{time}', booked.time).replace('{name}', shortName(booked.patientName))
                : t('flow.noMore');
        const ring = compact ? 60 : 68;
        return (
            <>
                <span className="shrink-0 rounded-full border-2 border-dashed border-blue-200 dark:border-blue-800 bg-white/70 dark:bg-gray-800/60 flex items-center justify-center text-blue-300 dark:text-blue-700" style={{ width: ring, height: ring }}>
                    <Armchair className="w-7 h-7" strokeWidth={1.8} />
                </span>
                <div className="flex-1 min-w-0">
                    <p className={`${compact ? 'text-sm' : 'text-[15px]'} font-extrabold text-blue-800 dark:text-blue-300`}>{t('flow.chairFree')}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{hint}</p>
                </div>
                {next && onEnter && (
                    <button
                        type="button"
                        onClick={() => run(`in:${next.id}`, () => onEnter(next))}
                        disabled={!!pending}
                        title={t('flow.enterHint').replace('{name}', next.patientName)}
                        aria-label={t('flow.enterHint').replace('{name}', next.patientName)}
                        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[12.5px] font-extrabold shadow-lg shadow-primary-500/30 active:scale-95 disabled:opacity-60 transition-all"
                    >
                        {t('flow.enter')}
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </>
        );
    };

    const cabinetShell = (lane: FlowLane, compact: boolean) => {
        const over = !!(lane.chair && lane.chairSince && (now.getTime() - lane.chairSince) / 60000 > visitMinutes(lane.chair));
        const tone = lane.chair
            ? over
                ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20'
                : 'border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20';
        return (
            <div className={`relative h-full flex items-center gap-4 ${compact ? 'p-3' : 'pl-5 pr-4 py-3'} rounded-[22px] border-[1.5px] transition-colors ${tone}`} style={FLOOR_COOL}>
                {!compact && <span aria-hidden="true" className="absolute -left-[2px] top-1/2 -translate-y-1/2 w-1 h-9 bg-white dark:bg-gray-800" />}
                {!compact && (
                    <span className="absolute -top-2.5 left-5 max-w-[calc(100%-2.5rem)] inline-flex items-center gap-1.5 h-[18px] px-2 rounded-md bg-white dark:bg-gray-800 text-[10.5px] font-extrabold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        <span className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ backgroundColor: doctorColor(lane.doctor) }} />
                        <span className="truncate">{t('flow.cabinet')} · {doctorLabel(lane.doctor)}{lane.doctor.specialty ? ` · ${lane.doctor.specialty}` : ''}</span>
                    </span>
                )}
                {cabinetBody(lane, compact)}
            </div>
        );
    };

    /** Kutish zalidagi bitta bemor */
    const seated = (lane: FlowLane, a: Appointment, index: number, size: number) => {
        const late = waitMinutes(a, nowMin) >= 30;
        const nextUp = index === 0 && !lane.chair;
        return (
            <div key={a.id} className="shrink-0 w-20 flex flex-col items-center">
                <Token
                    a={a}
                    size={size}
                    color={doctorColor(lane.doctor)}
                    title={[a.patientName, a.type].filter(Boolean).join(' — ')}
                    className={`mt-1.5 ${late ? 'ring-4 ring-red-500/15' : ''}`}
                >
                    {nextUp && <span aria-hidden="true" className="absolute -inset-1.5 rounded-full border-2 border-primary-400 animate-pulse" />}
                    <span aria-hidden="true" className={`absolute -top-1.5 -right-2 min-w-[20px] h-5 px-1 rounded-full border-2 border-amber-50 dark:border-gray-900 text-[10.5px] font-black leading-4 text-center text-white ${index === 0 ? 'bg-primary-600' : 'bg-slate-400 dark:bg-slate-600'}`}>
                        {index + 1}
                    </span>
                </Token>
                <Name a={a} onOpen={onPatientClick} short className="mt-1.5 text-[11.5px] font-bold text-gray-900 dark:text-white" />
                <span className={`text-[11px] font-bold whitespace-nowrap ${waitTone(a)}`}>{waitText(a)}</span>
            </div>
        );
    };

    const benchSeats = (lane: FlowLane, slots: number, size: number) => {
        const visible = lane.queue.length > slots ? lane.queue.slice(0, slots - 1) : lane.queue;
        const hidden = lane.queue.length - visible.length;
        const empty = Math.max(0, slots - visible.length - (hidden > 0 ? 1 : 0));
        return (
            <>
                {visible.map((a, i) => seated(lane, a, i, size))}
                {hidden > 0 && (
                    <div className="shrink-0 w-20 flex flex-col items-center">
                        <span className="mt-1.5 inline-flex items-center justify-center rounded-full border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-sm font-black" style={{ width: size, height: size }}>+{hidden}</span>
                        <span className="mt-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">{t('flow.moreWaiting')}</span>
                    </div>
                )}
                {Array.from({ length: empty }, (_, i) => (
                    <div key={`empty-${i}`} aria-hidden="true" className="shrink-0 w-20 flex justify-center">
                        <Armchair className="mt-4 w-8 h-8 text-amber-200/90 dark:text-amber-900/60" strokeWidth={1.6} />
                    </div>
                ))}
            </>
        );
    };

    const benchLabel = (lane: FlowLane, withName = true) => {
        const longest = lane.queue.reduce((m, a) => Math.max(m, waitMinutes(a, nowMin)), 0);
        const tone = longest >= 30 ? 'text-red-600 dark:text-red-400' : longest >= 15 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
        return (
            <>
                {withName && (
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: doctorColor(lane.doctor) }} />
                        <span className="truncate text-[13px] font-extrabold text-gray-900 dark:text-white">{doctorLabel(lane.doctor)}</span>
                    </span>
                )}
                <span className={`block truncate text-[11.5px] font-bold ${tone}`}>
                    {lane.queue.length ? t('flow.queueCount').replace('{n}', String(lane.queue.length)) : t('flow.queueEmpty')}
                </span>
            </>
        );
    };

    // ── Yo'l: yaqin 3 soatda keladiganlar ───────────────────────────────

    const trackRef = useRef<HTMLDivElement>(null);
    const [trackW, setTrackW] = useState(800);
    useLayoutEffect(() => {
        const el = trackRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => setTrackW(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, [wide]);
    const roadFit = Math.max(1, Math.floor(trackW / ROAD_SLOT));
    const onRoad = soon.slice(0, roadFit);
    const offRoad = flow.coming.length - onRoad.length;
    const roadPositions = useMemo(() => {
        const half = ROAD_SLOT / 2;
        const usable = Math.max(1, trackW - ROAD_SLOT);
        const ideal = onRoad.map(a => (minutesOf(a.time) - nowMin) / ROAD_WINDOW_MIN);
        return spreadPositions(ideal, ROAD_SLOT / usable).map(p => half + p * usable);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRoad.map(a => `${a.id}@${a.time}`).join(','), trackW, nowMin]);

    const roadDesktop = (
        <div className="mt-4 flex items-stretch gap-4 h-[100px]">
            <div className="w-36 shrink-0 flex flex-col justify-center gap-0.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Footprints className="w-4 h-4" /> {t('flow.road')}
                </span>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    <b className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{soon.length}</b> {t('flow.roadMeta')}
                </span>
            </div>
            <div ref={trackRef} className="relative flex-1 min-w-0">
                <span aria-hidden="true" className="absolute left-0 right-0 top-[37px] border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                <span aria-hidden="true" className="absolute -left-1.5 top-[31px] flex w-3.5 h-3.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                    <span className="relative w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-gray-800" />
                </span>
                <span className="absolute -left-2 top-[54px] text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">{t('flow.now')}</span>
                <span aria-hidden="true" className="absolute -right-1 top-[34px] w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="absolute -right-2 top-[54px] text-[11px] font-bold text-slate-400 tabular-nums">{hhmmOfMin(nowMin + ROAD_WINDOW_MIN)}</span>
                {onRoad.length === 0 && (
                    <div className="absolute inset-x-10 top-[46px] flex items-center justify-center gap-3">
                        <span className="px-2 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-400">{t('flow.roadEmpty')}</span>
                        {onOpenBooking && (
                            <button type="button" onClick={onOpenBooking} className="inline-flex items-center gap-1 px-2 bg-white dark:bg-gray-800 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">
                                <Plus className="w-3.5 h-3.5" /> {t('desk.book')}
                            </button>
                        )}
                    </div>
                )}
                {onRoad.map((a, i) => {
                    const lane = laneOf(a.doctorId);
                    const color = lane ? doctorColor(lane.doctor) : '#94A3B8';
                    return (
                        <div
                            key={a.id}
                            className={`absolute top-0 flex flex-col items-center transition-[left,opacity] duration-700 ${dimmed(a.doctorId) ? 'opacity-30' : ''}`}
                            style={{ left: roadPositions[i], width: ROAD_SLOT - 4, marginLeft: -(ROAD_SLOT - 4) / 2 }}
                        >
                            <span className="h-4 inline-flex items-center gap-1 text-[11.5px] font-extrabold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                                {a.time}
                                {a.status === 'Confirmed' && <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} aria-label={t('desk.confirmed')} />}
                                {delayBadge(a)}
                            </span>
                            <Token a={a} size={36} variant="ghost" color={delayOf(a) >= DELAY_WARN_MIN ? '#F87171' : '#94A3B8'} title={[a.patientName, lane ? doctorLabel(lane.doctor) : '', a.type].filter(Boolean).join(' — ')} className="mt-1">
                                <span aria-hidden="true" className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800" style={{ backgroundColor: color }} />
                            </Token>
                            <Name a={a} onOpen={onPatientClick} short className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200" />
                            <span className="mt-0.5">{arriveButton(a, 'sm')}</span>
                        </div>
                    );
                })}
            </div>
            <div className="w-36 shrink-0 flex flex-col justify-center items-end gap-0.5 text-right">
                {offRoad > 0 && (
                    <>
                        <span className="text-[12.5px] font-extrabold text-slate-700 dark:text-slate-200">{t('flow.later').replace('{n}', String(offRoad))}</span>
                        <span className="max-w-full truncate text-[11.5px] font-semibold text-slate-400">
                            {flow.coming.slice(onRoad.length, onRoad.length + 2).map(a => `${a.time} ${shortName(a.patientName)}`).join(', ')}
                        </span>
                    </>
                )}
            </div>
        </div>
    );

    const roadMobile = (
        <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Footprints className="w-4 h-4" /> {t('flow.road')} · {flow.coming.length}
                </span>
            </div>
            {flow.coming.length === 0 ? (
                <p className="text-xs text-gray-400">{t('flow.roadEmpty')}</p>
            ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
                    {flow.coming.map(a => (
                        <div key={a.id} className={`shrink-0 flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-800 ${dimmed(a.doctorId) ? 'opacity-30' : ''}`}>
                            <Token a={a} size={32} variant="ghost" color="#94A3B8" />
                            <div className="min-w-0 max-w-[120px]">
                                <p className="flex items-center gap-1 text-[11.5px] font-extrabold text-gray-900 dark:text-white tabular-nums">{a.time}{delayBadge(a)}</p>
                                <Name a={a} onOpen={onPatientClick} short className="text-xs font-bold text-slate-600 dark:text-slate-300" />
                            </div>
                            {arriveButton(a, 'md')}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Kutish zali + kabinetlar ─────────────────────────────────────

    const mapDesktop = (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1.15fr)]">
            {flow.lanes.map((lane, i) => {
                const first = i === 0;
                const last = i === flow.lanes.length - 1;
                const hoverProps = {
                    onMouseEnter: () => setHover(lane.doctor.id),
                    onMouseLeave: () => setHover(null),
                };
                return (
                    <React.Fragment key={lane.doctor.id}>
                        <div
                            {...hoverProps}
                            className={`relative px-4 border-x-[1.5px] border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 ${first ? 'pt-4 rounded-t-3xl border-t-[1.5px]' : 'pt-3'} ${last ? 'pb-4 rounded-b-3xl border-b-[1.5px]' : 'pb-3'}`}
                            style={FLOOR_WARM}
                        >
                            {!first && <span aria-hidden="true" className="absolute left-3 right-3 top-0 border-t-[1.5px] border-dashed border-amber-200/90 dark:border-amber-900/40" />}
                            {first && (
                                <>
                                    <span className="absolute -top-2.5 left-5 z-10 h-[18px] px-2 rounded-md bg-white dark:bg-gray-800 text-[10.5px] font-extrabold uppercase tracking-wider leading-[18px] whitespace-nowrap text-amber-800 dark:text-amber-300">
                                        {t('flow.hall')} · {t('flow.hallCount').replace('{n}', String(flow.counts.waiting))}
                                    </span>
                                    <span aria-hidden="true" className="absolute -top-[2px] right-10 w-16 h-1 bg-white dark:bg-gray-800" />
                                    <span className="absolute -top-2.5 right-[6.75rem] z-10 h-[18px] px-1.5 rounded-md bg-white dark:bg-gray-800 text-[10px] font-extrabold uppercase tracking-wider leading-[18px] text-amber-600/80 dark:text-amber-400/80">{t('flow.door')}</span>
                                </>
                            )}
                            <span aria-hidden="true" className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-1 h-9 bg-white dark:bg-gray-800" />
                            <div className="flex items-center gap-3 min-h-[96px]">
                                <div className="w-28 shrink-0 min-w-0 flex flex-col gap-0.5">
                                    {benchLabel(lane)}
                                    <span className="mt-1">{etaChip(lane)}</span>
                                </div>
                                {/* Navbatdagi birinchi eshikka (kabinetga) eng yaqin o'tiradi */}
                                <div className="flex-1 min-w-0 flex flex-row-reverse items-center justify-start gap-1">
                                    {benchSeats(lane, seatsPerBench, 44)}
                                </div>
                            </div>
                        </div>
                        <div aria-hidden="true" className="relative flex items-center justify-center">
                            <span className={`absolute left-1/2 -translate-x-1/2 border-l-2 border-dashed border-slate-200 dark:border-slate-700 ${first ? 'top-1/2' : 'top-0'} ${last ? 'bottom-1/2' : 'bottom-0'}`} />
                            <span className="relative w-7 h-7 rounded-full bg-white dark:bg-gray-800 border-[1.5px] border-slate-200 dark:border-slate-600 text-slate-400 flex items-center justify-center">
                                <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                        </div>
                        <div {...hoverProps} className={`${first ? '' : 'pt-1.5'} ${last ? '' : 'pb-1.5'}`}>
                            {cabinetShell(lane, false)}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );

    const mapMobile = (
        <div className="mt-4 space-y-3">
            {flow.lanes.map(lane => (
                <div key={lane.doctor.id} className="rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                        <span className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: doctorColor(lane.doctor) }} />
                            <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">{doctorLabel(lane.doctor)}</span>
                            {lane.doctor.specialty && <span className="truncate text-xs text-gray-400">{lane.doctor.specialty}</span>}
                        </span>
                        {etaChip(lane)}
                    </div>
                    <div className="p-3">{cabinetShell(lane, true)}</div>
                    <div className="px-3.5 pb-3 pt-2 bg-amber-50/70 dark:bg-amber-950/20 border-t border-amber-100 dark:border-amber-900/40" style={FLOOR_WARM}>
                        <div className="mb-1">{benchLabel(lane, false)}</div>
                        {lane.queue.length > 0 && (
                            <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                                {lane.queue.map((a, i) => seated(lane, a, i, 40))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    const legend = (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-dashed border-slate-400" /><b className="font-extrabold text-gray-900 dark:text-white tabular-nums">{flow.counts.coming}</b> {t('flow.legend.coming')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /><b className="font-extrabold text-gray-900 dark:text-white tabular-nums">{flow.counts.waiting}</b> {t('flow.legend.waiting')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary-600" /><b className="font-extrabold text-gray-900 dark:text-white tabular-nums">{flow.counts.inChair}</b> {t('flow.legend.inChair')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><b className="font-extrabold text-gray-900 dark:text-white tabular-nums">{flow.counts.done}</b> {t('flow.legend.done')}</span>
        </div>
    );

    return (
        <Card className="rounded-[2rem] p-5 sm:p-6">
            <MotionConfig reducedMotion="user">
                <LayoutGroup>
                    <section aria-labelledby="clinic-map-title">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <h2 id="clinic-map-title" className="text-lg font-black text-gray-900 dark:text-white">{t('flow.title')}</h2>
                                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold tracking-wide tabular-nums">
                                    <span className="relative flex w-2 h-2">
                                        <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                                        <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
                                    </span>
                                    {t('flow.live')} · {hhmmOfMin(nowMin)}
                                </span>
                            </div>
                            {legend}
                        </div>

                        {doctors.length === 0 ? (
                            <p className="mt-4 text-sm text-gray-500">{t('desk.noDoctors')}</p>
                        ) : flow.lanes.length === 0 ? (
                            <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('flow.empty')}</p>
                                {onOpenBooking && (
                                    <button type="button" onClick={onOpenBooking} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-extrabold">
                                        <Plus className="w-3.5 h-3.5" /> {t('desk.book')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {wide ? roadDesktop : roadMobile}
                                {wide ? mapDesktop : mapMobile}
                            </>
                        )}

                        {(flow.idle.length > 0 || onSeeAll) && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                                {flow.idle.length > 0 ? (
                                    <span className="text-gray-500 dark:text-gray-400">
                                        {t('flow.idle')}: <b className="font-extrabold text-gray-700 dark:text-gray-200">{flow.idle.map(doctorLabel).join(', ')}</b>
                                    </span>
                                ) : <span />}
                                {onSeeAll && (
                                    <button type="button" onClick={onSeeAll} className="inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-400 hover:underline">
                                        {t('flow.calendar')} <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                </LayoutGroup>
            </MotionConfig>
        </Card>
    );
};
