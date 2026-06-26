import React from "react";
import { Sparkles, ArrowRight, ShieldCheck, Users, TrendingUp, Calendar, Zap } from "lucide-react";

interface HeroProps {
  onOpenDemoModal: () => void;
  scrollToSection: (id: string) => void;
}

export default function Hero({ onOpenDemoModal, scrollToSection }: HeroProps) {
  return (
    <section id="hero" className="relative pt-40 pb-28 overflow-hidden bg-slate-50 border-b border-slate-200">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10"></div>
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl -z-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

          {/* Hero Left Content */}
          <div className="lg:col-span-7 space-y-8 text-left">

            {/* Promo Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-700 font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span>Stomatologiyalar uchun #1 SaaS yechimi</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
              Klinikangizni <br />
              <span className="text-blue-600">
                aqlli boshqaruv
              </span> tizimiga o'tkazing
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
              Navbatlarni kamaytiring, daromadni nazorat qiling va mijozlar bazasini avtomatlashtiring. Elektron tish xaritasi, SMS-eslatmalar va Telegram-bot yordamida bemorlar oqimini 35% ga oshiring.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button
                onClick={onOpenDemoModal}
                className="group px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Demoni boshlash</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => scrollToSection("demo-dashboard")}
                className="px-8 py-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Taqdimotni ko'rish</span>
              </button>
            </div>

            {/* Quick Badges */}
            <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">30+</div>
                  <div className="text-xs text-slate-500 font-medium">Faol klinikalar</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">4k+</div>
                  <div className="text-xs text-slate-500 font-medium">Bemorlar</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">30%</div>
                  <div className="text-xs text-slate-500 font-medium">Daromad o'sishi</div>
                </div>
              </div>
            </div>

          </div>

          {/* Hero Right Visual Column */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">

              {/* Outer decorative glowing borders */}
              <div className="absolute inset-0 bg-blue-500/10 rounded-3xl opacity-50 blur-xl"></div>

              {/* Main Illustration Device Mockup */}
              <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl overflow-hidden">

                {/* Simulated Web App Bar */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                  <div className="flex space-x-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono tracking-wider bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                    dentacrm.uz/dashboard
                  </div>
                  <div className="w-5 h-5"></div>
                </div>

                {/* Dashboard Widget Preview */}
                <div className="space-y-4">

                  {/* Doctor Schedule Card */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-semibold text-slate-700">Shifokor Jadvali (Bugun)</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[10px] text-emerald-800 font-semibold">98% bandlik</span>
                    </div>

                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200/60 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">Dr. Azimov S. (Terapevt)</p>
                          <p className="text-[10px] text-slate-500">Bemor: Jamoliddin R. - 14:00</p>
                        </div>
                        <span className="px-2 py-1 rounded bg-blue-50 text-[10px] text-blue-600 font-semibold">Plombalash</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200/60 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">Dr. Umarova N. (Ortodont)</p>
                          <p className="text-[10px] text-slate-500">Bemor: Sevara Aliyeva - 15:30</p>
                        </div>
                        <span className="px-2 py-1 rounded bg-teal-50 text-[10px] text-teal-700 font-semibold">Breket sozlash</span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Quick Card */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Bugungi Tushum</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">4.2M UZS</p>
                      <span className="text-[9px] text-emerald-600 font-semibold">+15% ko'rsatkich</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Navbatdagi Bemorlar</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">14 ta faol</p>
                      <span className="text-[9px] text-blue-600 font-semibold">Kutish: 8 daqiqa</span>
                    </div>
                  </div>

                  {/* Automated Notification Simulator */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex-1 text-xs text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Avtomatik eslatma yuborildi</span>
                        <span className="text-[10px] text-slate-400">1 daq oldin</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">"Hurmatli Sardor aka, soat 11:00 dagi qabulga kutamiz." - <b>Kelishi tasdiqlandi ✓</b></p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Floating Element - Satisfied Patients Badge */}
              <div className="absolute -bottom-5 -left-5 bg-white border border-slate-200 rounded-2xl p-3 shadow-xl flex items-center space-x-2.5 backdrop-blur-sm">
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-blue-600 border border-white flex items-center justify-center text-[9px] font-bold text-white">U</div>
                  <div className="w-7 h-7 rounded-full bg-teal-500 border border-white flex items-center justify-center text-[9px] font-bold text-white">A</div>
                  <div className="w-7 h-7 rounded-full bg-pink-500 border border-white flex items-center justify-center text-[9px] font-bold text-white">S</div>
                </div>
                <div className="text-[10px] text-slate-700 font-medium text-left">
                  <p className="font-bold text-slate-900">30+ Stomatologiyalar</p>
                  <p className="text-slate-400 text-[9px]">DentaCRM da ishlamoqda</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
