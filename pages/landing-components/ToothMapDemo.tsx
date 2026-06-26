import React, { useState } from "react";
import { Sparkles, Heart } from "lucide-react";

/* ── Types ───────────────────────────────────────────────────── */
type Condition = "healthy" | "cavity" | "filled" | "pulpitis" | "missing" | "crown" | "implant";

interface Tooth {
  number: number;
  conditions: Condition[];
}

/* ── Exact SVG from real TeethChart.tsx ──────────────────────── */
const SVGDefs = () => (
  <defs>
    <filter id="lp-glossy3D" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
      <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lightingColor="#ffffff" result="specOut">
        <fePointLight x="-50" y="-100" z="200" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint" />
      <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
    </filter>
    <filter id="lp-goldMaterial">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
      <feSpecularLighting in="blur" surfaceScale="3" specularConstant="1" specularExponent="35" lightingColor="#ffecb3" result="specOut">
        <fePointLight x="-50" y="-100" z="200" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    <linearGradient id="lp-rootGradient" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stopColor="#f3f4f6" />
      <stop offset="100%" stopColor="#d1d5db" />
    </linearGradient>
    <radialGradient id="lp-crownGradient" cx="0.4" cy="0.4" r="0.6">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="100%" stopColor="#e5e7eb" />
    </radialGradient>
    <linearGradient id="lp-goldGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#fcd34d" />
      <stop offset="50%" stopColor="#d97706" />
      <stop offset="100%" stopColor="#f59e0b" />
    </linearGradient>
    <radialGradient id="lp-cavityGradient" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stopColor="#450a0a" />
      <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.0" />
    </radialGradient>
  </defs>
);

const RealisticTooth: React.FC<{
  number: number;
  conditions: Condition[];
  isUpper: boolean;
  isSelected: boolean;
  onClick: () => void;
}> = ({ number, conditions, isUpper, isSelected, onClick }) => {
  const has = (c: Condition) => conditions.includes(c);
  const isHealthy = conditions.length === 0;
  const transform = isUpper ? "rotate(180 50 60)" : "";

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center cursor-pointer group transition-all duration-200 ${isUpper ? 'flex-col-reverse' : 'flex-col'}`}
    >
      <span className={`text-[9px] sm:text-[10px] font-bold font-mono mb-0.5 ${!isHealthy ? 'text-blue-600' : 'text-gray-400'} ${isSelected ? 'text-blue-700' : ''}`}>
        {number}
      </span>
      <div className={`w-6 h-10 sm:w-9 sm:h-14 relative filter drop-shadow-sm transition-all duration-200 ${isSelected ? 'drop-shadow-md scale-110' : 'hover:scale-105'}`}>
        {isSelected && (
          <div className="absolute -inset-1 rounded-xl border-2 border-blue-500 bg-blue-50/30 z-0" />
        )}
        <svg viewBox="0 0 100 120" className="w-full h-full overflow-visible relative z-10">
          <SVGDefs />
          <g transform={transform}>
            {has("missing") ? (
              <path
                d="M20,40 Q15,60 15,80 Q15,110 30,115 Q45,120 50,100 Q55,120 70,115 Q85,110 85,80 Q85,60 80,40 Q70,10 50,10 Q30,10 20,40 Z"
                fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4,4"
              />
            ) : (
              <>
                <path
                  d="M20,50 Q20,80 25,105 Q27,115 35,110 Q43,105 48,90 L52,90 Q57,105 65,110 Q73,115 75,105 Q80,80 80,50"
                  fill="url(#lp-rootGradient)"
                />
                <path
                  d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                  fill={has("crown") ? "url(#lp-goldGradient)" : "url(#lp-crownGradient)"}
                  filter={has("crown") ? "url(#lp-goldMaterial)" : "url(#lp-glossy3D)"}
                  stroke={has("crown") ? "none" : "#d1d5db"}
                  strokeWidth="0.5"
                />
                {!has("crown") && (
                  <path
                    d="M35,25 Q50,35 65,25 M50,25 L50,45 M40,35 Q50,50 60,35"
                    fill="none" stroke="#9ca3af" strokeWidth="1" strokeLinecap="round" opacity="0.4"
                  />
                )}
                {has("cavity") && (
                  <g filter="url(#lp-glossy3D)">
                    <ellipse cx="45" cy="40" rx="10" ry="8" fill="#3f0808" opacity="0.9" />
                    <ellipse cx="45" cy="40" rx="6" ry="5" fill="#000" opacity="0.4" />
                  </g>
                )}
                {has("filled") && (
                  <path
                    d="M35,25 Q50,40 65,25 L60,40 Q50,55 40,40 Z"
                    fill="#6b7280" stroke="#374151" strokeWidth="0.5" filter="url(#lp-glossy3D)"
                  />
                )}
                {has("pulpitis") && (
                  <circle cx="50" cy="50" r="15" fill="#ef4444" opacity="0.6" filter="url(#lp-glossy3D)" />
                )}
                {has("implant") && (
                  <g filter="url(#lp-glossy3D)">
                    <rect x="42" y="55" width="16" height="50" rx="2" fill="#9ca3af" />
                    <line x1="42" y1="65" x2="58" y2="65" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="75" x2="58" y2="75" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="85" x2="58" y2="85" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="95" x2="58" y2="95" stroke="#4b5563" strokeWidth="1" />
                  </g>
                )}
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
};

/* ── Config ──────────────────────────────────────────────────── */
const UPPER_NUMS = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER_NUMS = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

const INITIAL: Record<number, Condition[]> = {
  17: ["cavity"],
  15: ["pulpitis"],
  14: ["filled"],
  24: ["missing"],
  25: ["implant"],
  27: ["cavity"],
  46: ["crown"],
  44: ["filled"],
  35: ["cavity"],
};

const CONDITIONS: { id: Condition; label: string; color: string; desc: string; price: number }[] = [
  { id: "healthy",  label: "Sog'lom",         color: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Profilaktik ko'rik",              price: 50000 },
  { id: "cavity",   label: "Karies",           color: "bg-amber-50 text-amber-700 border-amber-200",      desc: "Karies davolash",                price: 250000 },
  { id: "pulpitis", label: "Kanal (Pulpit)",   color: "bg-red-50 text-red-700 border-red-200",            desc: "Kanal tozalash va asab olish",   price: 400000 },
  { id: "filled",   label: "Plomba",           color: "bg-teal-50 text-teal-700 border-teal-200",         desc: "Gelioplastik plomba",            price: 300000 },
  { id: "crown",    label: "Toj (Crown)",      color: "bg-yellow-50 text-yellow-700 border-yellow-200",   desc: "Metall-keramika toj",            price: 850000 },
  { id: "missing",  label: "Yo'q tish",        color: "bg-rose-50 text-rose-700 border-rose-200",         desc: "Protezlash zarur",               price: 0 },
  { id: "implant",  label: "Implant",          color: "bg-blue-50 text-blue-700 border-blue-200",         desc: "Dental implant (Osstem)",        price: 3500000 },
];

/* ── Main Component ──────────────────────────────────────────── */
export default function ToothMapDemo() {
  const [teeth, setTeeth] = useState<Record<number, Condition[]>>(INITIAL);
  const [selected, setSelected] = useState<number | null>(17);

  const activeConds = selected !== null ? (teeth[selected] ?? []) : [];
  const activeLabel = activeConds.length > 0 ? CONDITIONS.find(c => activeConds.includes(c.id))?.label ?? "Sog'lom" : "Sog'lom";

  const setCondition = (c: Condition) => {
    if (selected === null) return;
    setTeeth(prev => ({ ...prev, [selected]: c === "healthy" ? [] : [c] }));
  };

  const treatmentTeeth = (Object.entries(teeth) as [string, Condition[]][])
    .filter(([,conds]) => conds.length > 0 && !conds.includes("healthy"))
    .map(([num, conds]) => {
      const info = CONDITIONS.find(c => conds.includes(c.id));
      return { num: parseInt(num), info };
    });

  const total = treatmentTeeth.reduce((acc, t) => acc + (t.info?.price ?? 0), 0);

  return (
    <section id="tooth-map" className="py-20 bg-white relative overflow-hidden border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
          <span className="px-3 py-1.5 rounded-full bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700 uppercase tracking-widest">
            Elektron Tish Xaritasi
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Interaktiv 2D Tish Formulari
          </h2>
          <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
            Quyidagi tishlardan birini bosib, holatini o'zgartiring — xuddi haqiqiy DentaCRM interfeysi kabi.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-5xl mx-auto">

          {/* Teeth visualizer */}
          <div className="lg:col-span-8 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5 sm:p-6 text-center">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center justify-center gap-2">
              <Heart className="w-3.5 h-3.5 text-blue-600" />
              Tish Formula Kartasi
            </h3>

            {/* Upper jaw */}
            <div className="flex justify-center items-end gap-1 sm:gap-1.5 pb-2 border-b border-gray-100 mb-1">
              {UPPER_NUMS.map(n => (
                <RealisticTooth
                  key={n} number={n}
                  conditions={teeth[n] ?? []}
                  isUpper={true}
                  isSelected={selected === n}
                  onClick={() => setSelected(n)}
                />
              ))}
            </div>
            <div className="text-[8px] text-gray-400 font-medium text-center mb-1 font-mono">JAR CHEGARASI</div>
            {/* Lower jaw */}
            <div className="flex justify-center items-start gap-1 sm:gap-1.5 pt-1">
              {LOWER_NUMS.map(n => (
                <RealisticTooth
                  key={n} number={n}
                  conditions={teeth[n] ?? []}
                  isUpper={false}
                  isSelected={selected === n}
                  onClick={() => setSelected(n)}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-5 pt-4 border-t border-gray-50">
              {CONDITIONS.filter(c=>c.id !== 'healthy').map(c => (
                <span key={c.id} className={`px-2 py-0.5 rounded-full text-[8px] font-bold border ${c.color}`}>
                  {c.label}
                </span>
              ))}
            </div>

            {/* Active tooth control */}
            {selected !== null && (
              <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-xs font-bold text-blue-800 font-mono">Tish #{selected}</span>
                  <span className="text-[11px] text-gray-500">Holat:</span>
                  <span className="text-[11px] font-bold text-gray-800">{activeLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CONDITIONS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCondition(c.id)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                        (activeConds.includes(c.id) || (activeConds.length === 0 && c.id === 'healthy'))
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Treatment plan */}
          <div className="lg:col-span-4 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Davolash Rejasi</p>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                {treatmentTeeth.length} ta tish
              </span>
            </div>

            <div className="space-y-2 flex-1 overflow-auto max-h-64">
              {treatmentTeeth.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <Sparkles className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-xs text-gray-400">Barcha tishlar sog'lom. Tishlarni bosib holatni o'zgartiring.</p>
                </div>
              ) : (
                treatmentTeeth.map(({ num, info }) => (
                  <div
                    key={num}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${selected === num ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'}`}
                    onClick={() => setSelected(num)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-700 font-mono">Tish #{num}</span>
                      {info && info.price > 0 && (
                        <span className="text-[9px] font-bold text-green-700">
                          {(info.price / 1000).toFixed(0)}K so'm
                        </span>
                      )}
                    </div>
                    {info && <p className="text-[9px] text-gray-500 mt-0.5">{info.desc}</p>}
                  </div>
                ))
              )}
            </div>

            {total > 0 && (
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Jami smeta</span>
                  <span className="text-base font-black text-gray-900">{total.toLocaleString()} so'm</span>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">✓ PDF formatida bemorga yuborish imkoni mavjud</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
