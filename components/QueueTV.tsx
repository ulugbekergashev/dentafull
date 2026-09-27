import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Volume2, VolumeX, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { FlowLane, shortName, visitMinutes } from '../utils/flow';
import { CallEvent, WaitingRow, hhmmOfMinutes } from '../utils/onlineQueue';
import { FlowLog, TicketLog } from '../types';

/**
 * Kutish zalidagi TV uchun navbat tablosi (aeroport tablosi uslubida).
 * 1920×1080 da chiziladi va ekranga sig'adigan qilib kattalashtiriladi/kichraytiriladi.
 * Ma'lumot Onlayn navbat sahifasiniki bilan bir xil — alohida so'rov yo'q.
 */

const W = 1920;
const H = 1080;
const AMBER = '#FBBF24';

const WEEKDAYS = {
    uz: ['YAKSHANBA', 'DUSHANBA', 'SESHANBA', 'CHORSHANBA', 'PAYSHANBA', 'JUMA', 'SHANBA'],
    ru: ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА'],
};
const MONTHS = {
    uz: ['YANVAR', 'FEVRAL', 'MART', 'APREL', 'MAY', 'IYUN', 'IYUL', 'AVGUST', 'SENTABR', 'OKTABR', 'NOYABR', 'DEKABR'],
    ru: ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ'],
};

const CSS = `
.qtv{font-family:Inter,system-ui,sans-serif}
.qtv .mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
.qtv .tile{position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:linear-gradient(#1C2638 50%,#151D2D 50%);color:#F8FAFC;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 18px -10px rgba(0,0,0,.9);backface-visibility:hidden}
.qtv .tile::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#04070D;opacity:.9}
.qtv .flip{animation:qtvflip .55s cubic-bezier(.3,1.4,.5,1) both}
@keyframes qtvflip{0%{transform:perspective(400px) rotateX(-92deg);filter:brightness(1.8)}60%{filter:brightness(1.2)}100%{transform:perspective(400px) rotateX(0);filter:none}}
.qtv .calling{animation:qtvglow 1.4s ease-in-out infinite}
@keyframes qtvglow{0%,100%{box-shadow:0 0 0 2px rgba(251,191,36,.55),0 30px 80px -30px rgba(251,191,36,.45)}50%{box-shadow:0 0 0 2px rgba(251,191,36,1),0 30px 90px -20px rgba(251,191,36,.7)}}
.qtv .blink{animation:qtvblink 1.1s steps(2,start) infinite}
@keyframes qtvblink{to{visibility:hidden}}
.qtv .dot{position:relative;flex:none;width:12px;height:12px;border-radius:999px;background:#FBBF24}
.qtv .dot::after{content:"";position:absolute;inset:0;border-radius:999px;background:#FBBF24;animation:qtvping 1.5s cubic-bezier(0,0,.2,1) infinite}
@keyframes qtvping{75%,100%{transform:scale(2.6);opacity:0}}
.qtv .ticker{display:inline-block;padding-left:100%;white-space:nowrap;animation:qtvticker 38s linear infinite}
@keyframes qtvticker{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion: reduce){.qtv .flip,.qtv .calling,.qtv .blink,.qtv .dot::after,.qtv .ticker{animation:none}}
`;

const FONT_ID = 'qtv-mono-font';

interface QueueTVProps {
    clinicName: string;
    lanes: FlowLane[];
    waiting: WaitingRow[];
    events: CallEvent[];
    log: FlowLog;
    tickets: TicketLog;
    nowMin: number;
    voice: boolean;
    onToggleVoice: () => void;
    onExit: () => void;
    /** Sahifa havola orqali ochilgan — ovoz va to'liq ekran uchun bir marta bosish kerak */
    needsStart: boolean;
    onStart: () => void;
}

const upper = (v: string) => String(v || '').toLocaleUpperCase('uz');
const doctorLabel = (name: string) => upper(name.replace(/^Dr\.?\s*/i, 'Dr. '));

export const QueueTV: React.FC<QueueTVProps> = ({
    clinicName, lanes, waiting, events, log, tickets, nowMin, voice, onToggleVoice, onExit, needsStart, onStart,
}) => {
    const { t, language } = useLanguage();
    const lang = language === 'ru' ? 'ru' : 'uz';
    const [scale, setScale] = useState(1);
    const [now, setNow] = useState(() => new Date());
    const [controls, setControls] = useState(true);
    const hideTimer = useRef<number | undefined>();

    // Shrift (bir marta) — tablo uslubidagi raqamlar uchun
    useEffect(() => {
        if (document.getElementById(FONT_ID)) return;
        const link = document.createElement('link');
        link.id = FONT_ID;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=swap';
        document.head.appendChild(link);
    }, []);

    useLayoutEffect(() => {
        const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, []);

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    // Boshqaruv tugmalari sichqoncha qimirlaganda chiqadi, 3 soniyadan keyin yashirinadi
    useEffect(() => {
        const show = () => {
            setControls(true);
            window.clearTimeout(hideTimer.current);
            hideTimer.current = window.setTimeout(() => setControls(false), 3000);
        };
        show();
        window.addEventListener('mousemove', show);
        window.addEventListener('touchstart', show);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onExit(); };
        window.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(hideTimer.current);
            window.removeEventListener('mousemove', show);
            window.removeEventListener('touchstart', show);
            window.removeEventListener('keydown', onKey);
        };
    }, [onExit]);

    const hero = events[0];
    const heroKey = hero ? `${hero.appointment.id}:${hero.at}` : '';
    // Yangi chaqiruv — tablo varaqlanadi va 12 soniya yonib turadi
    const [flipKey, setFlipKey] = useState(heroKey);
    const [callingUntil, setCallingUntil] = useState(0);
    const firstHero = useRef(true);
    useEffect(() => {
        if (firstHero.current) { firstHero.current = false; setFlipKey(heroKey); return; }
        if (!heroKey) return;
        setFlipKey(heroKey);
        setCallingUntil(Date.now() + 12000);
    }, [heroKey]);
    const calling = !!hero && now.getTime() < callingUntil;

    const pad = (n: number) => String(n).padStart(2, '0');
    const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const eventTime = (at: number) => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

    const heroName = hero ? upper(shortName(hero.appointment.patientName)) : '';
    const nameChars = heroName.split('');
    const tileW = Math.max(34, Math.min(58, Math.floor(760 / Math.max(1, nameChars.length)) - 6));
    const numText = hero?.number ? String(hero.number) : '—';

    const shownLanes = useMemo(() => {
        const busy = [...lanes].sort((a, b) => (b.chair ? 1 : 0) + b.queue.length - ((a.chair ? 1 : 0) + a.queue.length));
        return busy.slice(0, 3);
    }, [lanes]);
    const hiddenLanes = Math.max(0, lanes.length - shownLanes.length);

    const ROWS = 5;
    const rows = waiting.slice(0, ROWS);
    const moreRows = waiting.length - rows.length;

    const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60000)) : 0);
    const num = (id: string) => (tickets[id] ? `№${tickets[id]}` : '');

    const gridCols = '120px minmax(0,1.5fr) minmax(0,1fr) 200px 220px';

    return (
        <div className="qtv fixed inset-0 z-[80] flex items-center justify-center overflow-hidden" style={{ background: '#04070D' }}>
            <style>{CSS}</style>
            <div
                style={{
                    position: 'relative', width: W, height: H, flex: 'none', transform: `scale(${scale})`, transformOrigin: 'center',
                    boxSizing: 'border-box', padding: '34px 44px 30px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden',
                    color: '#E2E8F0', background: 'radial-gradient(1200px 700px at 30% 20%, #0C1424 0%, #04070D 70%)',
                }}
            >
                {/* Sarlavha: klinika va soat */}
                <header style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, height: 96, paddingBottom: 18, borderBottom: '1px solid #1A2333' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                        <span style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#FBBF24,#F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                            <svg viewBox="0 0 100 100" width="36" height="36" aria-hidden="true"><path d="M50 13C55.5 7 62 3.5 70.5 3.5C85 3.5 94 15 94 30.5C94 41 90.5 51.5 87.5 63C84.5 74.5 82.5 86 78.5 92.5C75.5 97.5 68.5 96.5 66.5 90.5C63.5 81 61.5 69 57.5 63C54.5 58.5 45.5 58.5 42.5 63C38.5 69 36.5 81 33.5 90.5C31.5 96.5 24.5 97.5 21.5 92.5C17.5 86 15.5 74.5 12.5 63C9.5 51.5 6 41 6 30.5C6 15 15 3.5 29.5 3.5C38 3.5 44.5 7 50 13Z" fill="#1C1303" /></svg>
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                            <h1 className="mono" style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '0.14em', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{upper(clinicName)}</h1>
                            <span style={{ fontSize: 17, fontWeight: 600, color: '#94A3B8' }}>{t('queue.tv.subtitle')}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                        <div role="timer" aria-label={clock} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {clock.split('').map((ch, i) => ch === ':'
                                ? <span key={i} className="mono blink" style={{ fontSize: 50, fontWeight: 800, color: AMBER }}>:</span>
                                : <span key={i} className="tile mono" style={{ width: 58, height: 80, fontSize: 58, fontWeight: 800 }}>{ch}</span>)}
                        </div>
                        <div className="mono" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 16, fontWeight: 700, letterSpacing: '0.12em', color: '#94A3B8', textAlign: 'right' }}>
                            <span>{WEEKDAYS[lang][now.getDay()]}</span>
                            <span style={{ color: '#CBD5E1' }}>{now.getDate()} {MONTHS[lang][now.getMonth()]}</span>
                        </div>
                    </div>
                </header>

                <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 22, height: 482 }}>
                    {/* Hozir chaqirilmoqda */}
                    <section aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                        <div className={calling ? 'calling' : ''} style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26, padding: '30px 38px', borderRadius: 26, background: 'linear-gradient(160deg,#0E1726,#0A111D)', border: '1px solid #22304A', minHeight: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                {hero && <span className="dot" />}
                                <span className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.24em', color: AMBER }}>{hero ? t('queue.tv.calling') : t('queue.tv.waitingCall')}</span>
                                {hero && <span className="mono" style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', color: '#64748B' }}>{t('queue.tv.calledAt')} {eventTime(hero.at)}</span>}
                            </div>
                            {hero ? (
                                <div key={flipKey} style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 'none' }}>
                                        <span className="mono" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.2em', color: '#64748B' }}>{t('queue.tv.number')}</span>
                                        <span style={{ display: 'flex', gap: 8 }}>
                                            {numText.split('').map((ch, i) => (
                                                <span key={i} className="tile flip mono" style={{ width: 104, height: 140, fontSize: 110, fontWeight: 800, color: AMBER, animationDelay: `${i * 70}ms` }}>{ch}</span>
                                            ))}
                                        </span>
                                    </div>
                                    <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
                                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {nameChars.map((ch, i) => ch === ' '
                                                ? <span key={i} style={{ width: 22 }} />
                                                : <span key={i} className="tile flip mono" style={{ width: tileW, height: 78, fontSize: Math.round(tileW * 0.93), fontWeight: 800, animationDelay: `${140 + i * 45}ms` }}>{ch}</span>)}
                                        </span>
                                        <span className="mono" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 38, fontWeight: 800, letterSpacing: '0.04em', color: '#F8FAFC', minWidth: 0 }}>
                                            <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" style={{ flex: 'none', color: AMBER }} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doctorLabel(hero.appointment.doctorName)}</span>
                                            <span style={{ fontSize: 26, color: '#94A3B8', flex: 'none' }}>{t('queue.tv.toDoctor')}</span>
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <p className="mono" style={{ margin: 0, fontSize: 34, fontWeight: 700, color: '#64748B' }}>{t('queue.tv.noCalls')}</p>
                            )}
                        </div>
                        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 24px', borderRadius: 18, background: '#0A111C', border: '1px solid #1A2333', minHeight: 96 }}>
                            <span className="mono" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: '#64748B' }}>{t('queue.tv.previous')}</span>
                            {events.slice(1, 3).map(e => (
                                <div key={e.appointment.id} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 22, fontWeight: 700, color: '#94A3B8' }}>
                                    <span style={{ width: 70, color: AMBER, opacity: 0.8 }}>{e.number ? `№${e.number}` : '—'}</span>
                                    <span style={{ flex: '1 1 auto', color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{upper(shortName(e.appointment.patientName))}</span>
                                    <span style={{ whiteSpace: 'nowrap' }}>→ {doctorLabel(e.appointment.doctorName)}</span>
                                    <span style={{ width: 90, textAlign: 'right', color: '#64748B' }}>{eventTime(e.at)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Shifokorlar */}
                    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '20px 28px', borderRadius: 26, background: '#0A111C', border: '1px solid #1A2333', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                            <span className="mono" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.22em', color: AMBER }}>{t('queue.tv.doctors')}</span>
                            {hiddenLanes > 0 && <span className="mono" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', color: '#64748B' }}>+{hiddenLanes} {t('queue.tv.moreDoctors')}</span>}
                        </div>
                        {shownLanes.length === 0 && (
                            <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: '#64748B', paddingTop: 12 }}>{t('queue.tv.noDoctors')}</span>
                        )}
                        {shownLanes.map(lane => {
                            const chair = lane.chair;
                            const entry = chair ? log[chair.id] : undefined;
                            const lastCall = entry ? Math.max(Date.parse(entry.in) || 0, entry.call ? Date.parse(entry.call) || 0 : 0) : 0;
                            const entering = !!chair && now.getTime() - lastCall < 60000;
                            const next = lane.queue[0];
                            const queueMin = lane.queue.reduce((s, a) => s + visitMinutes(a), 0);
                            return (
                                <div key={lane.doctor.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0 10px', borderTop: '1px solid #1A2333' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                                        <span className="mono" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 800, letterSpacing: '0.04em', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{upper(`Dr. ${lane.doctor.lastName}`)}</span>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>{lane.doctor.specialty}</span>
                                    </div>
                                    <div className="mono" style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', rowGap: 2, fontSize: 18, lineHeight: '24px', fontWeight: 700 }}>
                                        <span style={{ fontSize: 15, letterSpacing: '0.16em', color: '#64748B', alignSelf: 'center' }}>{t('queue.tv.inCabinet')}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, color: chair ? '#93C5FD' : '#4ADE80' }}>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {chair ? `${num(chair.id)} ${upper(shortName(chair.patientName))}${entering ? '' : ` · ${minutesSince(entry?.in)} ${t('queue.tv.min')}`}` : t('queue.tv.free')}
                                            </span>
                                            {entering && <span className="blink" style={{ flex: 'none', padding: '2px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.16)', color: AMBER, fontSize: 14, letterSpacing: '0.14em' }}>{t('queue.tv.entering')}</span>}
                                        </span>
                                        <span style={{ fontSize: 15, letterSpacing: '0.16em', color: '#64748B', alignSelf: 'center' }}>{t('queue.tv.next')}</span>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#CBD5E1' }}>{next ? `${num(next.id)} ${upper(shortName(next.patientName))}` : '—'}</span>
                                        <span style={{ fontSize: 15, letterSpacing: '0.16em', color: '#64748B', alignSelf: 'center' }}>{t('queue.tv.queue')}</span>
                                        <span style={{ color: lane.queue.length >= 3 ? AMBER : '#CBD5E1' }}>
                                            {lane.queue.length ? `${lane.queue.length} ${t('queue.tv.people')} · ~${queueMin} ${t('queue.tv.min')}` : t('queue.tv.noQueue')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                </div>

                {/* Navbat jadvali */}
                <section style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '18px 28px 12px', borderRadius: 26, background: '#0A111C', border: '1px solid #1A2333' }}>
                    <div className="mono" style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 20, padding: '0 10px 10px', borderBottom: '1px solid #1A2333', fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: '#64748B' }}>
                        <span>{t('queue.tv.number')}</span><span>{t('queue.tv.patient')}</span><span>{t('queue.tv.doctor')}</span><span>{t('queue.tv.waiting')}</span><span>{t('queue.tv.eta')}</span>
                    </div>
                    {rows.map(r => {
                        const eta = r.etaAt - nowMin;
                        return (
                            <div key={r.appointment.id} className="mono" style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 20, alignItems: 'center', height: 46, padding: '0 10px', borderBottom: '1px solid #111A29', fontSize: 24, fontWeight: 700 }}>
                                <span style={{ color: AMBER }}>{r.number ? `№${r.number}` : '—'}</span>
                                <span style={{ color: '#F8FAFC', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{upper(shortName(r.appointment.patientName))}</span>
                                <span style={{ color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doctorLabel(r.appointment.doctorName)}</span>
                                <span style={{ color: r.waitMin >= 30 ? '#F87171' : r.waitMin >= 15 ? AMBER : '#94A3B8' }}>{r.waitMin <= 0 ? t('queue.tv.new') : `${r.waitMin} ${t('queue.tv.min')}`}</span>
                                <span style={{ color: '#F8FAFC' }}>{eta < 1 ? t('queue.tv.now') : `~${hhmmOfMinutes(r.etaAt)}`}</span>
                            </div>
                        );
                    })}
                    {moreRows > 0 && (
                        <div className="mono" style={{ padding: '10px 10px 0', fontSize: 20, fontWeight: 700, color: '#64748B' }}>+{moreRows} {t('queue.tv.morePeople')}</div>
                    )}
                    {waiting.length === 0 && (
                        <div className="mono" style={{ padding: '22px 10px', fontSize: 24, fontWeight: 700, color: '#4ADE80' }}>{t('queue.tv.empty')}</div>
                    )}
                </section>

                {/* Yuguruvchi satr */}
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 18, height: 58, padding: '0 22px', borderRadius: 16, background: '#0D1522', border: '1px solid #1A2333', overflow: 'hidden' }}>
                    <span className="mono blink" aria-hidden="true" style={{ flex: 'none', fontSize: 22, fontWeight: 800, color: AMBER }}>▶</span>
                    <div style={{ flex: '1 1 auto', overflow: 'hidden' }}>
                        <span className="ticker mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', color: '#CBD5E1' }}>{t('queue.tv.ticker')}</span>
                    </div>
                </div>
            </div>

            {/* Boshqaruv: sichqoncha qimirlaganda ko'rinadi */}
            <div className={`fixed top-4 right-4 flex items-center gap-2 transition-opacity ${controls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <button type="button" onClick={onToggleVoice} title={voice ? t('queue.voiceOff') : t('queue.voiceOn')} className="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-2 text-sm font-semibold">
                    {voice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}); }} title={t('queue.fullscreen')} className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center">
                    <Maximize2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={onExit} title={t('queue.tv.exit')} className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Havola orqali ochilgan TV: brauzer ovozni faqat bosishdan keyin beradi */}
            {needsStart && (
                <button type="button" onClick={onStart} className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-black/70 text-white">
                    <span className="w-20 h-20 rounded-full bg-amber-400 text-gray-900 flex items-center justify-center"><Volume2 className="w-10 h-10" /></span>
                    <span className="text-2xl font-bold">{t('queue.tv.start')}</span>
                    <span className="text-sm text-white/70">{t('queue.tv.startHint')}</span>
                </button>
            )}
        </div>
    );
};
