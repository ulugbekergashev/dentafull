import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, ArrowRight, Check, Building2, Clock, Gift, Zap, TrendingUp } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { PrimaryButton, SecondaryButton, CountUp, BrowserFrame } from "./ui";

interface HeroProps {
  onOpenDemoModal: () => void;
  scrollToSection: (id: string) => void;
}

const STAT_ICONS = [Building2, Clock, Gift];
const EASE = [0.16, 1, 0.3, 1] as const;

export default function Hero({ onOpenDemoModal, scrollToSection }: HeroProps) {
  const { c, fmt } = useLandingCopy();
  const reduce = useReducedMotion();

  /** Sahifa ochilishida ketma-ket chiqish */
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, ease: EASE, delay },
        };

  return (
    <section id="hero" className="relative pt-32 sm:pt-36 lg:pt-40 pb-20 sm:pb-24 overflow-hidden lp-mesh">
      <div className="absolute inset-0 lp-grid pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Chap ustun — matn */}
          <div className="lg:col-span-6 space-y-7 text-left">
            <motion.div
              {...rise(0)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 backdrop-blur border border-primary-100 text-xs text-primary-700 font-bold uppercase tracking-wider"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary-600" />
              <span>{c.hero.badge}</span>
            </motion.div>

            <motion.h1
              {...rise(0.06)}
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight text-slate-900 leading-[1.08] lp-balance"
            >
              {c.hero.titleBefore}
              <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent">
                {c.hero.titleAccent}
              </span>
              {c.hero.titleAfter}
            </motion.h1>

            <motion.p {...rise(0.12)} className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
              {c.hero.sub}
            </motion.p>

            <motion.div {...rise(0.18)} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <PrimaryButton
                onClick={onOpenDemoModal}
                className="group text-base"
                icon={<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              >
                {c.hero.ctaPrimary}
              </PrimaryButton>
              <SecondaryButton onClick={() => scrollToSection("showcase")} className="text-base">
                {c.hero.ctaSecondary}
              </SecondaryButton>
            </motion.div>

            <motion.ul {...rise(0.24)} className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {c.hero.micro.map((m) => (
                <li key={m} className="flex items-center gap-1.5 text-xs sm:text-[13px] text-slate-500 font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {m}
                </li>
              ))}
            </motion.ul>

            <motion.div {...rise(0.3)} className="pt-7 border-t border-slate-200/80 grid grid-cols-3 gap-3 sm:gap-6">
              {c.hero.stats.map((s, i) => {
                const Icon = STAT_ICONS[i] ?? Building2;
                return (
                  <div key={s.label} className="flex items-center gap-2.5 sm:gap-3">
                    {/* Telefon ekranida ikonka joyni yeydi — raqam va izoh muhimroq */}
                    <div className="hidden sm:flex w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center text-primary-600 shrink-0 shadow-sm">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg sm:text-xl font-extrabold text-slate-900 leading-none">
                        <CountUp value={s.value} suffix={s.suffix} format={fmt} />
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-1 leading-tight">
                        {s.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* O'ng ustun — mahsulot skrinshoti */}
          <motion.div
            className="lg:col-span-6 relative"
            initial={reduce ? false : { opacity: 0, y: 34 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          >
            <div className="relative mx-auto max-w-xl lg:max-w-none">
              <div
                className="absolute -inset-6 bg-primary-500/10 rounded-[2.5rem] blur-2xl -z-10"
                aria-hidden="true"
              />

              <BrowserFrame
                image="dashboard"
                alt={c.hero.alt}
                priority
                urlBar="app.dentacrm.uz / dashboard"
                className="lg:-rotate-1"
              />

              {/* Suzuvchi karta — SMS eslatma */}
              <div className="hidden sm:flex lp-float absolute -bottom-6 -left-4 lg:-left-10 max-w-[16rem] lp-glass rounded-2xl p-3.5 items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-800 leading-snug">{c.hero.cardSms}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{c.hero.cardSmsTime}</p>
                </div>
              </div>

              {/* Suzuvchi karta — bugungi tushum */}
              <div className="hidden lg:block lp-float-slow absolute -top-6 -right-4 lp-glass rounded-2xl p-3.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {c.hero.cardRevenueLabel}
                </p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{c.hero.cardRevenueValue}</p>
                <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-0.5">
                  <TrendingUp className="w-3 h-3" />
                  {c.hero.cardRevenueDelta}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
