import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, ArrowUp, Loader2, AlertTriangle, Database, Inbox,
  CalendarCheck, TrendingUp, Wallet, Users, Package, Sparkles, RotateCcw,
  ThumbsUp, ThumbsDown, Check, X, History, Send, Trash2,
} from 'lucide-react';
import { API_URL } from '../services/api';
import { UserRole } from '../types';
import { useLanguage } from '../context/LanguageContext';

// ─── DentaAI ─────────────────────────────────────────────────────────────────
// Bu modal EMAS. Sahifa ichida, ilova navigatsiyasi joyida turgan holda
// ochiladi — foydalanuvchi qayerdaligini yo'qotmaydi. Ilgari `fixed inset-0`
// overlay edi va ilovaning yuqori paneli ostida kesilib qolardi.
//
// Chetlar ataylab bo'sh: karta ichida karta yo'q, bo'limlar faqat bo'sh joy
// bilan ajratiladi. Yagona ko'zga tashlanadigan element — qidiruv maydoni.

// ─── Tiplar ──────────────────────────────────────────────────────────────────

interface Metric {
  label: string;
  value: number | string;
  unit?: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
}

interface Report {
  type: string;
  title: string;
  period: string;
  metrics: Metric[];
  table?: ReportTable;
  narrative: string;
  sources: string[];
  empty?: boolean;
  emptyText?: string;
}

interface ReportOption {
  type: string;
  title: string;
  hint: string;
}

type Result =
  | { kind: 'report'; report: Report; logId?: string | null }
  | { kind: 'error'; message: string };

/** Tasdiqlash kutayotgan harakat (backend: ai/actions.ts). */
interface ActionPreview {
  title: string;
  summary: string;
  items: { label: string; detail?: string }[];
  warning?: string;
  message?: string;
  confirmLabel: string;
}

interface PendingAction {
  id: string;
  name: string;
  preview: ActionPreview;
}

/** Suhbatning bitta almashinuvi. */
interface Turn {
  q: string;
  a: string;
  sources: string[];
  logId?: string | null;
  /** 1 = 👍, -1 = 👎, undefined = baholanmagan. */
  rating?: number;
  action?: PendingAction | null;
  /** Harakat bajarilgandan keyingi natija. */
  actionResult?: { ok: boolean; message: string } | null;
}

interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

function authToken(): string | null {
  try {
    const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
    return raw ? JSON.parse(raw)?.token ?? null : null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = authToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T>(path: string, body?: object, method?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || `Xatolik (${res.status})`);
  return data as T;
}

/** Serverdan keladigan oqim hodisalari (backend: aiService.ts, AiEvent). */
type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done'; name: string; ok: boolean }
  | { type: 'round'; n: number }
  | { type: 'discard' }
  | { type: 'wait'; seconds: number }
  | { type: 'done'; reply: string; sources: string[]; action: PendingAction | null; logId: string | null }
  | { type: 'error'; message: string };

/**
 * Savolni oqim rejimida yuboradi.
 *
 * EventSource ishlatilmaydi: u sarlavha qo'sha olmaydi, ya'ni tokenni URL ga
 * yozishga to'g'ri kelardi — u esa server loglariga va brauzer tarixiga
 * tushadi. Shuning uchun oddiy fetch + ReadableStream.
 *
 * Oqim ishlamasa (eski brauzer, oraliqdagi proksi buferlashi) — chaqiruvchi
 * oddiy /ai/ask ga qaytadi, ya'ni funksionallik yo'qolmaydi.
 */
async function streamAsk(
  body: object,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal
): Promise<boolean> {
  const res = await fetch(`${API_URL}/ai/ask/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    throw new Error(data.message || `Xatolik (${res.status})`);
  }
  if (!res.body?.getReader) return false;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: xabarlar bo'sh qator bilan ajratiladi.
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const line = chunk.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        // Buzilgan bo'lak — oqimni to'xtatmaymiz.
      }
    }
  }
  return true;
}

// ─── Ko'rinish ───────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ElementType> = {
  today: CalendarCheck,
  performance: TrendingUp,
  finance: Wallet,
  debtors: Users,
  inventory: Package,
  leads: Sparkles,
};

// Rang ilovaning yorug'/qorong'i rejimiga moslashadi.
const TONE: Record<string, string> = {
  neutral: 'text-gray-900 dark:text-white',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
};

const CARD = 'bg-white dark:bg-gray-800/40 ring-1 ring-gray-200/80 dark:ring-white/[0.06]';

const fmtValue = (v: number | string): string =>
  typeof v === 'number' ? v.toLocaleString('ru-RU') : v;

// "get_revenue" hech kimga hech narsa demaydi — "moliya" javob qayerdan
// kelganini tushuntiradi.
const SOURCE_LABEL: Record<string, { uz: string; ru: string }> = {
  get_appointments: { uz: 'qabullar', ru: 'приёмы' },
  get_revenue: { uz: 'moliya', ru: 'финансы' },
  get_debtors: { uz: 'qarzdorlar', ru: 'должники' },
  get_doctor_stats: { uz: 'shifokorlar', ru: 'врачи' },
  find_patient: { uz: 'bemorlar', ru: 'пациенты' },
  get_low_stock: { uz: 'ombor', ru: 'склад' },
  get_leads: { uz: 'lidlar', ru: 'лиды' },
  send_reminder: { uz: 'eslatma', ru: 'напоминание' },
  book_appointment: { uz: 'qabulga yozish', ru: 'запись' },
  update_lead_status: { uz: 'lid holati', ru: 'статус лида' },
  create_expense: { uz: 'xarajat', ru: 'расход' },
};

const MetricCard: React.FC<{ m: Metric; i: number }> = ({ m, i }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    className={`rounded-2xl px-5 py-4 ${CARD}`}
  >
    <div className="text-[11px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-2">
      {m.label}
    </div>
    <div className={`text-[26px] leading-none font-semibold tabular-nums ${TONE[m.tone || 'neutral']}`}>
      {fmtValue(m.value)}
      {m.unit && (
        <span className="text-[13px] font-normal text-gray-400 dark:text-gray-500 ml-1.5">{m.unit}</span>
      )}
    </div>
    {m.hint && <div className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">{m.hint}</div>}
  </motion.div>
);

const DataTable: React.FC<{ t: ReportTable }> = ({ t }) => (
  <div className={`rounded-2xl overflow-hidden ${CARD}`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[480px]">
        <thead>
          <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
            {t.columns.map(c => (
              <th
                key={c}
                className="text-left font-medium px-4 py-2.5 whitespace-nowrap text-[11px]
                           uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.04]">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 whitespace-nowrap ${
                    j === 0
                      ? 'text-gray-800 dark:text-gray-200'
                      : 'text-gray-500 dark:text-gray-400 tabular-nums'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SourcePills: React.FC<{ sources: string[]; label: string; lang: 'uz' | 'ru' }> = ({ sources, label, lang }) => {
  const uniq: string[] = sources.filter((s, i) => s && sources.indexOf(s) === i);
  if (!uniq.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Database className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
      <span className="text-[11px] text-gray-400 dark:text-gray-500">{label}</span>
      {uniq.map(s => (
        <span
          key={s}
          className="text-[11px] rounded-full px-2.5 py-0.5 text-gray-500 dark:text-gray-400
                     bg-gray-100 dark:bg-white/[0.05]"
        >
          {SOURCE_LABEL[s]?.[lang] || s}
        </span>
      ))}
    </div>
  );
};

// ─── Tasdiqlash kartasi ──────────────────────────────────────────────────────
//
// AI ma'lumotni O'ZGARTIRADIGAN narsani taklif qilganda shu karta chiqadi.
// Model hech qachon o'zi yozmaydi — u faqat tayyorlaydi, qaror foydalanuvchida.
// Shu sababli karta nima bo'lishini TO'LIQ ko'rsatadi: kimga, qanday matn,
// nechta yozuvga ta'sir qiladi.

const ActionCard: React.FC<{
  action: PendingAction;
  result?: { ok: boolean; message: string } | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: (k: string) => string;
}> = ({ action, result, busy, onConfirm, onCancel, t }) => {
  const [expanded, setExpanded] = useState(false);
  const { preview } = action;
  const shown = expanded ? preview.items : preview.items.slice(0, 5);
  const hidden = preview.items.length - shown.length;

  if (result) {
    return (
      <div
        className={`rounded-2xl px-5 py-4 flex items-start gap-3 ring-1 ${
          result.ok
            ? 'ring-emerald-200 dark:ring-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/[0.07]'
            : 'ring-rose-200 dark:ring-rose-500/25 bg-rose-50 dark:bg-rose-500/[0.07]'
        }`}
      >
        {result.ok
          ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />}
        <div className="text-[14px] text-gray-800 dark:text-gray-200">{result.message}</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden ring-1 ring-violet-200 dark:ring-violet-400/30
                 bg-violet-50/60 dark:bg-violet-500/[0.07]"
    >
      <div className="px-5 pt-4 pb-3">
        <div className="text-[15px] font-semibold text-gray-900 dark:text-white">
          {preview.title}
        </div>
        <div className="text-[13px] text-gray-600 dark:text-gray-300 mt-0.5">
          {preview.summary}
        </div>
      </div>

      {preview.message && (
        <div className="px-5 pb-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500 mb-1.5">
            {t('ai.messageText')}
          </div>
          <div className="rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed
                          text-gray-700 dark:text-gray-300
                          bg-white/70 dark:bg-white/[0.04] whitespace-pre-wrap">
            {preview.message}
          </div>
        </div>
      )}

      {preview.items.length > 0 && (
        <div className="px-5 pb-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500 mb-1.5">
            {t('ai.willAffect')} · {preview.items.length}
          </div>
          <div className="space-y-1">
            {shown.map((it, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-gray-800 dark:text-gray-200 truncate">{it.label}</span>
                {it.detail && (
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums shrink-0 text-[12px]">
                    {it.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-[12px] text-violet-600 dark:text-violet-300 hover:underline"
            >
              + yana {hidden} ta
            </button>
          )}
        </div>
      )}

      {preview.warning && (
        <div className="px-5 pb-3">
          <div className="flex items-start gap-2 text-[12.5px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {preview.warning}
          </div>
        </div>
      )}

      <div className="px-5 py-3 flex items-center gap-2 border-t border-violet-200/60 dark:border-white/[0.06]">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium
                     bg-violet-600 text-white hover:bg-violet-700 transition-colors
                     disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {preview.confirmLabel || t('ai.confirm')}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px]
                     text-gray-600 dark:text-gray-300
                     hover:bg-white/70 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          {t('ai.cancel')}
        </button>
      </div>
    </motion.div>
  );
};

// ─── Baho ────────────────────────────────────────────────────────────────────
//
// 👎 bosilgan savol backendda belgilanadi va etalon to'plamni to'ldirish
// uchun asosiy manba bo'ladi (backend: ai/log.ts). Shuning uchun "nima xato
// edi?" degan bitta qator ham so'raladi — u sababni ko'rsatadi, ballni emas.

const Feedback: React.FC<{
  rating?: number;
  onRate: (r: number, note?: string) => void;
  t: (k: string) => string;
}> = ({ rating, onRate, t }) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  if (rating === 1) {
    return <div className="text-[12px] text-gray-400 dark:text-gray-500">{t('ai.thanks')}</div>;
  }

  if (rating === -1 && !noteOpen) {
    return <div className="text-[12px] text-gray-400 dark:text-gray-500">{t('ai.thanks')}</div>;
  }

  if (noteOpen) {
    return (
      <div className="flex items-center gap-2 max-w-md">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRate(-1, note); setNoteOpen(false); }
          }}
          autoFocus
          placeholder={t('ai.whatWrong')}
          className="flex-1 rounded-lg px-3 py-1.5 text-[13px] outline-none
                     bg-white dark:bg-gray-800/60
                     ring-1 ring-gray-200 dark:ring-white/[0.08]
                     focus:ring-violet-400 text-gray-900 dark:text-white"
        />
        <button
          onClick={() => { onRate(-1, note); setNoteOpen(false); }}
          className="p-1.5 rounded-lg text-violet-600 dark:text-violet-300
                     hover:bg-violet-50 dark:hover:bg-violet-500/15"
          aria-label={t('ai.feedbackSend')}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onRate(1)}
        aria-label={t('ai.helpful')}
        title={t('ai.helpful')}
        className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600
                   hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10
                   transition-colors"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { onRate(-1); setNoteOpen(true); }}
        aria-label={t('ai.notHelpful')}
        title={t('ai.notHelpful')}
        className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600
                   hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10
                   transition-colors"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ─── Asosiy komponent ────────────────────────────────────────────────────────

interface Props {
  userRole: UserRole;
  /** Sahifa ichida ishlagani uchun ixtiyoriy — tab bo'lsa kerak emas. */
  onExit?: () => void;
}

export const DentaAiMode: React.FC<Props> = ({ onExit }) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  // Suhbat tarixi. Modelga oldingi almashinuvlar ham yuboriladi, aks holda
  // "va o'tgan oychi?" kabi davomiy savol kontekstsiz qoladi.
  const [thread, setThread] = useState<Turn[]>([]);
  // Oqimda kelayotgan, hali tugamagan javob.
  const [draft, setDraft] = useState('');
  const [pendingQ, setPendingQ] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // Saqlangan suhbatlar.
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversationId = useRef<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasResult = result !== null || busy || thread.length > 0;

  // Ro'yxat serverdan keladi — frontendda qattiq yozilsa, ruxsati yo'q rol
  // tugmani ko'rib, bosib, 403 olardi.
  useEffect(() => {
    api<{ reports: ReportOption[] }>(`/ai/reports?lang=${language}`)
      .then(d => setReports(d.reports || []))
      .catch(() => setReports([]));
  }, [language]);

  const loadConversations = useCallback(() => {
    api<{ items: ConversationRow[] }>('/ai/conversations')
      .then(d => setConversations(d.items || []))
      .catch(() => setConversations([]));
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Yangi javob kelganda oxiriga suriladi.
  useEffect(() => {
    if (thread.length || draft) threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length, draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (result || thread.length)) reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, thread.length]);

  // Oqim yarim yo'lda qolsa (sahifa yopildi) — so'rovni bekor qilamiz.
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Suhbatni saqlaydi. Muvaffaqiyatsizlik jimgina o'tadi — bu qulaylik. */
  const persist = useCallback(async (turns: Turn[]) => {
    if (!turns.length) return;
    try {
      const d = await api<{ id: string }>('/ai/conversations', {
        id: conversationId.current,
        messages: turns.map(x => ({ q: x.q, a: x.a, sources: x.sources })),
      });
      conversationId.current = d.id;
      loadConversations();
    } catch {
      // Suhbat saqlanmasa ham javob ekranda turibdi.
    }
  }, [loadConversations]);

  const runReport = useCallback(async (type: string, title: string) => {
    setBusy(true);
    setBusyLabel(title);
    setActiveReport(type);
    setResult(null);
    setThread([]);
    setDraft('');
    try {
      const d = await api<{ report: Report; logId?: string }>('/ai/report', { type, lang: language });
      setResult({ kind: 'report', report: d.report, logId: d.logId });
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, [language]);

  const ask = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setBusyLabel(t('ai.thinking'));
    setActiveReport(null);
    setResult(null);
    setQuery('');
    setDraft('');
    setPendingQ(q);

    // Oldingi almashinuvlar + yangi savol. Server oxirgi 10 tasini oladi.
    const history = thread.flatMap(x => ([
      { role: 'user', content: x.q },
      { role: 'assistant', content: x.a },
    ]));
    const body = { messages: [...history, { role: 'user', content: q }], lang: language };

    const controller = new AbortController();
    abortRef.current = controller;

    /** Oqim va zaxira yo'lda bir xil ishlatiladigan yakunlovchi. */
    const finish = (
      reply: string,
      sources: string[],
      action: PendingAction | null,
      logId: string | null
    ) => {
      const turn: Turn = { q, a: reply, sources: sources || [], logId, action };
      setThread(prev => [...prev, turn]);
      // Saqlash state yangilagichidan TASHQARIDA: React yangilagichni
      // ikki marta chaqirishi mumkin (StrictMode), va u holda suhbat
      // ikki marta yozilardi. `thread` bu yerda so'rov boshlanishidagi
      // qiymat — bir vaqtda bitta savol ketgani uchun bu to'g'ri.
      persist([...thread, turn]);
      setDraft('');
      setPendingQ('');
    };

    try {
      let done = false;

      await streamAsk(body, ev => {
        switch (ev.type) {
          case 'token':
            setDraft(d => d + ev.text);
            break;
          case 'tool_start':
            // Foydalanuvchi AI ning haqiqatan bazaga qarayotganini ko'radi —
            // bu kutishni tushunarli qiladi va ishonchni oshiradi.
            setBusyLabel(`${t('ai.reading')}: ${SOURCE_LABEL[ev.name]?.[language] || ev.name}`);
            break;
          case 'discard':
            // Model tool chaqirishdan oldin yozgan bo'lagi endi yaroqsiz.
            setDraft('');
            break;
          case 'wait':
            // Provayder limitga urildi. Sababni aytmasak, foydalanuvchi
            // 20 soniyalik jimlikni "ilova qotdi" deb tushunadi.
            setBusyLabel(`${t('ai.rateLimited')} — ${ev.seconds}s`);
            break;
          case 'done':
            done = true;
            finish(ev.reply, ev.sources, ev.action, ev.logId);
            break;
          case 'error':
            throw new Error(ev.message);
        }
      }, controller.signal);

      // Oqim tugadi, lekin `done` kelmadi — ulanish uzilgan.
      // Zaxira yo'l: oddiy so'rov bilan javobni qayta olamiz.
      if (!done) {
        const d = await api<{ reply: string; sources?: string[]; action?: PendingAction; logId?: string }>(
          '/ai/ask', body
        );
        finish(d.reply, d.sources || [], d.action || null, d.logId || null);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setDraft('');
      setPendingQ('');
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [query, busy, language, t, thread, persist]);

  /** 👍 / 👎. Optimistik: tugma darhol javob beradi. */
  const rate = useCallback((index: number, rating: number, note?: string) => {
    setThread(prev => prev.map((x, i) => (i === index ? { ...x, rating } : x)));
    const logId = thread[index]?.logId;
    if (!logId) return;
    api('/ai/feedback', { logId, rating, note }).catch(() => {
      // Baho yetib bormasa ham foydalanuvchini bezovta qilmaymiz.
    });
  }, [thread]);

  /** Tasdiqlangan harakatni bajaradi. */
  const confirmAction = useCallback(async (index: number) => {
    const turn = thread[index];
    if (!turn?.action) return;
    setActionBusy(true);
    try {
      const d = await api<{ message: string }>('/ai/act', { id: turn.action.id });
      setThread(prev => prev.map((x, i) =>
        i === index ? { ...x, actionResult: { ok: true, message: d.message } } : x));
    } catch (e: any) {
      setThread(prev => prev.map((x, i) =>
        i === index ? { ...x, actionResult: { ok: false, message: e.message } } : x));
    } finally {
      setActionBusy(false);
    }
  }, [thread]);

  const cancelAction = useCallback((index: number) => {
    setThread(prev => prev.map((x, i) => (i === index ? { ...x, action: null } : x)));
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setHistoryOpen(false);
    setBusy(true);
    setResult(null);
    setActiveReport(null);
    try {
      const d = await api<{ conversation: { id: string; messages: { q: string; a: string; sources: string[] }[] } }>(
        `/ai/conversations/${id}`
      );
      conversationId.current = d.conversation.id;
      setThread(d.conversation.messages.map(m => ({ q: m.q, a: m.a, sources: m.sources || [] })));
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (conversationId.current === id) conversationId.current = null;
    try {
      await api(`/ai/conversations/${id}`, undefined, 'DELETE');
    } catch {
      loadConversations();
    }
  }, [loadConversations]);

  const reset = () => {
    abortRef.current?.abort();
    setResult(null);
    setActiveReport(null);
    setThread([]);
    setDraft('');
    setPendingQ('');
    setQuery('');
    conversationId.current = null;
    inputRef.current?.focus();
  };

  return (
    <div className="w-full">
      {/* Bosh holat: markazda, nafas oladigan bo'sh joy bilan.
          Natija chiqqach yuqoriga siljiydi — motion layout buni silliq qiladi. */}
      <motion.div layout transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <AnimatePresence>
          {!hasResult && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center pt-10 pb-8"
            >
              <h2 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-gray-900 dark:text-white">
                {t('ai.heroTitle')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-[15px]">
                {t('ai.heroSub')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Qidiruv — sahifadagi yagona urg'uli element */}
        <div className="max-w-2xl mx-auto relative group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none
                       text-gray-400 dark:text-gray-500 group-focus-within:text-violet-500 transition-colors"
          />
          <textarea
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
            }}
            rows={1}
            placeholder={t('ai.placeholder')}
            className="w-full rounded-2xl pl-14 pr-14 py-[18px] text-[15.5px] resize-none outline-none
                       bg-white dark:bg-gray-800/60
                       ring-1 ring-gray-200 dark:ring-white/[0.08]
                       focus:ring-2 focus:ring-violet-500/60
                       focus:shadow-[0_0_0_5px_rgba(139,92,246,0.07)]
                       placeholder:text-gray-400 dark:placeholder:text-gray-500
                       text-gray-900 dark:text-white transition-shadow shadow-sm"
          />
          <button
            onClick={ask}
            disabled={!query.trim() || busy}
            aria-label={t('ai.send')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center
                       rounded-xl bg-violet-600 text-white transition-colors
                       disabled:bg-gray-100 dark:disabled:bg-white/[0.06]
                       disabled:text-gray-300 dark:disabled:text-gray-600"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </motion.div>

      {/* Natija ochiq — hisobotlar chip qatoriga aylanadi va JOYIDA qoladi.
          Ilgari ular yo'qolardi va boshqasini ko'rish uchun qayta boshlash kerak edi. */}
      {hasResult && reports.length > 0 && (
        <div className="max-w-2xl mx-auto mt-3 flex items-center gap-2 overflow-x-auto pb-1
                        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {reports.map(r => {
            const Icon = ICONS[r.type] || Sparkles;
            const on = activeReport === r.type;
            return (
              <button
                key={r.type}
                onClick={() => runReport(r.type, r.title)}
                disabled={busy}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px]
                            font-medium transition-colors disabled:opacity-40 ${
                  on
                    ? 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-400/30'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {r.title}
              </button>
            );
          })}
          {(result || thread.length > 0) && (
            <button
              onClick={reset}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px]
                         text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('ai.restart')}
            </button>
          )}
        </div>
      )}

      {/* Bosh ekran: saqlangan suhbatlar va kengaytirilgan hisobot kartalari */}
      <AnimatePresence>
        {!hasResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.08 }}
            className="max-w-3xl mx-auto mt-10 pb-6"
          >
            {conversations.length > 0 && (
              <div className="mb-8">
                <button
                  onClick={() => setHistoryOpen(o => !o)}
                  className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]
                             text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300
                             transition-colors mb-3"
                >
                  <History className="w-3.5 h-3.5" />
                  {t('ai.history')} · {conversations.length}
                </button>
                <AnimatePresence>
                  {historyOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1 overflow-hidden"
                    >
                      {conversations.map(c => (
                        <div key={c.id} className="flex items-center gap-2 group/row">
                          <button
                            onClick={() => openConversation(c.id)}
                            className="flex-1 text-left px-3.5 py-2 rounded-xl text-[13.5px]
                                       text-gray-700 dark:text-gray-300 truncate
                                       hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                          >
                            {c.title}
                          </button>
                          <button
                            onClick={() => deleteConversation(c.id)}
                            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 opacity-0
                                       group-hover/row:opacity-100 hover:text-rose-500 transition-all"
                            aria-label="delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {reports.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 mb-3">
                  {t('ai.oneClick')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {reports.map((r, i) => {
                    const Icon = ICONS[r.type] || Sparkles;
                    return (
                      <motion.button
                        key={r.type}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.035 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => runReport(r.type, r.title)}
                        className={`text-left rounded-2xl p-4 flex items-start gap-3.5 transition-colors
                                    group hover:ring-violet-300 dark:hover:ring-violet-400/30 ${CARD}`}
                      >
                        {/* Ikona alohida maydonchada — ro'yxatni ko'z bilan tez
                            skanerlashga yordam beradi, yalang'och ikona esa
                            matnga qo'shilib ketadi. */}
                        <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center transition-colors
                                         bg-gray-100 dark:bg-white/[0.05]
                                         group-hover:bg-violet-50 dark:group-hover:bg-violet-500/15">
                          <Icon className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400
                                           group-hover:text-violet-500 dark:group-hover:text-violet-300
                                           transition-colors" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold text-gray-900 dark:text-white mb-0.5">
                            {r.title}
                          </span>
                          <span className="block text-[12.5px] text-gray-500 dark:text-gray-400 leading-snug">
                            {r.hint}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suhbat. Hisobotdan farqi: bu yerda tarix saqlanadi va modelga
          yuboriladi, shuning uchun "va o'tgan oychi?" kabi davomiy savol
          ishlaydi. Har bir almashinuv joyida qoladi — foydalanuvchi nima
          so'raganini va nima javob olganini ko'rib turadi. */}
      {(thread.length > 0 || pendingQ) && !result && (
        <div className="mt-8 space-y-7">
          {thread.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <div className="text-[15px] font-medium text-gray-900 dark:text-white">
                  {turn.q}
                </div>
              </div>
              <p className="text-[15.5px] leading-relaxed text-gray-700 dark:text-gray-300
                            whitespace-pre-wrap max-w-2xl pl-4">
                {turn.a}
              </p>

              {(turn.action || turn.actionResult) && (
                <div className="pl-4 max-w-2xl">
                  <ActionCard
                    action={turn.action || { id: '', name: '', preview: { title: '', summary: '', items: [], confirmLabel: '' } }}
                    result={turn.actionResult}
                    busy={actionBusy}
                    onConfirm={() => confirmAction(i)}
                    onCancel={() => cancelAction(i)}
                    t={t}
                  />
                </div>
              )}

              <div className="pl-4 flex items-center justify-between gap-4 flex-wrap">
                <SourcePills sources={turn.sources} label={t('ai.source')} lang={language} />
                {turn.logId && (
                  <Feedback rating={turn.rating} onRate={(r, note) => rate(i, r, note)} t={t} />
                )}
              </div>
            </motion.div>
          ))}

          {/* Oqimda kelayotgan javob. Tugagach `thread` ga ko'chadi. */}
          {pendingQ && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <div className="text-[15px] font-medium text-gray-900 dark:text-white">{pendingQ}</div>
              </div>
              {draft ? (
                <p className="text-[15.5px] leading-relaxed text-gray-700 dark:text-gray-300
                              whitespace-pre-wrap max-w-2xl pl-4">
                  {draft}
                  <span className="inline-block w-[2px] h-[1.05em] align-[-0.15em] ml-0.5
                                   bg-violet-500 animate-pulse" />
                </p>
              ) : (
                <div className="pl-4 flex items-center gap-2.5 text-[13px] text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                  {busyLabel}…
                </div>
              )}
            </motion.div>
          )}

          <div ref={threadEndRef} />
        </div>
      )}

      {/* Hisobot yuklanmoqda */}
      <AnimatePresence>
        {busy && activeReport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8">
            <div className="flex items-center gap-2.5 text-[13px] text-gray-500 dark:text-gray-400 mb-5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
              {busyLabel}…
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`rounded-2xl px-5 py-4 ${CARD}`}>
                  <div className="h-2 w-14 bg-gray-200 dark:bg-white/[0.07] rounded mb-3.5 animate-pulse" />
                  <div className="h-6 w-20 bg-gray-200 dark:bg-white/[0.07] rounded animate-pulse" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Natija */}
      <AnimatePresence mode="wait">
        {result && !busy && (
          <motion.div
            key={result.kind + (activeReport || '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 space-y-5"
          >
            {result.kind === 'error' && (
              <div className="rounded-2xl px-5 py-4 flex items-start gap-3
                              ring-1 ring-rose-200 dark:ring-rose-500/25
                              bg-rose-50 dark:bg-rose-500/[0.07]">
                <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-semibold text-rose-700 dark:text-rose-200 mb-0.5">
                    {t('ai.errorTitle')}
                  </div>
                  <div className="text-[13px] text-rose-600/80 dark:text-rose-200/70">{result.message}</div>
                </div>
              </div>
            )}

            {result.kind === 'report' && (
              <>
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <h3 className="text-[20px] font-bold tracking-tight text-gray-900 dark:text-white">
                    {result.report.title}
                  </h3>
                  <span className="text-[12px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {result.report.period}
                  </span>
                </div>

                {/* Nol devori xatodek tuyuladi — o'rniga holatni ochiq aytamiz. */}
                {result.report.empty ? (
                  <div className={`rounded-2xl px-6 py-12 text-center ${CARD}`}>
                    <div className="w-10 h-10 rounded-xl grid place-items-center mx-auto mb-3.5
                                    bg-gray-100 dark:bg-white/[0.05]">
                      <Inbox className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="text-[15px] text-gray-700 dark:text-gray-300 mb-1">{t('ai.noData')}</div>
                    <div className="text-[13px] text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                      {result.report.emptyText || t('ai.noDataFallback')}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {result.report.metrics.map((m, i) => <MetricCard key={m.label} m={m} i={i} />)}
                    </div>

                    {result.report.narrative && (
                      <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300
                                    max-w-2xl whitespace-pre-wrap">
                        {result.report.narrative}
                      </p>
                    )}

                    {result.report.table && <DataTable t={result.report.table} />}
                  </>
                )}
                <SourcePills sources={result.report.sources} label={t('ai.source')} lang={language} />
              </>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DentaAiMode;
