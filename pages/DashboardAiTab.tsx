import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Sparkles, RefreshCw, MessageSquare,
  Lightbulb, AlertCircle, Loader2, ChevronRight, Zap
} from 'lucide-react';
import { API_URL, isDemoMode } from '../services/api';
import { UserRole } from '../types';

// ─── Tiplар ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

interface InsightStats {
  todayAppointments?: number;
  monthAppointments?: number;
  monthRevenue?: number;
  newLeads?: number;
  debtorsCount?: number;
  pendingRevenue?: number;
  totalPatients?: number;
  avgCheck?: number;
  unpaidCompleted?: number;
}

interface DashboardAiTabProps {
  userRole: UserRole;
  stats: InsightStats;
}

// ─── Demo javoblar ───────────────────────────────────────────────────────────

const DEMO_CHAT_RESPONSES: Record<string, string> = {
  default:
    'Klinikangizda bugun 8 ta qabul rejalashtirilgan, ulardan 3 tasi tasdiqlangan. Yangi bemorlar soni o\'tgan haftaga nisbatan 12% oshdi. Biror narsa haqida batafsil bilib olmoqchimisiz?',
  qabul:
    'Bugun jami 8 ta qabul bor. Ulardan: 3 ta — Tasdiqlangan, 2 ta — Kutilmoqda, 3 ta — Bajarilgan. Eng band vaqt — soat 10:00 dan 13:00 gacha.',
  tushum:
    'Joriy oy davomida klinika tushumlari: Naqd — 4 500 000 so\'m, Karta — 2 800 000 so\'m, Click/Payme — 1 200 000 so\'m. Jami: 8 500 000 so\'m. O\'tgan oyga nisbatan +18%.',
  bemor:
    'Faol bemorlar soni: 142 ta. Ushbu oyda yangi bemorlar: 14 ta. Eng ko\'p murojaat qilgan bemor: Karimov M. (4 marta). Arxivlashtirilganlar: 23 ta.',
  qarz:
    'Hozirda 7 ta qarzdor bemor mavjud. Umumiy qarz summasi: 1 850 000 so\'m. Eng katta qarz: Yusupova S. — 420 000 so\'m (oxirgi tashrif: 3 kun oldin).',
};

const DEMO_INSIGHTS = [
  '📈 Bemorlar soni oshmoqda: O\'tgan oyga nisbatan +12% o\'sish qayd etildi. Marketing faoliyatini davom ettiring va mavjud bemorlarni qayta jalb qilish uchun SMS yuborishni rejalashtiring.',
  '💰 Qarzdorlarni faollashtiring: 7 ta bemor jami 1 850 000 so\'m qarz. Ularga bugun Telegram/SMS orqali eslatma yuborish orqali kassa balansini yaxshilash mumkin.',
  '⏰ Bugungi to\'lanmagan qabullar: 3 ta yakunlangan qabul uchun to\'lov hali qabul qilinmagan. Reception xodimiga eslatma bering va qabullar sahifasidan to\'lovni yopish imkoniyatidan foydalaning.',
  '🦷 Eng mashhur xizmat: Karies davolash (23%) va Tozalash (18%) eng ko\'p so\'ralayotgan xizmatlar. Ushbu xizmatlarga paket taklif qilishni ko\'rib chiqing.',
  '📅 Hafta boshidagi bo\'shliqlar: Dushanba va seshanba kunlari qabul jadvalida bo\'shliqlar ko\'p. Profilaktik tekshiruv uchun chegirmali takliflar o\'tkazish orqali band qilish mumkin.',
];

// ─── Helper: API so'rov ──────────────────────────────────────────────────────

function getAuthToken(): string | null {
  try {
    const raw =
      sessionStorage.getItem('dentalflow_auth') ||
      localStorage.getItem('dentalflow_auth');
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch {
    return null;
  }
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data as T;
}

// ─── Asosiy komponent ────────────────────────────────────────────────────────

export const DashboardAiTab: React.FC<DashboardAiTabProps> = ({ userRole, stats }) => {
  const isAdmin =
    userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.SUPER_ADMIN;

  // Chat holati
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Salom! Men DentaCRM AI yordamchisiman. Klinikangiz haqida savol bering — qabullar, tushum, qarzdorlar, ombor va lidlar haqida ma\'lumot bera olaman.',
    },
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Insights holati
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Insights — sahifa ochilganda avtomatik yuklash (faqat admin)
  const loadInsights = useCallback(async () => {
    if (!isAdmin) return;
    setInsightsLoading(true);
    setInsightsError('');
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1200));
        setInsights(DEMO_INSIGHTS);
      } else {
        const data = await apiPost<{ insights: string[] }>('/ai/insights', { stats });
        setInsights(data.insights || []);
      }
      setInsightsLoaded(true);
    } catch (e: any) {
      setInsightsError(e.message || 'Tahlil xatoligi');
    } finally {
      setInsightsLoading(false);
    }
  }, [isAdmin, stats]);

  useEffect(() => {
    loadInsights();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat yuborish
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const loadingMsg: ChatMessage = { role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);

    try {
      let reply = '';

      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 600));
        const lower = text.toLowerCase();
        if (lower.includes('qabul')) reply = DEMO_CHAT_RESPONSES.qabul;
        else if (lower.includes('tushum') || lower.includes('daromad') || lower.includes('pul')) reply = DEMO_CHAT_RESPONSES.tushum;
        else if (lower.includes('bemor')) reply = DEMO_CHAT_RESPONSES.bemor;
        else if (lower.includes('qarz') || lower.includes('qarzdor')) reply = DEMO_CHAT_RESPONSES.qarz;
        else reply = DEMO_CHAT_RESPONSES.default;
      } else {
        // Suhbat tarixi (loading msg ni olib tashlab)
        const history = messages
          .filter(m => !m.loading)
          .concat(userMsg)
          .map(m => ({ role: m.role, content: m.content }));

        const endpoint = isAdmin ? '/ai/ask' : '/ai/chat';
        const data = await apiPost<{ reply: string }>(endpoint, { messages: history });
        reply = data.reply;
      }

      setMessages(prev => [
        ...prev.filter(m => !m.loading),
        { role: 'assistant', content: reply },
      ]);
    } catch (e: any) {
      setMessages(prev => [
        ...prev.filter(m => !m.loading),
        {
          role: 'assistant',
          content: `Xatolik: ${e.message || 'AI bilan aloqa yo\'q. Iltimos, qayta urining.'}`,
        },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Tezkor savol tugmalari
  const quickQuestions = isAdmin
    ? [
        'Bugun nechta qabul bor?',
        'Oy davomida tushum qancha?',
        'Qarzdorlar ro\'yxati',
        'Yangi lidlar soni',
      ]
    : [
        'Bugungi qabullarim',
        'Karies davolash jarayoni',
        'SMS eslatma qanday sozlanadi?',
      ];

  // ─── UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in">

      {/* CHAT PANELI (7 ustun) */}
      <div className="xl:col-span-7 flex flex-col bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden" style={{ minHeight: 520 }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">AI Suhbat</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {isAdmin ? 'Klinika ma\'lumotlariga asoslangan javoblar' : 'Umumiy yordam'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Jonli</span>
          </div>
        </div>

        {/* Xabarlar */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 360 }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm shadow-md'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-sm'
                }`}
              >
                {msg.loading ? (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[10px] font-black">S</span>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Tezkor savollar */}
        <div className="px-5 py-2 flex items-center gap-2 overflow-x-auto border-t border-gray-50 dark:border-gray-800">
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 border border-gray-100 dark:border-gray-700 hover:border-violet-200 dark:hover:border-violet-800 rounded-full transition-all whitespace-nowrap"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Kiritish maydoni */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus-within:border-violet-400 dark:focus-within:border-violet-600 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Savol bering... (Enter — yuborish, Shift+Enter — yangi qator)"
              rows={1}
              style={{ resize: 'none' }}
              className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none leading-relaxed"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || chatLoading}
              className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 dark:disabled:from-gray-700 dark:disabled:to-gray-700 flex items-center justify-center transition-all active:scale-95 shadow-sm"
            >
              {chatLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-white" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5 pl-1">
            {isDemoMode() ? 'Demo rejim — real ma\'lumotlar ko\'rsatilmaydi' : 'Ma\'lumotlar shifrlangan va maxfiy'}
          </p>
        </div>
      </div>

      {/* INSIGHTS PANELI (5 ustun) */}
      <div className="xl:col-span-5 flex flex-col bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Aqlli Tavsiyalar</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Statistikangiz asosidagi AI tahlili
            </p>
          </div>
          <button
            onClick={loadInsights}
            disabled={insightsLoading}
            title="Qayta yuklash"
            className="ml-auto w-7 h-7 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 flex items-center justify-center transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${insightsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Insights content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!isAdmin ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                <Zap className="w-6 h-6 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Tavsiyalar faqat klinika ma'muri uchun mavjud
              </p>
            </div>
          ) : insightsLoading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded-full w-full" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded-full w-5/6" />
                </div>
              ))}
              <p className="text-center text-xs text-gray-400 dark:text-gray-500 animate-pulse pt-1">
                AI tahlil qilmoqda...
              </p>
            </div>
          ) : insightsError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-xs text-red-500 dark:text-red-400">{insightsError}</p>
              <button
                onClick={loadInsights}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Qayta urinish
              </button>
            </div>
          ) : insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <Sparkles className="w-10 h-10 text-gray-200 dark:text-gray-700" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Tavsiyalar hali yuklanmagan
              </p>
              <button
                onClick={loadInsights}
                className="text-xs font-bold px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all"
              >
                Tahlil qilish
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight, i) => {
                const colonIdx = insight.indexOf(':');
                const header = colonIdx > -1 ? insight.slice(0, colonIdx).trim() : insight;
                const body = colonIdx > -1 ? insight.slice(colonIdx + 1).trim() : '';
                return (
                  <div
                    key={i}
                    className="group p-4 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-amber-200 dark:hover:border-amber-800 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all cursor-default"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-black px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-gray-900 dark:text-white leading-snug">{header}</p>
                        {body && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{body}</p>
                        )}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-amber-400 transition-colors flex-shrink-0 mt-0.5 ml-auto" />
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-center text-gray-300 dark:text-gray-600 pt-1">
                AI tavsiyalari — {new Date().toLocaleDateString('uz-UZ')}
              </p>
            </div>
          )}
        </div>

        {/* Stats mini panel */}
        {isAdmin && (
          <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-800 grid grid-cols-3 gap-2">
            {[
              { label: 'Bemorlar', value: stats.totalPatients ?? '—' },
              { label: 'Tushum', value: stats.monthRevenue ? `${(stats.monthRevenue / 1_000_000).toFixed(1)}M` : '—' },
              { label: 'Lidlar', value: stats.newLeads ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="text-center py-1.5 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-xs font-black text-gray-900 dark:text-white tabular-nums">{value}</p>
                <p className="text-[9px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardAiTab;
