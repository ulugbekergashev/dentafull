import React, { useState } from "react";
import { Check, Info, Users, ArrowRight } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal, RevealGroup, RevealItem, PrimaryButton, SecondaryButton } from "./ui";

interface PricingProps {
  onOpenDemoModal: () => void;
}

/**
 * Tariflar. Backend faqat shifokor hisoblari sonini cheklaydi —
 * shuning uchun landing ham aynan shuni ko'rsatadi: modullar ro'yxati
 * hamma tarif uchun bitta, kartalarda takrorlanmaydi.
 */
const PLANS = [
  { key: "individual", seats: 1, monthly: 190000, annual: 152000, popular: false },
  { key: "start", seats: 3, monthly: 290000, annual: 232000, popular: false },
  { key: "pro", seats: 10, monthly: 590000, annual: 472000, popular: true },
];

export default function Pricing({ onOpenDemoModal }: PricingProps) {
  const { c, fmt } = useLandingCopy();
  const [annual, setAnnual] = useState(true);

  return (
    <Section id="pricing" bg="slate" border>
      <SectionHeader badge={c.pricing.badge} title={c.pricing.title} subtitle={c.pricing.sub} className="mb-8" />

      {/* Oylik / yillik almashtirgich */}
      <Reveal className="flex justify-center mb-12" y={12}>
        <div
          role="group"
          aria-label={c.pricing.badge}
          className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white border border-slate-200 shadow-sm"
        >
          <button
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
              !annual ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {c.pricing.monthly}
          </button>
          <button
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              annual ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {c.pricing.annual}
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                annual ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {c.pricing.saveBadge}
            </span>
          </button>
        </div>
      </Reveal>

      {/* Tarif kartalari */}
      <RevealGroup className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch max-w-5xl mx-auto" stagger={0.08}>
        {PLANS.map((plan) => {
          const meta = c.pricing.plans.find((p) => p.key === plan.key)!;
          const price = annual ? plan.annual : plan.monthly;
          const savings = (plan.monthly - plan.annual) * 12;

          return (
            <RevealItem key={plan.key} className="h-full">
              <div
                className={`relative h-full rounded-3xl p-6 sm:p-7 flex flex-col justify-between text-left transition-all duration-300 ${
                  plan.popular
                    ? "bg-primary-900 text-white shadow-2xl shadow-primary-900/25 lg:-translate-y-3 z-10"
                    : "bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary-500 text-[10px] text-white font-extrabold rounded-full uppercase tracking-wider shadow-md whitespace-nowrap">
                    {c.pricing.popular}
                  </span>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className={`text-lg font-extrabold ${plan.popular ? "text-white" : "text-slate-900"}`}>
                      {meta.name}
                    </h3>
                    <p className={`text-xs mt-1 leading-normal ${plan.popular ? "text-primary-200" : "text-slate-500"}`}>
                      {meta.desc}
                    </p>
                  </div>

                  <div>
                    <span className={`text-3xl sm:text-4xl font-extrabold ${plan.popular ? "text-white" : "text-slate-900"}`}>
                      {fmt(price)}
                    </span>
                    <span className={`text-xs ml-1.5 ${plan.popular ? "text-primary-200" : "text-slate-500"}`}>
                      {c.pricing.perMonth}
                    </span>

                    {annual ? (
                      <p
                        className={`text-[11px] font-semibold mt-2 flex items-start gap-1.5 ${
                          plan.popular ? "text-primary-200" : "text-emerald-600"
                        }`}
                      >
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {c.pricing.annualNote(fmt(savings))}
                      </p>
                    ) : (
                      <p className={`text-[11px] mt-2 ${plan.popular ? "text-primary-200" : "text-slate-500"}`}>
                        {c.pricing.monthlyNote}
                      </p>
                    )}
                  </div>

                  {/* Yagona farq — shifokor hisoblari soni */}
                  <div
                    className={`flex items-center gap-3 rounded-2xl p-4 ${
                      plan.popular ? "bg-white/10" : "bg-primary-50 border border-primary-100"
                    }`}
                  >
                    <Users className={`w-5 h-5 shrink-0 ${plan.popular ? "text-primary-200" : "text-primary-600"}`} />
                    <span className={`text-sm font-bold ${plan.popular ? "text-white" : "text-primary-800"}`}>
                      {c.pricing.seats(plan.seats)}
                    </span>
                  </div>
                </div>

                <div className="pt-7">
                  <button
                    onClick={onOpenDemoModal}
                    className={`w-full py-3.5 min-h-[48px] rounded-xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 ${
                        plan.popular
                          ? "bg-white text-primary-800 hover:bg-primary-50"
                          : "bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-500/20"
                      }`}
                  >
                    {c.pricing.cta}
                  </button>
                  <p className={`text-[10px] text-center mt-2.5 ${plan.popular ? "text-primary-300" : "text-slate-400"}`}>
                    {c.pricing.ctaNote}
                  </p>
                </div>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>

      {/* Hamma tarifga kiradigan imkoniyatlar — bir marta, takrorlanmaydi */}
      <Reveal className="mt-12 max-w-5xl mx-auto">
        <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-5">
            {c.pricing.includedTitle}
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {c.pricing.included.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-600" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* Katta klinikalar */}
      <Reveal className="mt-6 max-w-5xl mx-auto">
        <div className="rounded-3xl bg-slate-900 p-6 sm:p-7 flex flex-col md:flex-row items-center justify-between gap-5 text-left">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">{c.pricing.enterpriseTitle}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{c.pricing.enterpriseDesc}</p>
          </div>
          <SecondaryButton
            onClick={onOpenDemoModal}
            className="shrink-0"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            {c.pricing.enterpriseCta}
          </SecondaryButton>
        </div>
      </Reveal>

      {/* Mobil ekranda asosiy harakat takrorlanadi */}
      <Reveal className="mt-8 flex lg:hidden justify-center">
        <PrimaryButton onClick={onOpenDemoModal} full className="max-w-sm">
          {c.pricing.cta}
        </PrimaryButton>
      </Reveal>
    </Section>
  );
}
