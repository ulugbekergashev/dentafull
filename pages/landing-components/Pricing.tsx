import React, { useState } from "react";
import { Check, Info, ShieldCheck } from "lucide-react";

interface PricingProps {
  onOpenDemoModal: () => void;
}

export default function Pricing({ onOpenDemoModal }: PricingProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");

  const plans = [
    {
      name: "Individual",
      desc: "Yakka tartibda ishlayotgan stomatolog shifokorlar uchun.",
      monthlyPrice: 190000,
      annualPrice: 152000,
      popular: false,
      features: [
        "1 ta shifokor hisobi",
        "Telegram bot integratsiyasi",
        "Tizimni o'rnatib berish",
        "Xodimlarni o'qitish",
        "7 kunlik bepul sinov (Freemium)"
      ]
    },
    {
      name: "Start",
      desc: "Kichik va o'rta klinikalar uchun — to'liq imkoniyatlar.",
      monthlyPrice: 290000,
      annualPrice: 232000,
      popular: false,
      features: [
        "3 tagacha shifokor hisobi",
        "Telegram bot integratsiyasi",
        "Tizimni o'rnatib berish",
        "Xodimlarni o'qitish",
        "7 kunlik bepul sinov (Freemium)"
      ]
    },
    {
      name: "Pro",
      desc: "Ko'p shifokorli va rivojlangan klinikalar uchun.",
      monthlyPrice: 590000,
      annualPrice: 472000,
      popular: true,
      features: [
        "10 tagacha shifokor hisobi",
        "Telegram bot integratsiyasi",
        "Tizimni o'rnatib berish",
        "Xodimlarni o'qitish",
        "7 kunlik bepul sinov (Freemium)"
      ]
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-slate-900 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/40 pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-400 uppercase tracking-widest">
            Shaffof Tariflar
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Klinikangiz Hajmiga Mos To'lovlar
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Hech qanday yashirin to'lovlarsiz shaffof xizmat haqi. Yillik to'lov bilan <b>20% gacha mablag'ni tejang</b> va bepul o'rnatib berish xizmatidan foydalaning.
          </p>

          {/* Cycle Toggle Switch */}
          <div className="pt-6 flex items-center justify-center">
            <div className="bg-slate-950 p-1 rounded-2xl border border-slate-800 flex items-center gap-1.5">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  billingCycle === "monthly"
                    ? "bg-slate-900 text-white border border-slate-800"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Oylik To'lov
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === "annual"
                    ? "bg-gradient-to-r from-cyan-500 to-indigo-500 text-white border border-cyan-400/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Yillik To'lov 
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-[9px] text-emerald-400 font-extrabold uppercase animate-pulse">
                  -20%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          {plans.map((plan, i) => {
            const price = billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const savings = (plan.monthlyPrice - plan.annualPrice) * 12;

            return (
              <div
                key={i}
                className={`relative bg-slate-950 rounded-3xl p-6 sm:p-8 flex flex-col justify-between text-left border transition-all duration-300 ${
                  plan.popular
                    ? "border-cyan-500/60 shadow-xl shadow-cyan-500/[0.03] scale-102 lg:-translate-y-2 z-10"
                    : "border-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-slate-950/20"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-cyan-500 to-indigo-500 text-[10px] text-white font-extrabold rounded-full uppercase tracking-wider shadow-md">
                    O'TA OMMABOP • TAVSIYA ETILADI
                  </span>
                )}

                {/* Card Top */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-normal">{plan.desc}</p>
                  </div>

                  {/* Price info */}
                  <div className="py-2.5">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
                      {price.toLocaleString("uz-UZ")}
                    </span>
                    <span className="text-xs text-slate-500 font-sans ml-1">UZS / oy</span>
                    
                    {billingCycle === "annual" ? (
                      <p className="text-[10px] text-emerald-400 font-semibold mt-1.5 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Yiliga {savings.toLocaleString("uz-UZ")} UZS tejaladi (yillik hisoblanadi)
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500 mt-1.5">
                        Xohlagan paytda to'xtatish yoki tarifni o'zgartirish mumkin.
                      </p>
                    )}
                  </div>

                  {/* Feature Checkboxes */}
                  <div className="border-t border-slate-900 pt-6">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">TARIF TARKIBI:</p>
                    <ul className="space-y-3.5">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start space-x-3 text-xs text-slate-300">
                          <div className="w-4.5 h-4.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0 text-cyan-400 mt-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                          <span className="leading-normal">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="pt-8 border-t border-slate-900 mt-8">
                  <button
                    onClick={onOpenDemoModal}
                    className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer text-center ${
                      plan.popular
                        ? "bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white shadow-lg shadow-cyan-500/10"
                        : "bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-300"
                    }`}
                  >
                    Bepul Sinab Ko'rishni Boshlash
                  </button>
                  <p className="text-[9px] text-center text-slate-600 mt-2.5">
                    Kartasiz faollashtirish • 7 kunlik to'liq test rejimi
                  </p>
                </div>

              </div>
            );
          })}
        </div>

        {/* Dynamic Trust Badge */}
        <div className="mt-16 p-4 bg-slate-950/60 border border-slate-800 rounded-3xl max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between text-left gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">100% Qoniqish Kafolati</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Agar dastur yoqmasa, birinchi 30 kun ichida to'lov to'liq qaytariladi. Hech qanday shartlarsiz.</p>
            </div>
          </div>
          <button
            onClick={onOpenDemoModal}
            className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-850 cursor-pointer transition-all shrink-0"
          >
            Yordam va Konsultatsiya
          </button>
        </div>

      </div>
    </section>
  );
}
