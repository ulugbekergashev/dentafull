import React, { useEffect, useState } from "react";
import { BrainCircuit, Send, AlertCircle, Check, Loader2, Zap } from "lucide-react";
import { API_URL } from "../../services/api";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal, BrowserFrame } from "./ui";

type Topic = "treatment_plan" | "sms_generator" | "staff_optimization";
const TOPICS: Topic[] = ["treatment_plan", "sms_generator", "staff_optimization"];

/**
 * Ochiq DentaAI demosi.
 *
 * Backend: POST /api/ai/dental-advisor — autentifikatsiyasiz, IP bo'yicha
 * soatiga 5 ta so'rov bilan cheklangan (backend/server.ts). Shu sababli
 * bo'lim birinchi ochilganda "namuna javob" ko'rsatiladi: foydalanuvchi
 * bo'sh quti emas, natijaning ko'rinishini ko'radi.
 */
export default function AiAssistantWidget() {
  const { c } = useLandingCopy();
  const [topic, setTopic] = useState<Topic>("treatment_plan");
  const [input, setInput] = useState(c.ai.samples.treatment_plan);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  // Mavzu yoki til o'zgarganda taklif matni ham yangilanadi
  useEffect(() => {
    setInput(c.ai.samples[topic]);
  }, [topic, c.ai.samples]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (text.length < 10) {
      setError(c.ai.errors.tooShort);
      return;
    }

    setLoading(true);
    setAnswer("");
    setError("");

    try {
      // Nisbiy manzil ishlamaydi: frontend Vercel'da, backend Railway'da.
      const res = await fetch(`${API_URL}/ai/dental-advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, inputData: text }),
      });

      if (res.status === 429) throw new Error(c.ai.errors.rateLimit);
      if (res.status === 503) throw new Error(c.ai.errors.notConfigured);
      if (res.status === 400) throw new Error(c.ai.errors.tooShort);
      if (!res.ok) throw new Error(c.ai.errors.generic);

      const data = await res.json();
      if (!data?.success || !data.response) throw new Error(c.ai.errors.generic);
      setAnswer(data.response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Tarmoq uzilgani `fetch` ning o'zidan keladi — bizning matnlarimizdan emas
      const known = Object.values(c.ai.errors).includes(msg);
      setError(known ? msg : c.ai.errors.network);
    } finally {
      setLoading(false);
    }
  };

  const showSample = !answer && !loading && !error;

  return (
    <Section id="ai" bg="white" border>
      <SectionHeader badge={c.ai.badge} title={c.ai.title} subtitle={c.ai.sub} className="mb-14" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Chap: tizim ichidagi ko'rinish */}
        <Reveal className="lg:col-span-5 space-y-6">
          <BrowserFrame image="dentaai" alt={c.ai.alt} urlBar="app.dentacrm.uz / dentaai" />
          <ul className="space-y-3">
            {c.ai.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-primary-600" />
                </span>
                <span className="text-sm text-slate-700 leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* O'ng: ochiq demo */}
        <Reveal delay={0.1} className="lg:col-span-7">
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-7 space-y-5">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-primary-600" />
                {c.ai.pickTopic}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TOPICS.map((t) => {
                  const on = topic === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      aria-pressed={on}
                      className={`min-h-[44px] p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          on
                            ? "border-primary-500 bg-primary-50 text-primary-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                    >
                      <Zap className={`w-3.5 h-3.5 mb-1.5 ${on ? "text-primary-600" : "text-slate-400"}`} />
                      <span className="block leading-snug">{c.ai.topics[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={ask} className="space-y-3">
              <label htmlFor="lp-ai-input" className="block text-xs font-bold text-slate-700">
                {c.ai.prompts[topic]}
              </label>
              <textarea
                id="lp-ai-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                placeholder={c.ai.placeholder}
                className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-[13px] text-slate-800 leading-relaxed resize-none
                           focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60
                           disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2
                           cursor-pointer active:scale-[0.98] shadow-md shadow-primary-500/20
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {c.ai.loading}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {c.ai.submit}
                  </>
                )}
              </button>
            </form>

            {/* Javob maydoni */}
            <div
              className="bg-white border border-slate-200 rounded-2xl p-4 min-h-[190px] flex flex-col"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400 tracking-wider mb-2">
                <span>{showSample ? c.ai.sampleTitle : c.ai.answerTitle}</span>
                {loading && <span className="text-primary-600">{c.ai.generating}</span>}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {loading && (
                <div className="space-y-2 animate-pulse" aria-hidden="true">
                  {[80, 95, 70, 88, 60].map((w, i) => (
                    <div key={i} className="h-2.5 rounded bg-slate-100" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}

              {showSample && (
                <p className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-wrap">{c.ai.sampleAnswer}</p>
              )}

              {answer && (
                <>
                  <div className="flex-1 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto pr-1">
                    {answer}
                  </div>
                  <p className="pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-400">{c.ai.ready}</p>
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">{c.ai.note}</p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
