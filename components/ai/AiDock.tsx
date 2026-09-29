import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
    X, History, SquarePen, Maximize2, Minimize2, MapPin, Trash2, ArrowLeft, MessageSquareDashed,
} from 'lucide-react';
import { UserRole } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { formatHeaderDate } from '../../utils/dateUtils';
import { aiRequest, aiStream, AskResult, PendingAction, Pulse, Report, ReportOption, StreamEvent } from './aiClient';
import {
    AiContext, Lang, SlashCommand, Suggestion, contextLabel, contextPayload, followUpsFor, greeting,
    slashCommands, suggestionsFor,
} from './aiContext';
import { AiOrb, ensureAiStyles } from './AiOrb';
import { AiPulse } from './AiPulse';
import { AiMessage, Turn } from './AiMessage';
import { AiComposer } from './AiComposer';

// ─── DentaAI yon paneli ───────────────────────────────────────────────────────
//
// Ilgari DentaAI ekran markazidagi modal oyna edi: u sahifani to'sib qo'yardi,
// yopilganda suhbat yo'qolardi va javob sahifadagi ma'lumotdan uzilgan edi —
// "bu bemorning qarzi qancha?" deyish uchun ismni qayta aytish kerak edi.
//
// Endi u o'ng tomondan chiqadigan ish paneli:
//   • keng ekranda sahifani SURIB joylashadi — kalendar yoki bemor kartasi
//     yonma-yon ko'rinib turadi, panel ish bilan birga yashaydi;
//   • ochiq sahifani biladi (bemor kartasi, kalendar, moliya) va savolni
//     shunga bog'laydi;
//   • ochilishi bilan "kun pulsi" — savol o'ylab topish shart emas;
//   • javob ostida bosiladigan kartochkalar — bemor nomini bosish kartani
//     yon tomonda ochadi, bo'sh vaqtni bosish qabulga yozishni tayyorlaydi;
//   • yopilganda suhbat saqlanib qoladi.

interface ConversationRow {
    id: string;
    title: string;
    updatedAt: string;
}

/** lg: sarlavha qatori (64) + bo'limlar qatori (48) — App.tsx dagi lg:pt-28. */
const HEADER_H = 112;
const MIN_W = 360;
const DEFAULT_W = 440;
const WIDE_W = 640;
/** Shundan keng ekranda panel sahifani suradi, torroqda ustiga chiqadi. */
const PUSH_FROM = 1280;
/** Server o'z muddatida (55s) tushunarli xato qaytarishga ulgursin. */
const STREAM_TIMEOUT_MS = 65_000;
const PULSE_TTL_MS = 60_000;

const uid = () => Math.random().toString(36).slice(2, 10);

const readNumber = (key: string, def: number) => {
    try {
        const n = Number(localStorage.getItem(key));
        return Number.isFinite(n) && n > 0 ? n : def;
    } catch { return def; }
};

function useMedia(query: string): boolean {
    const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setMatch(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [query]);
    return match;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userRole: UserRole;
    userName: string;
    /** Ochiq sahifa (App.tsx, deriveContext). */
    context: AiContext | null;
    /** Keng ekranda sahifa shuncha piksel suriladi (panel yopiq yoki ustida — 0). */
    onLayoutChange: (pushPx: number) => void;
    /** Harakat bajarildi — ilova tegishli ro'yxatni qayta yuklaydi. */
    onDataChanged?: (actionName: string) => void;
}

export const AiDock: React.FC<Props> = ({
    open, onOpenChange, userRole, userName, context, onLayoutChange, onDataChanged,
}) => {
    ensureAiStyles();
    const { language, t } = useLanguage();
    const lang: Lang = language === 'ru' ? 'ru' : 'uz';
    const ru = lang === 'ru';
    const navigate = useNavigate();
    const isDesktop = useMedia('(min-width: 1024px)');
    const canPush = useMedia(`(min-width: ${PUSH_FROM}px)`);

    const [turns, setTurns] = useState<Turn[]>([]);
    const turnsRef = useRef(turns);
    turnsRef.current = turns;
    const [input, setInput] = useState('');
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [reports, setReports] = useState<ReportOption[]>([]);
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [pulse, setPulse] = useState<Pulse | null>(null);
    const [pulseLoading, setPulseLoading] = useState(false);
    const pulseMark = useRef({ at: 0, lang: '' });
    const [useCtx, setUseCtx] = useState(true);
    const [actionBusy, setActionBusy] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [width, setWidth] = useState(() => Math.max(MIN_W, readNumber('dentaai_dock_w', DEFAULT_W)));
    const [voiceLang, setVoiceLang] = useState<'uz' | 'ru'>(() => {
        try {
            const v = localStorage.getItem('dentaai_voice_lang');
            if (v === 'uz' || v === 'ru') return v;
        } catch { /* xotira yopiq */ }
        return 'uz';
    });

    const conversationId = useRef<string | null>(null);
    const dirty = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const stick = useRef(true);
    const pendingVoice = useRef(false);

    const busy = turns.some(x => x.status === 'streaming');
    const activeCtx = useCtx ? context : null;
    const ctxRef = useRef(activeCtx);
    ctxRef.current = activeCtx;

    // Boshqa bemorga yoki sahifaga o'tildi — kontekst yana yoqiladi.
    const ctxKey = context ? (context.kind === 'patient' ? `p:${context.patientId}` : `g:${context.page}`) : '';
    useEffect(() => { setUseCtx(true); }, [ctxKey]);

    // ── Ma'lumot yuklash ────────────────────────────────────────────────────

    const loadConversations = useCallback(() => {
        aiRequest<{ items: ConversationRow[] }>('/ai/conversations')
            .then(d => setConversations(d.items || []))
            .catch(() => { /* ro'yxat keyingi ochilishda */ });
    }, []);

    const refreshPulse = useCallback((force = false) => {
        const mark = pulseMark.current;
        if (!force && mark.lang === lang && Date.now() - mark.at < PULSE_TTL_MS) return;
        pulseMark.current = { at: Date.now(), lang };
        setPulseLoading(true);
        aiRequest<{ pulse: Pulse | null }>(`/ai/pulse?lang=${lang}`)
            .then(d => setPulse(d.pulse || null))
            .catch(() => { /* puls — qulaylik; bo'lmasa bosh ekran savol bilan ishlaydi */ })
            .finally(() => setPulseLoading(false));
    }, [lang]);

    useEffect(() => {
        if (!open) return;
        // Ro'yxat serverdan: frontendda qattiq yozilsa, ruxsati yo'q rol tugmani
        // ko'rib, bosib, 403 olardi.
        aiRequest<{ reports: ReportOption[] }>(`/ai/reports?lang=${lang}`)
            .then(d => setReports(d.reports || []))
            .catch(() => setReports([]));
        loadConversations();
        refreshPulse();
    }, [open, lang, loadConversations, refreshPulse]);

    // Yopiq panel ham pulsni biladi: yon tugmadagi nuqta "e'tibor talab
    // qiladigan narsa bor" deydi. Birinchi so'rov sahifa yuklanib bo'lgach,
    // keyin 10 daqiqada bir — faqat oyna ko'rinib turganda.
    useEffect(() => {
        const first = window.setTimeout(() => refreshPulse(), 8000);
        const every = window.setInterval(() => {
            if (document.visibilityState === 'visible') refreshPulse();
        }, 10 * 60_000);
        return () => { window.clearTimeout(first); window.clearInterval(every); };
    }, [refreshPulse]);

    // ── Joylashuv ───────────────────────────────────────────────────────────

    useEffect(() => {
        onLayoutChange(open && isDesktop && canPush ? width : 0);
    }, [open, isDesktop, canPush, width, onLayoutChange]);

    useEffect(() => {
        try { localStorage.setItem('dentaai_dock_w', String(width)); } catch { /* muhim emas */ }
    }, [width]);

    // Telefonda panel butun ekranni egallaydi — orqadagi sahifa surilmasin.
    useEffect(() => {
        if (!open || isDesktop) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open, isDesktop]);

    useEffect(() => {
        if (!open || !isDesktop) return;
        const id = window.setTimeout(() => inputRef.current?.focus(), 240);
        return () => window.clearTimeout(id);
    }, [open, isDesktop]);

    useEffect(() => {
        if (!busy) { setElapsed(0); return; }
        const id = window.setInterval(() => setElapsed(s => s + 1), 1000);
        return () => window.clearInterval(id);
    }, [busy]);

    // Pastga yopishib turadi — foydalanuvchi o'zi yuqoriga surmagan bo'lsa.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !stick.current || !turns.length || view !== 'chat') return;
        el.scrollTo({ top: el.scrollHeight, behavior: busy ? 'auto' : 'smooth' });
    }, [turns, busy, view]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    };

    // Bosh ekran (puls) va tarix doim tepadan boshlanadi — oldingi suhbatning
    // pastki qismida qolib ketgan scroll pulsning yarmini yashirardi.
    const onHome = turns.length === 0 || view === 'history';
    useEffect(() => {
        if (onHome) scrollRef.current?.scrollTo({ top: 0 });
    }, [onHome, view]);

    // Sahifa yopilsa yarim yo'lda qolgan so'rov bekor qilinadi.
    useEffect(() => () => abortRef.current?.abort(), []);

    // ── Suhbatni saqlash ────────────────────────────────────────────────────
    // Javob tugagach, bitta so'rov bilan. Muvaffaqiyatsizlik jim o'tadi:
    // javob baribir ekranda turibdi.
    useEffect(() => {
        if (!dirty.current || busy) return;
        dirty.current = false;
        // Tiklangan (tarixdan ochilgan) almashinuvlar ham kiradi: aks holda eski
        // suhbatni davom ettirganda u faqat yangi savol bilan qayta yozilardi.
        const messages = turnsRef.current
            .filter(x => x.status === 'done')
            .map(x => ({ q: x.q, a: x.a || x.report?.narrative || '', sources: x.sources }));
        if (!messages.length) return;
        aiRequest<{ id: string }>('/ai/conversations', { id: conversationId.current, messages })
            .then(d => { conversationId.current = d.id; loadConversations(); })
            .catch(() => { /* qulaylik */ });
    }, [turns, busy, loadConversations]);

    // ── Savol ───────────────────────────────────────────────────────────────

    const patchTurn = useCallback((id: string, fn: (x: Turn) => Turn) => {
        setTurns(prev => prev.map(x => (x.id === id ? fn(x) : x)));
    }, []);

    const ask = useCallback(async (text: string) => {
        const q = text.trim();
        if (!q || turnsRef.current.some(x => x.status === 'streaming')) return;

        setView('chat');
        setInput('');
        stick.current = true;

        const id = uid();
        const ctxAt = ctxRef.current;
        // Oldingi almashinuvlar ham yuboriladi — "va o'tgan oychi?" kabi
        // davomiy savol kontekstsiz qolmasligi uchun. Server oxirgi 10 tasini oladi.
        const history = turnsRef.current
            .filter(x => x.kind === 'ask' && x.status === 'done' && x.a)
            .slice(-5)
            .flatMap(x => [{ role: 'user', content: x.q }, { role: 'assistant', content: x.a }]);

        setTurns(prev => [...prev, {
            id, kind: 'ask', q,
            ctxLabel: ctxAt ? contextLabel(ctxAt, lang) : undefined,
            a: '', status: 'streaming', steps: [], sources: [], cards: [],
        }]);
        const patch = (fn: (x: Turn) => Turn) => patchTurn(id, fn);

        const body = { messages: [...history, { role: 'user', content: q }], lang, context: contextPayload(ctxAt) };
        const controller = new AbortController();
        abortRef.current = controller;
        let timedOut = false;
        const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, STREAM_TIMEOUT_MS);

        let settled = false;
        let streamError: string | null = null;
        const finish = (r: AskResult) => {
            settled = true;
            dirty.current = true;
            patch(x => ({
                ...x,
                a: r.reply || x.a,
                sources: r.sources || [],
                action: r.action || null,
                logId: r.logId ?? null,
                cards: r.cards || [],
                status: 'done',
                waitSeconds: undefined,
                steps: x.steps.map(s => (s.done ? s : { ...s, done: true })),
            }));
        };

        try {
            await aiStream(body, (ev: StreamEvent) => {
                switch (ev.type) {
                    case 'token':
                        patch(x => ({ ...x, a: x.a + ev.text, waitSeconds: undefined }));
                        break;
                    case 'tool_start':
                        // Foydalanuvchi AI haqiqatan bazaga qarayotganini ko'radi —
                        // kutish tushunarli bo'ladi va javobga ishonch oshadi.
                        patch(x => ({ ...x, steps: [...x.steps, { name: ev.name, done: false, ok: true }] }));
                        break;
                    case 'tool_done':
                        patch(x => {
                            const i = x.steps.findIndex(s => s.name === ev.name && !s.done);
                            if (i < 0) return x;
                            const steps = [...x.steps];
                            steps[i] = { ...steps[i], done: true, ok: ev.ok };
                            return { ...x, steps };
                        });
                        break;
                    case 'discard':
                        // Model tool chaqirishdan oldin yozgan bo'lak endi yaroqsiz.
                        patch(x => ({ ...x, a: '' }));
                        break;
                    case 'wait':
                        patch(x => ({ ...x, waitSeconds: ev.seconds }));
                        break;
                    case 'done':
                        finish(ev);
                        break;
                    case 'error':
                        streamError = ev.message;
                        break;
                }
            }, controller.signal);

            if (streamError) throw new Error(streamError);
            // Oqim `done` siz tugadi — ulanish uzilgan. Oddiy so'rov bilan qayta olamiz.
            if (!settled) finish(await aiRequest<AskResult>('/ai/ask', body));
        } catch (e: any) {
            if (e?.name === 'AbortError' && !timedOut) {
                // Foydalanuvchi o'zi to'xtatdi: yozilgan qism qoladi.
                patch(x => (x.a
                    ? { ...x, status: 'done', steps: x.steps.map(s => ({ ...s, done: true })) }
                    : { ...x, status: 'error', error: ru ? 'Остановлено.' : "To'xtatildi." }));
            } else {
                patch(x => ({ ...x, status: 'error', error: timedOut ? t('ai.timeout') : (e?.message || 'Xatolik') }));
            }
        } finally {
            window.clearTimeout(timer);
            abortRef.current = null;
        }
    }, [lang, ru, t, patchTurn]);

    const askRef = useRef(ask);
    askRef.current = ask;

    const runReport = useCallback(async (type: string) => {
        if (turnsRef.current.some(x => x.status === 'streaming')) return;
        setView('chat');
        stick.current = true;
        const id = uid();
        const title = reports.find(r => r.type === type)?.title || type;
        setTurns(prev => [...prev, {
            id, kind: 'report', q: title, a: '', status: 'streaming', steps: [], sources: [], cards: [],
        }]);
        try {
            const d = await aiRequest<{ report: Report; logId?: string | null }>('/ai/report', { type, lang });
            dirty.current = true;
            patchTurn(id, x => ({
                ...x, report: d.report, a: d.report.narrative || '', sources: d.report.sources || [],
                logId: d.logId ?? null, status: 'done',
            }));
        } catch (e: any) {
            patchTurn(id, x => ({ ...x, status: 'error', error: e?.message || 'Xatolik' }));
        }
    }, [lang, reports, patchTurn]);

    const retry = useCallback((turn: Turn) => {
        setTurns(prev => prev.filter(x => x.id !== turn.id));
        if (turn.kind === 'report') {
            const type = reports.find(r => r.title === turn.q)?.type;
            if (type) setTimeout(() => runReport(type), 0);
        } else {
            setTimeout(() => askRef.current(turn.q), 0);
        }
    }, [reports, runReport]);

    const stop = () => abortRef.current?.abort();

    const newChat = useCallback(() => {
        abortRef.current?.abort();
        setTurns([]);
        setInput('');
        setView('chat');
        conversationId.current = null;
        refreshPulse();
        window.setTimeout(() => inputRef.current?.focus(), 50);
    }, [refreshPulse]);

    // ── Harakatlar ──────────────────────────────────────────────────────────

    const confirmAction = useCallback(async (turnId: string, choiceId?: string) => {
        const turn = turnsRef.current.find(x => x.id === turnId);
        if (!turn?.action) return;
        const actionName = turn.action.name;
        setActionBusy(true);
        try {
            const d = await aiRequest<{ message?: string; action?: PendingAction }>(
                '/ai/act',
                { id: turn.action.id, ...(choiceId ? { choiceId } : {}) }
            );
            // Bemor (yoki xizmat) tanlandi — server harakatni qayta tayyorlab,
            // endi oddiy tasdiqlash kartasini qaytardi. Model qatnashmaydi.
            if (d.action) {
                patchTurn(turnId, x => ({ ...x, action: d.action! }));
                return;
            }
            patchTurn(turnId, x => ({ ...x, actionResult: { ok: true, message: d.message || '' } }));
            onDataChanged?.(actionName);
            refreshPulse(true);
        } catch (e: any) {
            patchTurn(turnId, x => ({ ...x, actionResult: { ok: false, message: e?.message || 'Xatolik' } }));
        } finally {
            setActionBusy(false);
        }
    }, [patchTurn, onDataChanged, refreshPulse]);

    const cancelAction = useCallback((turnId: string) => {
        patchTurn(turnId, x => ({
            ...x,
            actionResult: { ok: false, cancelled: true, message: ru ? 'Отменено — ничего не изменилось.' : "Bekor qilindi — hech narsa o'zgarmadi." },
        }));
    }, [patchTurn, ru]);

    const rate = useCallback((turnId: string, rating: number, note?: string) => {
        const turn = turnsRef.current.find(x => x.id === turnId);
        patchTurn(turnId, x => ({ ...x, rating }));
        if (!turn?.logId) return;
        aiRequest('/ai/feedback', { logId: turn.logId, rating, note }).catch(() => { /* baho — qulaylik */ });
    }, [patchTurn]);

    // ── Suhbatlar tarixi ────────────────────────────────────────────────────

    const openConversation = useCallback(async (id: string) => {
        abortRef.current?.abort();
        setView('chat');
        try {
            const d = await aiRequest<{ conversation: { id: string; messages: { q: string; a: string; sources?: string[] }[] } }>(
                `/ai/conversations/${id}`
            );
            conversationId.current = d.conversation.id;
            stick.current = true;
            setTurns(d.conversation.messages.map(m => ({
                id: uid(), kind: 'ask', q: m.q, a: m.a, status: 'done', steps: [],
                sources: m.sources || [], cards: [], restored: true,
            })));
        } catch (e: any) {
            setTurns([{
                id: uid(), kind: 'ask', q: '…', a: '', status: 'error', steps: [], sources: [], cards: [],
                error: e?.message || 'Xatolik',
            }]);
        }
    }, []);

    const deleteConversation = useCallback(async (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (conversationId.current === id) conversationId.current = null;
        try {
            await aiRequest(`/ai/conversations/${id}`, undefined, 'DELETE');
        } catch {
            loadConversations();
        }
    }, [loadConversations]);

    // ── Kartochkalardan ─────────────────────────────────────────────────────

    const openPatient = useCallback((id: string) => {
        navigate(`/patients/${id}`);
        // Keng ekranda panel joyida qoladi — karta uning yonida ochiladi.
        if (!isDesktop) onOpenChange(false);
    }, [navigate, isDesktop, onOpenChange]);

    const pickSlot = useCallback((doctorName: string, date: string, time: string) => {
        const c = ctxRef.current;
        if (c?.kind === 'patient') {
            askRef.current(ru
                ? `Запиши этого пациента к врачу ${doctorName} на ${date} в ${time}.`
                : `Joriy bemorni ${date} kuni soat ${time} ga ${doctorName}ga qabulga yoz.`);
            return;
        }
        // Bemor noma'lum — gapni tayyorlab, ismni foydalanuvchi o'zi yozadi.
        setInput(ru
            ? `Запиши к врачу ${doctorName} на ${date} в ${time} пациента: `
            : `${date} kuni soat ${time} ga ${doctorName}ga qabulga yoz, bemor: `);
        window.setTimeout(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }, 30);
    }, [ru]);

    const runSuggestion = useCallback((s: Suggestion) => {
        if (s.report) runReport(s.report);
        else if (s.ask) askRef.current(s.ask);
    }, [runReport]);

    const runCommand = useCallback((c: SlashCommand) => {
        setInput('');
        if ('reset' in c.run) newChat();
        else if ('report' in c.run) runReport(c.run.report);
        else askRef.current(c.run.ask);
    }, [newChat, runReport]);

    // ── Ovoz ────────────────────────────────────────────────────────────────
    // Shifokorning qo'li qo'lqopda — F2 bosdi, gapirdi, javob keldi. Natija
    // DARHOL yuboriladi: o'zgartiradigan buyruq baribir tasdiqlash kartasiga
    // tushadi, ya'ni xato eshitilgan gap hech narsani buzmaydi.
    const voice = useVoiceInput({ lang: voiceLang, onResult: text => askRef.current(text) });
    // Hook har renderda yangi obyekt qaytaradi. Effektlar unga to'g'ridan-to'g'ri
    // bog'lansa, har renderda qayta ishlardi — F2 dan keyingi kechiktirilgan
    // yoqish esa birinchi qayta chizishdayoq bekor bo'lib, mikrofon yonmasdi.
    const voiceRef = useRef(voice);
    voiceRef.current = voice;

    const toggleVoiceLang = useCallback(() => {
        setVoiceLang(prev => {
            const next = prev === 'uz' ? 'ru' : 'uz';
            try { localStorage.setItem('dentaai_voice_lang', next); } catch { /* muhim emas */ }
            return next;
        });
    }, []);

    useEffect(() => {
        if (!open || !pendingVoice.current) return;
        pendingVoice.current = false;
        const id = window.setTimeout(() => voiceRef.current.start(), 280);   // panel animatsiyasi tugasin
        return () => window.clearTimeout(id);
    }, [open]);

    // ── Klaviatura ──────────────────────────────────────────────────────────
    //   Ctrl+/            — panelni ochish/yopish
    //   F2, Ctrl+Shift+Space — ovoz (panel yopiq bo'lsa — ochib, mikrofon bilan)
    //   Esc               — avval ovozni, keyin panelni yopadi
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.code === 'Slash' || e.key === '/')) {
                e.preventDefault();
                onOpenChange(!open);
                return;
            }
            const voiceKey = e.key === 'F2' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space');
            if (voiceKey) {
                e.preventDefault();
                if (!open) { pendingVoice.current = true; onOpenChange(true); }
                else voiceRef.current.toggle();
                return;
            }
            if (e.key === 'Escape' && open) {
                if (voiceRef.current.state === 'listening') { e.preventDefault(); voiceRef.current.stop(); return; }
                // Keng ekranda panel sahifa bilan yonma-yon: sahifadagi
                // maydonda bosilgan Esc panelni yopmasligi kerak.
                const inside = !!panelRef.current?.contains(document.activeElement);
                if (inside || !isDesktop) { e.preventDefault(); onOpenChange(false); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onOpenChange, isDesktop]);

    // ── O'lcham ─────────────────────────────────────────────────────────────

    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        const max = Math.min(760, Math.round(window.innerWidth * 0.6));
        const onMove = (ev: PointerEvent) =>
            setWidth(Math.max(MIN_W, Math.min(max, window.innerWidth - ev.clientX)));
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    // ── Hosilalar ───────────────────────────────────────────────────────────

    const suggestions = useMemo(() => suggestionsFor(activeCtx, userRole, lang), [activeCtx, userRole, lang]);
    const commands = useMemo(() => slashCommands(activeCtx, lang, reports), [activeCtx, lang, reports]);
    const orbState = voice.state === 'listening' ? 'listening' : busy ? 'thinking' : 'idle';
    const attention = !!pulse?.alerts?.length;
    const wide = width >= WIDE_W - 20;
    const ctxName = context ? contextLabel(context, lang) : '';
    const placeholder = activeCtx?.kind === 'patient'
        ? (ru ? 'Спросите об этом пациенте…' : "Shu bemor haqida so'rang…")
        : (ru ? 'Спросите или дайте поручение…' : "So'rang yoki topshiriq bering…");

    const headerBtn = 'w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/[0.06] transition-colors';

    return (
        <>
            {/* Yon tugma: panel yopiq turganda o'ng chetda. "E'tibor" nuqtasi —
                pulsda xavotirli signal bo'lsa (masalan tushum keskin tushgan). */}
            <AnimatePresence>
                {!open && isDesktop && (
                    <motion.button
                        key="dai-launcher"
                        initial={{ x: 48, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 48, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => onOpenChange(true)}
                        aria-label="DentaAI"
                        title={`DentaAI · Ctrl+/ · F2 — ${ru ? 'голосом' : 'ovoz bilan'}`}
                        // translate-y klassi ishlatilmaydi: animatsiya transform'ni o'zi yozadi.
                        style={{ top: 'calc(50% - 44px)' }}
                        className="group fixed right-0 z-[44] flex flex-col items-center gap-2 pl-2 pr-1.5 py-3
                                   rounded-l-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur
                                   ring-1 ring-gray-200 dark:ring-white/10
                                   shadow-[-8px_10px_28px_-14px_rgba(37,99,235,.55)]
                                   hover:pr-2.5 transition-[padding] duration-200"
                    >
                        <span className="relative">
                            <AiOrb size={26} />
                            {attention && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-gray-800" />
                            )}
                        </span>
                        <span className="text-[9.5px] font-bold tracking-[0.2em] text-gray-400 group-hover:text-indigo-500
                                         dark:text-gray-500 [writing-mode:vertical-rl] rotate-180 transition-colors">
                            DENTA AI
                        </span>
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {open && (
                    <motion.aside
                        key="dai-panel"
                        ref={panelRef}
                        role="complementary"
                        aria-label="DentaAI"
                        initial={isDesktop ? { x: 28, opacity: 0 } : { y: '100%' }}
                        animate={isDesktop ? { x: 0, opacity: 1 } : { y: 0 }}
                        exit={isDesktop ? { x: 28, opacity: 0 } : { y: '100%' }}
                        transition={isDesktop
                            ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
                            : { type: 'spring', damping: 30, stiffness: 300 }}
                        style={isDesktop ? { top: HEADER_H, width } : undefined}
                        className={`fixed flex flex-col overflow-hidden bg-white dark:bg-[#0b0f15] text-gray-900 dark:text-gray-100
                                    ${isDesktop
                                        ? `right-0 bottom-0 z-[45] border-l border-gray-200 dark:border-white/[0.08]
                                           ${canPush ? 'shadow-[-10px_0_30px_-22px_rgba(15,23,42,.4)]' : 'shadow-[-24px_0_48px_-20px_rgba(15,23,42,.45)]'}`
                                        : 'inset-0 z-[70] pb-[env(safe-area-inset-bottom)]'}`}
                    >
                        {busy && <div className="dai-edge z-10" />}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-90 dark:opacity-60"
                            style={{
                                background:
                                    'radial-gradient(120% 70% at 100% 0%, rgba(99,102,241,.13), transparent 60%),'
                                    + 'radial-gradient(90% 60% at 0% 0%, rgba(34,211,238,.12), transparent 62%)',
                            }}
                        />

                        {isDesktop && (
                            <div
                                onPointerDown={startResize}
                                onDoubleClick={() => setWidth(w => (w >= WIDE_W - 20 ? DEFAULT_W : WIDE_W))}
                                title={ru ? 'Потяните, чтобы изменить ширину' : "Kengligini o'zgartirish uchun torting"}
                                className="group absolute left-0 inset-y-0 w-2 -ml-1 z-20 cursor-col-resize"
                            >
                                <span className="absolute left-1 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-gray-300 dark:bg-white/20
                                                 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        )}

                        {/* Sarlavha */}
                        <div className="relative flex items-center gap-2.5 px-4 h-14 shrink-0">
                            <AiOrb size={30} state={orbState} />
                            <div className="min-w-0 flex-1">
                                <div className="text-[15px] font-semibold tracking-tight leading-tight">DentaAI</div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                                    <span className="relative flex w-1.5 h-1.5">
                                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                                        <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </span>
                                    <span className="truncate">
                                        {busy
                                            ? (ru ? 'Работаю с данными клиники' : "Klinika ma'lumotlari bilan ishlayapman")
                                            : (ru ? 'Живые данные клиники' : "Klinikaning jonli ma'lumotlari")}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setView(v => (v === 'history' ? 'chat' : 'history'))} title={ru ? 'Диалоги' : 'Suhbatlar'} className={headerBtn}>
                                <History className="w-4 h-4" />
                            </button>
                            <button onClick={newChat} title={ru ? 'Новый диалог' : 'Yangi suhbat'} className={headerBtn}>
                                <SquarePen className="w-4 h-4" />
                            </button>
                            {isDesktop && (
                                <button
                                    onClick={() => setWidth(wide ? DEFAULT_W : WIDE_W)}
                                    title={wide ? (ru ? 'Уже' : 'Torroq') : (ru ? 'Шире' : 'Kengroq')}
                                    className={headerBtn}
                                >
                                    {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                </button>
                            )}
                            <button onClick={() => onOpenChange(false)} title={`${ru ? 'Закрыть' : 'Yopish'} (Esc)`} className={headerBtn}>
                                <X className="w-[18px] h-[18px]" />
                            </button>
                        </div>

                        {/* Kontekst: AI hozir nimani ko'rib turibdi */}
                        {context && (
                            <div className="relative px-4 pb-2 shrink-0">
                                <button
                                    onClick={() => setUseCtx(v => !v)}
                                    title={useCtx
                                        ? (ru ? 'Отвязать: вопросы по всей клинике' : "Uzish: savollar butun klinika bo'yicha")
                                        : (ru ? 'Привязать к открытой странице' : "Ochiq sahifaga bog'lash")}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12px] text-left transition-colors ring-1 ${useCtx
                                        ? 'bg-indigo-50/80 text-indigo-800 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-400/20'
                                        : 'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-white/[0.08]'}`}
                                >
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate flex-1">
                                        {useCtx
                                            ? <>{context.kind === 'patient' ? (ru ? 'Пациент: ' : 'Bemor: ') : (ru ? 'Страница: ' : 'Sahifa: ')}<b className="font-semibold">{ctxName}</b></>
                                            : (ru ? 'Без привязки — вся клиника' : "Bog'lanmagan — butun klinika")}
                                    </span>
                                    <span className="text-[10.5px] opacity-70 shrink-0">
                                        {useCtx ? (ru ? 'отвязать' : 'uzish') : (ru ? 'привязать' : "bog'lash")}
                                    </span>
                                </button>
                            </div>
                        )}

                        {/* Mazmun */}
                        <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto dai-scroll">
                            {view === 'history' ? (
                                <div className="px-3 py-3">
                                    <button
                                        onClick={() => setView('chat')}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 mb-2 rounded-lg text-[12.5px]
                                                   text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        {ru ? 'Назад' : 'Orqaga'}
                                    </button>
                                    {conversations.length ? (
                                        <div className="space-y-0.5">
                                            {conversations.map(c => (
                                                <div key={c.id} className="group flex items-center gap-1">
                                                    <button
                                                        onClick={() => openConversation(c.id)}
                                                        className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                                                    >
                                                        <span className="block text-[13px] text-gray-800 dark:text-gray-100 truncate">{c.title}</span>
                                                        <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                                                            {new Date(c.updatedAt).toLocaleString(ru ? 'ru-RU' : 'uz-UZ', {
                                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                                            })}
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={() => deleteConversation(c.id)}
                                                        aria-label={ru ? 'Удалить' : "O'chirish"}
                                                        className="p-2 rounded-lg text-gray-300 hover:text-rose-500 dark:text-gray-600
                                                                   lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-12 text-center text-[13px] text-gray-400 dark:text-gray-500">
                                            <MessageSquareDashed className="w-6 h-6 mx-auto mb-2 opacity-60" />
                                            {ru ? 'Сохранённых диалогов нет' : "Saqlangan suhbat yo'q"}
                                        </div>
                                    )}
                                </div>
                            ) : turns.length === 0 ? (
                                <AiPulse
                                    lang={lang}
                                    greeting={greeting(lang, userName)}
                                    dateLabel={formatHeaderDate(lang)}
                                    pulse={pulse}
                                    pulseLoading={pulseLoading}
                                    suggestions={suggestions}
                                    contextKind={activeCtx?.kind}
                                    reports={reports}
                                    conversations={conversations}
                                    onAsk={q => askRef.current(q)}
                                    onReport={runReport}
                                    onOpenPatient={openPatient}
                                    onOpenConversation={openConversation}
                                    onShowHistory={() => setView('history')}
                                />
                            ) : (
                                <div className="px-4 py-4 space-y-6">
                                    {turns.map(turn => (
                                        <AiMessage
                                            key={turn.id}
                                            turn={turn}
                                            lang={lang}
                                            elapsed={turn.status === 'streaming' ? elapsed : 0}
                                            actionBusy={actionBusy}
                                            followUps={turn.status === 'done' && !turn.action && !turn.restored
                                                ? followUpsFor(turn.sources, userRole, lang, turn.q)
                                                : []}
                                            onConfirm={choiceId => confirmAction(turn.id, choiceId)}
                                            onCancelAction={() => cancelAction(turn.id)}
                                            onRate={(r, note) => rate(turn.id, r, note)}
                                            onFollowUp={runSuggestion}
                                            onRetry={() => retry(turn)}
                                            onOpenPatient={openPatient}
                                            onPickSlot={pickSlot}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Yozish maydoni */}
                        <div className="relative shrink-0 px-3 pt-2 pb-3 border-t border-gray-100 dark:border-white/[0.06]
                                        bg-white/80 dark:bg-[#0b0f15]/80 backdrop-blur">
                            <AiComposer
                                value={input}
                                onChange={setInput}
                                onSubmit={() => askRef.current(input)}
                                onStop={stop}
                                busy={busy}
                                lang={lang}
                                placeholder={placeholder}
                                voice={voice}
                                voiceLang={voiceLang}
                                onToggleVoiceLang={toggleVoiceLang}
                                commands={commands}
                                onCommand={runCommand}
                                inputRef={inputRef}
                                showHints={isDesktop}
                            />
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
};

export default AiDock;
