import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, ArrowUp, X, Loader2, AlertTriangle, Database,
  CalendarCheck, TrendingUp, Wallet, Users, Package, Sparkles, RotateCcw,
} from 'lucide-react';
import { API_URL } from '../services/api';
import { UserRole } from '../types';

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
}

interface ReportOption {
  type: string;
  title: string;
  hint: string;
}

type Result =
  | { kind: 'report'; report: Report }
  | { kind: 'answer'; question: string; text: string; sources: string[] }
  | { kind: 'error'; message: string };

// ─── API ─────────────────────────────────────────────────────────────────────

function authToken(): string | null {
  try {
    const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
    return raw ? JSON.parse(raw)?.token ?? null : null;
  } catch {
    return null;
  }
}

async function api<T>(path: string, body?: object): Promise<T> {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || `Xatolik (${res.status})`);
  return data as T;
}

// ─── Ko'rinish yordamchilari ─────────────────────────────────────────────────

const ICONS: Record<string, React.ElementType> = {
  today: CalendarCheck,
  performance: TrendingUp,
  finance: Wallet,
  debtors: Users,
  inventory: Package,
  leads: Sparkles,
};

const TONE: Record<string, string> = {
  neutral: 'text-slate-100',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
};

/** Uzun raqamni ajratib ko'rsatadi; matn bo'lsa tegmaydi. */
const fmtValue = (v: number | string): string =>
  typeof v === 'number' ? v.toLocaleString('ru-RU') : v;

// Tool nomlarini foydalanuvchi tiliga o'giradi — "get_revenue" hech kimga
// hech narsa demaydi, "moliya" esa javob qayerdan kelganini tushuntiradi.
const SOURCE_LABEL: Record<string, string> = {
  get_appointments: 'qabullar',
  get_revenue: 'moliya',
  get_debtors: 'qarzdorlar',
  get_doctor_stats: 'shifokorlar',
  find_patient: 'bemorlar',
  get_low_stock: 'ombor',
  get_leads: 'lidlar',
};

// ─── Kichik komponentlar ─────────────────────────────────────────────────────

const MetricCard: React.FC<{ m: Metric; i: number }> = ({ m, i }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-5 py-4"
  >
    <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500 mb-2">{m.label}</div>
    <div className={`text-[26px] leading-none font-semibold tabular-nums ${TONE[m.tone || 'neutral']}`}>
      {fmtValue(m.value)}
      {m.unit && <span className="text-[13px] font-normal text-slate-500 ml-1.5">{m.unit}</span>}
    </div>
    {m.hint && <div className="text-[12px] text-slate-500 mt-2">{m.hint}</div>}
  </motion.div>
);

const DataTable: React.FC<{ t: ReportTable }> = ({ t }) => (
  <div className="rounded-2xl ring-1 ring-white/[0.06] overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[480px]">
        <thead>
          <tr className="bg-white/[0.03]">
            {t.columns.map(c => (
              <th key={c} className="text-left font-medium text-slate-500 px-4 py-2.5 whitespace-nowrap
                                     text-[11px] uppercase tracking-[0.1em]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={i} className="border-t border-white/[0.04]">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 whitespace-nowrap ${
                  j === 0 ? 'text-slate-200' : 'text-slate-400 tabular-nums'
                }`}>
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

const SourcePills: React.FC<{ sources: string[] }> = ({ sources }) => {
  const uniq: string[] = sources.filter((s, i) => s && sources.indexOf(s) === i);
  if (!uniq.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Database className="w-3.5 h-3.5 text-slate-600" />
      <span className="text-[11px] text-slate-600">Manba:</span>
      {uniq.map(s => (
        <span key={s} className="text-[11px] text-slate-400 bg-white/[0.04] ring-1 ring-white/[0.06]
                                 rounded-full px-2.5 py-0.5">
          {SOURCE_LABEL[s] || s}
        </span>
      ))}
    </div>
  );
};

// ─── Asosiy komponent ────────────────────────────────────────────────────────

interface Props {
  userRole: UserRole;
  onExit: () => void;
}

export const DentaAiMode: React.FC<Props> = ({ userRole, onExit }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasResult = result !== null || busy;

  // Rolga mos hisobotlar ro'yxatini serverdan olamiz — tugmalarni frontendda
  // qattiq yozib qo'ysak, ruxsati yo'q rol ham ularni ko'rib, 403 olardi.
  useEffect(() => {
    api<{ reports: ReportOption[] }>('/ai/reports')
      .then(d => setReports(d.reports || []))
      .catch(() => setReports([]));
    inputRef.current?.focus();
  }, []);

  // Esc — rejimdan chiqish (natija bo'lsa avval uni tozalaydi).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (result) { setResult(null); setQuery(''); }
      else onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, onExit]);

  const runReport = useCallback(async (type: string, title: string) => {
    setBusy(true);
    setBusyLabel(title);
    setResult(null);
    try {
      const d = await api<{ report: Report }>('/ai/report', { type });
      setResult({ kind: 'report', report: d.report });
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, []);

  const ask = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setBusyLabel('Ma\'lumot izlanmoqda');
    setResult(null);
    try {
      const d = await api<{ reply: string; sources?: string[] }>('/ai/ask', {
        messages: [{ role: 'user', content: q }],
      });
      setResult({ kind: 'answer', question: q, text: d.reply, sources: d.sources || [] });
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, [query, busy]);

  const reset = () => { setResult(null); setQuery(''); inputRef.current?.focus(); };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0C10] text-slate-100 overflow-y-auto">
      {/* Fon: bitta yumshoq nur. Yagona bezak — qolgani jim. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] opacity-60"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(124,107,245,0.16), transparent 70%)' }}
      />

      {/* Yuqori panel */}
      <div className="relative flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/15 ring-1 ring-violet-400/25 grid place-items-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-300" />
          </div>
          <span className="text-[15px] font-medium tracking-tight">DentaAI</span>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-slate-200
                         px-3 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Yangi so'rov
            </button>
          )}
          <button
            onClick={onExit}
            aria-label="Yopish"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-100
                       hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-6 pb-24">
        {/* Kirish maydoni. layout — markazdan yuqoriga silliq siljish. */}
        <motion.div
          layout
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={hasResult ? 'pt-2' : 'pt-[16vh]'}
        >
          <AnimatePresence>
            {!hasResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-center mb-8"
              >
                <h1 className="text-[30px] sm:text-[38px] font-semibold tracking-tight leading-tight">
                  Klinikangiz haqida so'rang
                </h1>
                <p className="text-slate-500 mt-2.5 text-[15px]">
                  Javob real ma'lumotlaringizdan olinadi — taxmin emas.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none">
              <Search className="w-[18px] h-[18px] text-slate-600 group-focus-within:text-violet-400 transition-colors" />
            </div>
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
              }}
              rows={1}
              placeholder="Masalan: bugun nechta qabul bor?"
              className="w-full bg-white/[0.04] ring-1 ring-white/[0.08] focus:ring-violet-500/50
                         rounded-2xl pl-14 pr-14 py-4 text-[16px] placeholder:text-slate-600
                         outline-none resize-none transition-shadow focus:bg-white/[0.06]
                         focus:shadow-[0_0_0_4px_rgba(124,107,245,0.08)]"
            />
            <button
              onClick={ask}
              disabled={!query.trim() || busy}
              aria-label="Yuborish"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center
                         rounded-xl bg-violet-500 text-white disabled:bg-white/[0.06]
                         disabled:text-slate-600 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>

        {/* Tayyor hisobotlar — faqat bosh ekranda */}
        <AnimatePresence>
          {!hasResult && reports.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-10"
            >
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600 mb-3 px-1">
                Bir bosishda
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {reports.map((r, i) => {
                  const Icon = ICONS[r.type] || Sparkles;
                  return (
                    <motion.button
                      key={r.type}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + i * 0.04 }}
                      whileHover={{ y: -2 }}
                      onClick={() => runReport(r.type, r.title)}
                      className="text-left rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]
                                 hover:ring-violet-400/30 hover:bg-white/[0.05] px-4 py-3.5
                                 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <Icon className="w-4 h-4 text-slate-500 group-hover:text-violet-300 transition-colors" />
                        <span className="text-[14px] font-medium">{r.title}</span>
                      </div>
                      <div className="text-[12px] text-slate-500 leading-snug">{r.hint}</div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Yuklanmoqda */}
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-8"
            >
              <div className="flex items-center gap-2.5 text-[13px] text-slate-500 mb-5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                {busyLabel}…
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] px-5 py-4">
                    <div className="h-2 w-14 bg-white/[0.06] rounded mb-3.5 animate-pulse" />
                    <div className="h-6 w-20 bg-white/[0.06] rounded animate-pulse" />
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
              key={result.kind}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 space-y-6"
            >
              {result.kind === 'error' && (
                <div className="rounded-2xl ring-1 ring-rose-500/25 bg-rose-500/[0.06] px-5 py-4
                                flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[14px] text-rose-200 font-medium mb-0.5">Javob olinmadi</div>
                    <div className="text-[13px] text-rose-200/70">{result.message}</div>
                  </div>
                </div>
              )}

              {result.kind === 'report' && (
                <>
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <h2 className="text-[22px] font-semibold tracking-tight">{result.report.title}</h2>
                    <span className="text-[12px] text-slate-500 tabular-nums">{result.report.period}</span>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {result.report.metrics.map((m, i) => <MetricCard key={m.label} m={m} i={i} />)}
                  </div>

                  {result.report.narrative && (
                    <p className="text-[15px] leading-relaxed text-slate-300 max-w-2xl whitespace-pre-wrap">
                      {result.report.narrative}
                    </p>
                  )}

                  {result.report.table && <DataTable t={result.report.table} />}
                  <SourcePills sources={result.report.sources} />
                </>
              )}

              {result.kind === 'answer' && (
                <>
                  <div className="text-[13px] text-slate-500">{result.question}</div>
                  <p className="text-[16px] leading-relaxed text-slate-200 whitespace-pre-wrap max-w-2xl">
                    {result.text}
                  </p>
                  <SourcePills sources={result.sources} />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DentaAiMode;
