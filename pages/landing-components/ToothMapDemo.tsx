import React, { useState } from "react";
import { Sparkles, Heart } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal } from "./ui";

/* ── Turlar ──────────────────────────────────────────────────── */
type Condition = "healthy" | "cavity" | "filled" | "pulpitis" | "missing" | "crown" | "implant";

/**
 * Filtr va gradientlar TeethChart dan olingan. Ular butun bo'lim uchun
 * BIR MARTA chiziladi: ilgari har bir tish o'z nusxasini chizardi va
 * hujjatda bir xil ID li 32 ta ta'rif paydo bo'lardi.
 */
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
      className={`flex-1 min-w-0 max-w-[48px] flex flex-col items-center cursor-pointer group transition-all duration-200 ${
        isUpper ? 'flex-col-reverse' : 'flex-col'
      }`}
    >
      <span className={`text-[9px] sm:text-[11px] font-bold font-mono my-2 ${!isHealthy ? 'text-primary-600' : 'text-gray-400'} ${isSelected ? 'text-primary-700' : ''}`}>
        {number}
      </span>
      {/* O'lcham qat'iy berilmaydi: 16 ta tish qat'iy kenglikda kartaga
            sig'may, chetlariga chiqib ketardi. Endi ular mavjud joyga
            bo'linadi, nisbat esa viewBox bilan bir xil (100x120). */}
      <div
        className={`w-full aspect-[5/6] relative filter drop-shadow-md transition-all duration-200 ${
          isSelected ? 'drop-shadow-lg scale-110' : 'hover:scale-105'
        }`}
      >
        {isSelected && (
          <div className="absolute -inset-1.5 rounded-2xl border-2 border-primary-400 bg-primary-50/60 z-0" />
        )}
        <svg viewBox="0 0 100 120" className="w-full h-full overflow-visible relative z-10">
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
                {/* Tojning o'zi doim oq emal bilan chiziladi. Oltin — ustiga
                    qo'yiladigan alohida qatlam (TeethChart dagi kabi). Ilgari
                    tish butunlay oltin rangga bo'yalib, konturi ham olib
                    tashlangan edi va u shaklsiz dog'ga o'xshab qolgandi. */}
                <path
                  d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                  fill="url(#lp-crownGradient)"
                  filter={has("crown") ? "url(#lp-goldMaterial)" : "url(#lp-glossy3D)"}
                  stroke={has("crown") ? "none" : "#d1d5db"}
                  strokeWidth="0.5"
                />
                {has("crown") && (
                  <path
                    d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                    fill="url(#lp-goldGradient)"
                    opacity="0.9"
                    style={{ mixBlendMode: "multiply" }}
                  />
                )}
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

/** Matnlar `content.ts` da; bu yerda faqat rang va taxminiy narx. */
const CONDITIONS: { id: Condition; color: string; price: number }[] = [
  { id: "healthy",  color: "bg-emerald-50 text-emerald-700 border-emerald-200", price: 50000 },
  { id: "cavity",   color: "bg-amber-50 text-amber-700 border-amber-200",       price: 250000 },
  { id: "pulpitis", color: "bg-red-50 text-red-700 border-red-200",             price: 400000 },
  { id: "filled",   color: "bg-teal-50 text-teal-700 border-teal-200",          price: 300000 },
  { id: "crown",    color: "bg-yellow-50 text-yellow-700 border-yellow-200",    price: 850000 },
  { id: "missing",  color: "bg-rose-50 text-rose-700 border-rose-200",          price: 0 },
  { id: "implant",  color: "bg-primary-50 text-primary-700 border-primary-200", price: 3500000 },
];

/* ── Main Component ──────────────────────────────────────────── */
export default function ToothMapDemo() {
  const { c, fmt } = useLandingCopy();
  const [teeth, setTeeth] = useState<Record<number, Condition[]>>(INITIAL);
  const [selected, setSelected] = useState<number | null>(17);

  const t = c.toothMap;
  const condText = (id: Condition) => t.conditions[id];

  const activeConds = selected !== null ? teeth[selected] ?? [] : [];
  const activeId: Condition = activeConds[0] ?? "healthy";

  const setCondition = (id: Condition) => {
    if (selected === null) return;
    setTeeth((prev) => ({ ...prev, [selected]: id === "healthy" ? [] : [id] }));
  };

  const plan = (Object.entries(teeth) as [string, Condition[]][])
    .filter(([, conds]) => conds.length > 0 && !conds.includes("healthy"))
    .map(([num, conds]) => {
      const id = conds[0];
      return { num: parseInt(num, 10), id, price: CONDITIONS.find((x) => x.id === id)?.price ?? 0 };
    });

  const total = plan.reduce((acc, x) => acc + x.price, 0);

  return (
    <Section id="tooth-map" bg="white" border>
      <SectionHeader badge={t.badge} title={t.title} subtitle={t.sub} className="mb-12" />

      {/* Filtrlar bir marta — barcha tishlar shularga murojaat qiladi */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <SVGDefs />
      </svg>

      <Reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tish formulasi */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 text-center">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center justify-center gap-2">
            <Heart className="w-3.5 h-3.5 text-primary-600" />
            {t.cardTitle}
          </h3>

          {/* Tor ekranda qatorni siljitib ko'rish mumkin — tishlarni
              o'qib bo'lmas darajada kichraytirgandan ko'ra shu afzal. */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 sm:px-4">
            <div className="overflow-x-auto no-scrollbar -mx-1 px-1 py-3">
              <div className="min-w-[520px]">
          <div className="flex items-end gap-1 sm:gap-1.5 pb-2 border-b border-slate-200">
            {UPPER_NUMS.map((n) => (
              <RealisticTooth
                key={n}
                number={n}
                conditions={teeth[n] ?? []}
                isUpper
                isSelected={selected === n}
                onClick={() => setSelected(n)}
              />
            ))}
          </div>

          {/* Yozuv gorizontal siljiydigan qatorning ichida: tor ekranda u
                  ko'rinmay qolmasligi uchun chap chekkaga yopishtiriladi. */}
              <div className="my-1 text-left sm:text-center">
                <span className="sticky left-0 inline-block text-[9px] text-slate-400 font-semibold tracking-widest">
                  {t.jawBorder}
                </span>
              </div>

          <div className="flex items-start gap-1 sm:gap-1.5 pt-1">
            {LOWER_NUMS.map((n) => (
              <RealisticTooth
                key={n}
                number={n}
                conditions={teeth[n] ?? []}
                isUpper={false}
                isSelected={selected === n}
                onClick={() => setSelected(n)}
              />
            ))}
          </div>
              </div>
            </div>
          </div>

          {/* Belgilar ro'yxati */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-5 pt-4 border-t border-slate-100">
            {CONDITIONS.filter((x) => x.id !== "healthy").map((x) => (
              <span key={x.id} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${x.color}`}>
                {condText(x.id).label}
              </span>
            ))}
          </div>

          {/* Tanlangan tish */}
          {selected !== null && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded-lg bg-primary-50 border border-primary-100 text-xs font-bold text-primary-800">
                  {t.toothNo} #{selected}
                </span>
                <span className="text-[11px] text-slate-500">{t.stateLabel}</span>
                <span className="text-[11px] font-bold text-slate-800">{condText(activeId).label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setCondition(x.id)}
                    aria-pressed={activeId === x.id}
                    className={`px-3 py-2 min-h-[36px] rounded-xl text-[11px] font-bold border transition-all cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                        activeId === x.id
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                  >
                    {condText(x.id).label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Davolash rejasi */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t.planTitle}</h3>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full border border-primary-100 whitespace-nowrap">
              {t.planCount(plan.length)}
            </span>
          </div>

          {/* Ro'yxat uzun bo'lsa pastda yumshoq so'nish qoldiramiz — aks holda
              oxirgi qator keskin kesilib, davomi borligi bilinmay qolardi. */}
          <div className="relative flex-1 min-h-0">
            {plan.length > 5 && (
              <div
                className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white to-transparent z-10"
                aria-hidden="true"
              />
            )}
            <div className="space-y-2 overflow-auto max-h-80 pr-1">
            {plan.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-400 leading-relaxed">{t.planEmpty}</p>
              </div>
            ) : (
              plan.map((item) => (
                <button
                  key={item.num}
                  onClick={() => setSelected(item.num)}
                  className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    selected === item.num
                      ? "border-primary-300 bg-primary-50/60"
                      : "border-slate-100 hover:border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700">
                      {t.toothNo} #{item.num}
                    </span>
                    {item.price > 0 && (
                      <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                        {fmt(item.price)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{condText(item.id).desc}</p>
                </button>
              ))
            )}
            </div>
          </div>

          {total > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t.total}</span>
                <span className="text-base font-extrabold text-slate-900 whitespace-nowrap">{fmt(total)}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{t.totalNote}</p>
            </div>
          )}
        </div>
      </Reveal>
    </Section>
  );
}
