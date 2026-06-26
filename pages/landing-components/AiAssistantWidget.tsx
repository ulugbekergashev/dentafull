import React, { useState, useEffect } from "react";
import { Sparkles, BrainCircuit, ArrowRight, CheckCircle, Send, AlertCircle, Bot, Zap } from "lucide-react";

export default function AiAssistantWidget() {
  const [topic, setTopic] = useState<"treatment_plan" | "sms_generator" | "staff_optimization">("treatment_plan");
  const [inputData, setInputData] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<boolean>(true);

  // Pre-populated suggestions based on topics to help user test quickly
  const suggestions = {
    treatment_plan: "35-tishda chuqur karies bor, sovuq va issiqqa og'riydi. Rentgende ildiz uchi yallig'lanmagan.",
    sms_generator: "Bemor Sevara Aliyeva 3 oydan beri tish tozalash qabuliga kelmadi. Uni bepul profilaktik ko'rikka taklif qilish.",
    staff_optimization: "Klinikamizda 3 ta shifokor ishlaydi, lekin qabul vaqtlari chalkashib ketmoqda, bemorlar kutish zalida 30 daqiqadan ko'p qolyapti."
  };

  // Set default suggestion on topic change
  useEffect(() => {
    setInputData(suggestions[topic]);
  }, [topic]);

  useEffect(() => { setApiKeyStatus(true); }, []);

  const handleAiCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputData.trim()) return;

    setLoading(true);
    setResponse("");
    setError("");

    try {
      const res = await fetch("/api/gemini/dental-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, inputData })
      });

      const data = await res.json();
      if (data.success) {
        setResponse(data.response);
      } else {
        throw new Error(data.message || "AI so'rovida noma'lum xatolik yuz berdi.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Server bilan aloqa o'rnatib bo'lmadi. Iltimos, keyinroq qayta urining.");
      
      // Fallback elegant mock response if API Key is not configured yet (prevents user getting stuck)
      if (!apiKeyStatus) {
        setResponse(`[DentaAI Maslahatchisi (Simulyatsiya mode)]
1. Tashxis: Ko'rsatilgan ma'lumotlarga ko'ra, tishda pulpit yoki chuqur karies rivojlanishi mumkin.
2. Tavsiya etilgan reja:
   - Anesteziya ostida kariesli kavakni tozalash.
   - Ildiz kanallarini mexanik va dori vositalari bilan qayta ishlash.
   - Muvaqqat plomba va keyinchalik doimiy fotopolimer plomba qo'yish.
3. Davomiylik: 1-2 seans (har biri 45 daqiqa).
4. Profilaktika: Kuniga 2 marta tish yuvish, tish ipidan muntazam foydalanish.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="ai-advisor" className="py-24 bg-slate-50 relative overflow-hidden border-b border-slate-200">
      {/* Decorative blurred rings */}
      <div className="absolute top-1/4 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 left-10 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -z-10"></div>
 
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="px-3.5 py-1.5 rounded-full bg-blue-100 border border-blue-200 text-xs font-bold text-blue-800 tracking-wider inline-flex items-center gap-1.5 uppercase">
            <Bot className="w-4 h-4 animate-bounce text-blue-600" />
            DentaAI • Sun'iy Intellekt Maslahatchisi
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Klinikangiz Uchun Aqlli AI Assistent
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            DentaCRM tarkibiga o'rnatilgan sun'iy intellekt shifokorlarga davolash rejalari tuzishda va ma'murlarga SMS shablonlari yaratishda yordam beradi. Quyida uni bevosita sinab ko'ring.
          </p>
        </div>
 
        {/* AI Playground Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-4xl mx-auto shadow-sm grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
          
          {/* Controls column (Col span 5) */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-blue-600" />
                Maslahat yo'nalishini tanlang
              </h3>
 
              {/* Topic Toggles */}
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => setTopic("treatment_plan")}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    topic === "treatment_plan"
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <span>1. Davolash Rejasi tuzish</span>
                  <Zap className="w-3.5 h-3.5" />
                </button>
 
                <button
                  onClick={() => setTopic("sms_generator")}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    topic === "sms_generator"
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <span>2. Marketing va SMS yozish</span>
                  <Zap className="w-3.5 h-3.5" />
                </button>
 
                <button
                  onClick={() => setTopic("staff_optimization")}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    topic === "staff_optimization"
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <span>3. Klinikani optimallashtirish</span>
                  <Zap className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
 
            {/* Quick stats on AI */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-left text-[11px] text-slate-500 leading-normal">
              <p className="font-bold text-slate-700 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Gemini 3.5-Flash bilan integratsiya
              </p>
              <p>DentaCRM foydalanuvchilari ushbu AI yordamchini qo'shimcha to'lovlarsiz o'z shaxsiy kabinetlarida cheksiz ishlata oladilar.</p>
            </div>
 
          </div>
 
          {/* Prompt & Output column (Col span 7) */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-4 text-left">
            <form onSubmit={handleAiCall} className="space-y-3">
              <label className="block text-xs font-bold text-slate-750">
                {topic === "treatment_plan" && "Tish muammosi yoki bemor shikoyatini tasvirlang:"}
                {topic === "sms_generator" && "SMS maqsadini yoki aksiyani yozing:"}
                {topic === "staff_optimization" && "Klinikadagi qiyinchilik yoki holatni yozing:"}
              </label>
              
              <div className="relative">
                <textarea
                  value={inputData}
                  onChange={(e) => setInputData(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-755 focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed resize-none text-slate-800"
                  placeholder="Bu yerga tafsilotlarni yozing..."
                />
              </div>
 
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></span>
                    <span>DentaAI tahlil qilmoqda...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>DentaAI Tahlilini Sinash (O'zbekcha)</span>
                  </>
                )}
              </button>
            </form>
 
            {/* AI Result Area */}
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 min-h-[160px] flex flex-col justify-between overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>DentaAI JAVOBI</span>
                  {loading && <span className="text-blue-600 animate-pulse">Generatsiya qilinmoqda...</span>}
                </div>
                
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                    <p>{error}</p>
                  </div>
                )}
 
                {!response && !loading && !error && (
                  <p className="text-xs text-slate-400 italic py-6 text-center">
                    Yuqoridagi tugmani bosing va bir necha soniyada sun'iy intellekt taqdim etadigan tahlilni ko'ring.
                  </p>
                )}
 
                {response && (
                  <div className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap max-h-[180px] overflow-y-auto pr-1">
                    {response}
                  </div>
                )}
              </div>
 
              {response && (
                <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400">
                  <span>✓ Javob tahrirlash uchun tayyor</span>
                  <span>Tezlik: ~1.2 soniya</span>
                </div>
              )}
            </div>
          </div>
 
        </div>
 
      </div>
    </section>
  );
}
