import React, { useState } from "react";
import { TrendingUp, Clock, Hourglass, Landmark, HelpCircle } from "lucide-react";

export default function RoiCalculator() {
  const [doctorsCount, setDoctorsCount] = useState(4);
  const [dailyPatients, setDailyPatients] = useState(6);

  // Constants for calculation (realistic clinic estimations)
  const workingDays = 26; // monthly
  const monthlyPatients = doctorsCount * dailyPatients * workingDays;
  
  // 1. Time saved: 45 minutes saved per patient in administrative tasks (EHR notes, invoicing, recalls, reminders)
  const timeSavedHours = Math.round((monthlyPatients * 25) / 60);

  // 2. Revenue recovered: 12% of patients usually forget appointments, with DentaCRM recall SMS and bot, we recover 70% of them.
  // Average check size: 300,000 UZS
  const recoveredPatients = Math.round(monthlyPatients * 0.12 * 0.70);
  const recoveredRevenue = recoveredPatients * 300000;

  // 3. Billing efficiency: 8% increase in overall clinic billing due to accurate material consumption & procedure logging
  const billValueAdded = Math.round(monthlyPatients * 300000 * 0.08);

  const totalMonthlyGain = recoveredRevenue + billValueAdded;

  return (
    <section id="calculator" className="py-24 bg-slate-50 relative border-b border-slate-200">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-100/20 via-transparent to-slate-100/20 pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="px-3 py-1 rounded-full bg-blue-100 border border-blue-200 text-xs font-bold text-blue-800 uppercase tracking-widest">
            Moliyaviy Samara Kalkulyatori
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            DentaCRM Qancha Foyda Keltiradi?
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Klinikangiz o'lchamlarini kiriting va DentaCRM orqali qancha vaqt va mablag' tejashingiz mumkinligini real hisob-kitoblar misolida ko'ring.
          </p>
        </div>

        {/* Calculator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          
          {/* Controls Panel (Col span 5) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-center space-y-8 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider text-left">Klinika Ma'lumotlari</h3>

            {/* Doctor count slider */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-600">Shifokorlar soni:</span>
                <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg font-bold text-blue-700 font-mono">
                  {doctorsCount} ta shifokor
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                value={doctorsCount}
                onChange={(e) => setDoctorsCount(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1 ta</span>
                <span>12 ta</span>
                <span>25 ta</span>
              </div>
            </div>

            {/* Daily patients slider */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-600">Kunlik bemorlar (shifokor boshiga):</span>
                <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-lg font-bold text-indigo-700 font-mono">
                  {dailyPatients} ta bemor
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                value={dailyPatients}
                onChange={(e) => setDailyPatients(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1 ta</span>
                <span>8 ta</span>
                <span>15 ta</span>
              </div>
            </div>

            {/* Quick calculations basis indicator */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed text-left">
              * Hisob-kitoblar tish klinikalari o'rtacha statistikasi asosida tuzilgan: ish kunlari: 26 kun/oy, o'rtacha davolash cheki: 300,000 UZS, eslatmalarsiz bemorlar kelmasligi: 12%.
            </div>

          </div>

          {/* Results Panel (Col span 7) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch">
            
            {/* Hour saved card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between text-left group hover:border-slate-300 transition-colors shadow-sm">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Tejalgan Qog'ozbozlik Vaqti</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Sarf materiallari hisoboti, retseptlar va ma'lumotlarni avtomatlashtirish orqali tejaladigan oylik vaqt.</p>
                </div>
              </div>
              <div className="mt-8">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono block">
                  ~{timeSavedHours} soat <span className="text-xs text-slate-400 font-sans font-normal">/ oy</span>
                </span>
                <span className="text-[10px] text-emerald-600 font-bold mt-1 block">Xodimlarning 4 ta to'liq ish kuni</span>
              </div>
            </div>

            {/* Recovered patients card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between text-left group hover:border-slate-300 transition-colors shadow-sm">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Qaytarilgan Bemorlar Soni</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Avtomatik SMS recall va Telegram bot eslatmalari orqali esdan chiqqan yoki kelmagan qayta davolanish oqimi.</p>
                </div>
              </div>
              <div className="mt-8">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono block">
                  +{recoveredPatients} bemor <span className="text-xs text-slate-400 font-sans font-normal">/ oy</span>
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">Tushum: +{(recoveredRevenue).toLocaleString("uz-UZ")} UZS</span>
              </div>
            </div>

            {/* Big Revenue card (Spans 2 columns on SM if grid, otherwise block) */}
            <div className="sm:col-span-2 bg-gradient-to-br from-blue-50/50 to-indigo-50 border border-blue-200 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between text-left gap-6 shadow-sm">
              <div className="space-y-3 max-w-md">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700">
                  <Landmark className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Umumiy Qo'shimcha Foyda</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">Klinikadagi qaytarilgan bemorlar, aniq material hisobi va yo'qotilgan aloqalarni qayta tiklash orqali oyiga hosil bo'ladigan qo'shimcha tushum.</p>
                </div>
              </div>

              <div className="shrink-0 text-center sm:text-right space-y-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-blue-800 font-mono block">
                  +{totalMonthlyGain.toLocaleString("uz-UZ")} UZS
                </span>
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">HAR OY QO'SHIMCHA DAROMAD</span>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-[10px] text-blue-800 font-bold inline-block mt-2">DentaCRM narxidan 20 barobar ko'p</span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
