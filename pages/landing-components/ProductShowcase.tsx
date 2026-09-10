import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal, BrowserFrame, PhoneFrame } from "./ui";

/**
 * Mahsulotning haqiqiy ekranlari. Rasmlar `public/landing/` da va
 * `scripts/landing-shots.mjs` orqali demo rejimdagi ilovadan olinadi.
 */
export default function ProductShowcase() {
  const { c } = useLandingCopy();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const tab = c.showcase.tabs[active];

  return (
    <Section id="showcase" bg="slate" border>
      <SectionHeader badge={c.showcase.badge} title={c.showcase.title} subtitle={c.showcase.sub} className="mb-10" />

      {/* Bo'limlar ro'yxati — mobilda gorizontal siljiydi */}
      <Reveal className="mb-8" y={14}>
        <div
          role="tablist"
          aria-label={c.showcase.badge}
          className="flex gap-2 overflow-x-auto no-scrollbar pb-1 lg:justify-center"
        >
          {c.showcase.tabs.map((t, i) => {
            const on = i === active;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`shrink-0 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                    on
                      ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900"
                  }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        {/* Skrinshot */}
        <div className="lg:col-span-8 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab.id}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <BrowserFrame image={tab.image} alt={tab.alt} urlBar={`app.dentacrm.uz / ${tab.id}`} />
            </motion.div>
          </AnimatePresence>

        </div>

        {/* Tavsif */}
        <div className="lg:col-span-4">
          <AnimatePresence mode="wait">
            <motion.ul
              key={tab.id}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              {tab.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary-600" />
                  </span>
                  <span className="text-sm sm:text-[15px] text-slate-700 leading-relaxed">{b}</span>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>

          {/* Telefon ko'rinishi — skrinshot ustiga qo'yilmaydi, chunki u
              jadval ustunlarini yopib qo'yardi. Alohida karta sifatida
              turgani uchun bo'sh joy qolmaydi va nima demoqchi ekani aniq. */}
          {active === 0 && (
            <div className="hidden lg:flex items-center gap-4 mt-8 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-28 shrink-0">
                <PhoneFrame image="dashboard-mobile" alt={c.showcase.phoneAlt} />
              </div>
              <div className="space-y-1.5 min-w-0">
                <p className="text-sm font-bold text-slate-900">{c.showcase.phoneTitle}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{c.showcase.phoneNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
